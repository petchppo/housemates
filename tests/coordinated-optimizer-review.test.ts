import assert from "node:assert/strict";
import test from "node:test";
import { APPLIMON_IDS, createDemoApplimon, type ApplimonDevice } from "../src/domain/applimon-catalog";
import { optimizeCoordinatedApplimons } from "../src/domain/coordinated-optimization";
import { buildCoordinatedContext } from "../src/domain/household-optimization";
import { buildDemoScenario, DEFAULT_DEMO_PROFILE } from "../src/domain/demo";
import { createSyntheticWeather } from "../src/domain/demo-weather";
import type { HourlyEnergy } from "../src/domain/energy";
import type { OptimizationMode } from "../src/domain/scheduling";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const device = (id: ApplimonDevice["id"], power: number, duration: number, latest = 3): ApplimonDevice => ({
  ...createDemoApplimon(id), ratedPowerW: power * 1000, energyKwh: power * duration, durationHours: duration,
  earliestStartHour: 0, latestStartHour: latest, deadlineHour: 6, baselineStartHour: 0,
});
type Choice = { start: number; end: number; power: number; cost: number; carbon: number };

/** Independent exhaustive oracle: directly integrates constant-power jobs over tariff
 * hours, then checks every start/end/hour breakpoint. It never calls the candidate
 * generator or copies the branch-and-bound pruning algorithm. */
function oracle(devices: ApplimonDevice[], rates: HourlyEnergy[], background: number[], cap: number, mode: OptimizationMode) {
  const options = devices.map(d => Array.from({ length: d.latestStartHour - d.earliestStartHour + 1 }, (_, index) => {
    const start = d.earliestStartHour + index, end = start + d.durationHours, power = d.energyKwh / d.durationHours;
    let cost = 0, carbon = 0;
    for (let hour = start; hour < end; hour++) {
      const energy = power * Math.min(1, end - hour);
      cost += energy * rates[hour % 24].priceUsdPerKwh;
      carbon += energy * rates[hour % 24].carbonGramsPerKwh;
    }
    return { start, end, power, cost, carbon };
  }).filter(c => c.end <= d.deadlineHour));
  const minCost = options.reduce((sum, rows) => sum + Math.min(...rows.map(r => r.cost)), 0);
  const minCarbon = options.reduce((sum, rows) => sum + Math.min(...rows.map(r => r.carbon)), 0);
  const costRange = options.reduce((sum, rows) => sum + Math.max(...rows.map(r => r.cost)) - Math.min(...rows.map(r => r.cost)), 0);
  const carbonRange = options.reduce((sum, rows) => sum + Math.max(...rows.map(r => r.carbon)) - Math.min(...rows.map(r => r.carbon)), 0);
  const combinations: Choice[][] = [];
  function expand(index: number, selected: Choice[]) {
    if (index < options.length) { for (const choice of options[index]) expand(index + 1, [...selected, choice]); return; }
    const points = [...Array.from({ length: 48 }, (_, h) => h), ...selected.flatMap(c => [c.start, c.end])];
    if (points.some(t => t < 48 && background[Math.floor(t)] + selected.reduce((sum, c) => sum + (c.start <= t && t < c.end ? c.power : 0), 0) > cap + 1e-9)) return;
    combinations.push(selected);
  }
  expand(0, []);
  const totals = (rows: Choice[]) => ({ cost: rows.reduce((s, c) => s + c.cost, 0), carbon: rows.reduce((s, c) => s + c.carbon, 0) });
  const keys = (rows: Choice[]) => {
    const { cost, carbon } = totals(rows);
    const balanced = .5 * (costRange > 1e-9 ? (cost - minCost) / costRange : 0) + .5 * (carbonRange > 1e-9 ? (carbon - minCarbon) / carbonRange : 0);
    return [...(mode === "cost" ? [cost, carbon] : mode === "carbon" ? [carbon, cost] : [balanced, cost, carbon]), ...rows.map(c => c.start)];
  };
  combinations.sort((a, b) => { const ak = keys(a), bk = keys(b); for (let i = 0; i < ak.length; i++) if (Math.abs(ak[i] - bk[i]) > 1e-9) return ak[i] - bk[i]; return 0; });
  return combinations[0] ? { choices: combinations[0], ...totals(combinations[0]) } : null;
}

test("independent exhaustive oracle agrees across joint fractional-load tradeoffs, negative prices and all objectives", () => {
  const devices = [device("spin", .8, .5), device("tumble", 1.1, 1.5), device("misty", .5, 2)];
  for (let seed = 0; seed < 24; seed++) {
    const rates = Array.from({ length: 24 }, (_, hour) => ({ hour, priceUsdPerKwh: ((hour * 13 + seed * 7) % 17 - 5) / 20, carbonGramsPerKwh: (hour * 37 + seed * 19) % 500 }));
    const background = Array.from({ length: 48 }, (_, h) => ((h + seed) % 4) * .1);
    const cap = 1.2 + (seed % 4) * .3;
    for (const mode of ["cost", "carbon", "balanced"] as const) {
      const expected = oracle(devices, rates, background, cap, mode);
      const actual = optimizeCoordinatedApplimons({ inventory: devices, energyProfile: rates, backgroundPowerKw: background, modeledPowerLimitKw: cap, mode });
      assert.equal(actual.status, expected ? "feasible" : "infeasible", `seed ${seed} / ${mode}`);
      if (!expected) continue;
      assert.equal(actual.solver.optimal, true);
      assert.deepEqual(actual.schedules.map(s => s.startHour), expected.choices.map(s => s.start));
      near(actual.proposed!.costUsd, expected.cost); near(actual.proposed!.carbonGrams, expected.carbon);
      assert.ok(actual.peakModeledPowerKw! <= cap + 1e-9);
    }
  }
});

test("fractional jobs cannot use hourly-average energy to evade an instantaneous power budget", () => {
  const inventory = [device("spin", 1, .25, 0), device("tumble", 1, .25, 0)];
  const rates = Array.from({ length: 24 }, (_, hour) => ({ hour, priceUsdPerKwh: .2, carbonGramsPerKwh: 100 }));
  const result = optimizeCoordinatedApplimons({ inventory, energyProfile: rates, mode: "cost", modeledPowerLimitKw: 1.5 });
  assert.equal(result.status, "infeasible"); assert.deepEqual(result.schedules, []);
});

test("an exhausted search discards even a feasible incumbent instead of claiming optimality or infeasibility", () => {
  const inventory = [device("spin", 1, 1, 2)];
  const rates = Array.from({ length: 24 }, (_, hour) => ({ hour, priceUsdPerKwh: .2, carbonGramsPerKwh: 100 }));
  const limited = optimizeCoordinatedApplimons({ inventory, energyProfile: rates, mode: "cost", maxSearchNodes: 2 });
  assert.equal(limited.status, "search-limit"); assert.equal(limited.solver.optimal, false);
  assert.equal(limited.proposed, null); assert.equal(limited.comparison, null); assert.deepEqual(limited.schedules, []);
  const complete = optimizeCoordinatedApplimons({ inventory, energyProfile: rates, mode: "balanced" });
  assert.equal(complete.status, "feasible"); assert.equal(complete.schedules[0].startHour, 0);
  assert.deepEqual(complete.solver.normalization, { costRangeUsd: 0, carbonRangeGrams: 0 });
});

test("weather affects real headroom while protected cooling and flexible task energy remain unchanged", () => {
  const spin = { ...device("spin", 1, 1, 11), earliestStartHour: 9, deadlineHour: 12, baselineStartHour: 9 };
  const profile = { ...DEFAULT_DEMO_PROFILE, applianceIds: ["chill" as const], applimons: [createDemoApplimon("chill"), spin] };
  const mild = createSyntheticWeather("california");
  mild.hourly = mild.hourly.map(h => ({ ...h, temperatureC: 22, humidityPercent: 40 }));
  const hot = structuredClone(mild); hot.hourly[10].temperatureC = 38;
  const before = buildCoordinatedContext(buildDemoScenario(profile, mild)), after = buildCoordinatedContext(buildDemoScenario(profile, hot));
  const rates = Array.from({ length: 24 }, (_, hour) => ({ hour, priceUsdPerKwh: hour === 10 ? .01 : .3, carbonGramsPerKwh: 100 }));
  const a = optimizeCoordinatedApplimons({ ...before, energyProfile: rates, mode: "cost", modeledPowerLimitKw: 1.2 });
  const b = optimizeCoordinatedApplimons({ ...after, energyProfile: rates, mode: "cost", modeledPowerLimitKw: 1.2 });
  assert.equal(a.status, "feasible"); assert.equal(b.status, "feasible");
  assert.equal(a.schedules[0].startHour, 10); assert.notEqual(b.schedules[0].startHour, 10);
  near(a.proposed!.energyKwh, b.proposed!.energyKwh);
  assert.deepEqual(a.protectedIds, ["chill"]); assert.deepEqual(b.protectedIds, ["chill"]);
  assert.equal(b.schedules.some(s => s.applianceId === "chill"), false);
  assert.equal(optimizeCoordinatedApplimons({ ...after, energyProfile: rates, mode: "cost" }).schedules[0].startHour, 10, "Fixed background without a cap cannot alter the objective");
});

test("all ten devices remain represented once, with protected and fixed loads excluded from flexible savings", () => {
  const inventory = APPLIMON_IDS.map(createDemoApplimon);
  const snapshot = JSON.stringify(inventory);
  const rates = Array.from({ length: 24 }, (_, hour) => ({ hour, priceUsdPerKwh: .2, carbonGramsPerKwh: 100 }));
  const result = optimizeCoordinatedApplimons({ inventory, energyProfile: rates, mode: "balanced" });
  assert.equal(result.status, "feasible"); assert.equal(result.appliances.length, 10);
  assert.deepEqual(result.schedules.map(s => s.applianceId), ["evie", "bubbles", "spin", "tumble", "misty", "rover"]);
  assert.deepEqual(result.protectedIds, ["chill", "ember", "frost"]);
  assert.deepEqual(result.unchangedSchedules.map(s => s.applianceId), ["breeze"]);
  near(result.comparison!.costSavingsUsd, 0); near(result.comparison!.carbonReductionGrams, 0);
  assert.equal(JSON.stringify(inventory), snapshot, "Search must not mutate original settings");
});
