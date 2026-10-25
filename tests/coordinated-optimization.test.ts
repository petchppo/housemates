import assert from "node:assert/strict";
import test from "node:test";
import { APPLIMON_IDS, createDemoApplimon, type ApplimonDevice, type ApplimonId } from "../src/domain/applimon-catalog";
import { getApplimonSchedulingOptions } from "../src/domain/applimon-planning";
import { optimizeCoordinatedApplimons, type CoordinatedOptimizationInput } from "../src/domain/coordinated-optimization";
import { buildDemoScenario, buildRegionEnergyProfile, DEFAULT_DEMO_PROFILE } from "../src/domain/demo";
import { createSyntheticWeather } from "../src/domain/demo-weather";
import { defaultSchedulingRequests } from "../src/data/scheduling";
import { getSchedulingOptions, type OptimizationMode, type SchedulingRequest } from "../src/domain/scheduling";
import type { HourlyEnergy } from "../src/domain/energy";

const profile = (prices = [1, 2, 3], carbon = [30, 20, 10]): HourlyEnergy[] => Array.from({ length: 24 }, (_, hour) => ({ hour, priceUsdPerKwh: prices[hour] ?? 20, carbonGramsPerKwh: carbon[hour] ?? 100 }));
const device = (id: ApplimonId, changes: Partial<ApplimonDevice> = {}): ApplimonDevice => ({ ...createDemoApplimon(id), ratedPowerW: 1000, energyKwh: 1, durationHours: 1, earliestStartHour: 0, latestStartHour: 2, deadlineHour: 3, baselineStartHour: 0, ...changes });
const solve = (inventory: ApplimonDevice[], extras: Partial<CoordinatedOptimizationInput> = {}) => optimizeCoordinatedApplimons({ inventory, energyProfile: profile(), mode: "cost", ...extras });

function oracle(input: CoordinatedOptimizationInput) {
  const rows = (input.inventory as ApplimonDevice[]).map(item => getApplimonSchedulingOptions(item, input.energyProfile).options);
  const combinations: { starts: number[]; cost: number; carbon: number; score: number }[] = [];
  function enumerate(index: number, selected: typeof rows[number]) {
    if (index < rows.length) { for (const option of rows[index]) enumerate(index + 1, [...selected, option]); return; }
    for (let hour = 0; hour < 48; hour++) {
      const power = selected.reduce((sum, schedule) => sum + schedule.intervals.filter(row => row.hour === hour).reduce((total, row) => total + row.powerKw, 0), input.backgroundPowerKw?.[hour] ?? 0);
      if (input.modeledPowerLimitKw !== undefined && power > input.modeledPowerLimitKw + 1e-9) return;
    }
    combinations.push({ starts: selected.map(item => item.startHour), cost: selected.reduce((sum, item) => sum + item.costUsd, 0), carbon: selected.reduce((sum, item) => sum + item.carbonGrams, 0), score: 0 });
  }
  enumerate(0, []);
  const minCost = rows.reduce((sum, options) => sum + Math.min(...options.map(row => row.costUsd)), 0);
  const rangeCost = rows.reduce((sum, options) => sum + Math.max(...options.map(row => row.costUsd)) - Math.min(...options.map(row => row.costUsd)), 0);
  const minCarbon = rows.reduce((sum, options) => sum + Math.min(...options.map(row => row.carbonGrams)), 0);
  const rangeCarbon = rows.reduce((sum, options) => sum + Math.max(...options.map(row => row.carbonGrams)) - Math.min(...options.map(row => row.carbonGrams)), 0);
  for (const row of combinations) row.score = .5 * (rangeCost ? (row.cost - minCost) / rangeCost : 0) + .5 * (rangeCarbon ? (row.carbon - minCarbon) / rangeCarbon : 0);
  combinations.sort((a, b) => {
    const left = input.mode === "cost" ? [a.cost, a.carbon] : input.mode === "carbon" ? [a.carbon, a.cost] : [a.score, a.cost, a.carbon];
    const right = input.mode === "cost" ? [b.cost, b.carbon] : input.mode === "carbon" ? [b.carbon, b.cost] : [b.score, b.cost, b.carbon];
    for (let i = 0; i < left.length; i++) if (Math.abs(left[i] - right[i]) > 1e-9) return left[i] - right[i];
    for (let i = 0; i < a.starts.length; i++) if (a.starts[i] !== b.starts[i]) return a.starts[i] - b.starts[i];
    return 0;
  });
  return combinations[0];
}

test("binary search matches independent exhaustive small-fixture objective and feasibility results", () => {
  for (const mode of ["cost", "carbon", "balanced"] as OptimizationMode[]) for (const cap of [undefined, 1.8, 2.6]) {
    const input: CoordinatedOptimizationInput = { inventory: [device("spin"), device("tumble", { energyKwh: .8 }), device("misty", { energyKwh: .6 })],
      energyProfile: profile([.3, -.1, .2], [5, 35, 12]), mode, modeledPowerLimitKw: cap };
    const expected = oracle(input), actual = optimizeCoordinatedApplimons(input);
    assert.equal(actual.status, expected ? "feasible" : "infeasible");
    if (!expected) continue;
    assert.equal(actual.solver.optimal, true);
    assert.deepEqual(actual.schedules.map(item => item.startHour), expected.starts);
    assert.ok(Math.abs(actual.proposed!.costUsd - expected.cost) < 1e-9);
    assert.ok(Math.abs(actual.proposed!.carbonGrams - expected.carbon) < 1e-9);
  }
});

test("cost, carbon and global balanced objectives remain distinct and dimensionally normalized", () => {
  const inventory = [device("spin")], energyProfile = profile([0, 5, 10], [10, 4, 0]);
  const plans = (["cost", "carbon", "balanced"] as const).map(mode => solve(inventory, { mode, energyProfile }));
  assert.deepEqual(plans.map(plan => plan.schedules[0].startHour), [0, 2, 1]);
  assert.deepEqual(plans[2].solver.normalization, { costRangeUsd: 10, carbonRangeGrams: 10 });
  assert.ok(Math.abs(plans[2].solver.objectiveValue! - .45) < 1e-12);
  assert.equal(plans[1].comparison!.costSavingsUsd, -10, "negative cost savings must remain visible");
});

test("joint power constraints choose a cheaper coordinated allocation than greedy individual placement", () => {
  const plan = solve([device("spin", { latestStartHour: 1 }), device("tumble", { ratedPowerW: 2000, energyKwh: 2, latestStartHour: 1 })], { energyProfile: profile([1, 10]), modeledPowerLimitKw: 2 });
  assert.equal(plan.status, "feasible");
  assert.deepEqual(plan.schedules.map(item => [item.applianceId, item.startHour]), [["spin", 1], ["tumble", 0]]);
  assert.equal(plan.proposed!.costUsd, 12);
  assert.equal(plan.baseline!.costUsd, 3);
  assert.equal(plan.baselineFeasible, false);
  assert.equal(plan.peakModeledPowerKw, 2);
});

test("fractional final hours use active power rather than energy-per-hour averages for capacity", () => {
  const inventory = [device("spin", { durationHours: 1.5, energyKwh: 1.5, latestStartHour: 0, deadlineHour: 2 }),
    device("tumble", { earliestStartHour: 1, latestStartHour: 1, deadlineHour: 2, baselineStartHour: 1 })];
  const infeasible = solve(inventory, { modeledPowerLimitKw: 1.5 });
  assert.equal(infeasible.status, "infeasible"); assert.deepEqual(infeasible.schedules, []); assert.equal(infeasible.proposed, null);
  const feasible = solve(inventory, { modeledPowerLimitKw: 2 });
  assert.equal(feasible.status, "feasible"); assert.equal(feasible.peakModeledPowerKw, 2); assert.equal(feasible.proposed!.energyKwh, 2.5);
});

test("authoritative core requests preserve negotiated windows, original baseline and varying dishwasher profile", () => {
  const original = structuredClone(defaultSchedulingRequests.find(item => item.appliance.id === "bubbles")!);
  assert.equal(original.appliance.kind, "dishwasher");
  if (original.appliance.kind !== "dishwasher") throw new Error("fixture");
  original.appliance.constraints = { ...original.appliance.constraints, earliestStartHour: 0, finishByHour: 3, cycleProfileKwh: [1.1, .1] };
  original.startWindow = { earliestHour: 0, latestHour: 1 }; original.baselineStartHour = 0;
  const before = JSON.stringify(original), energyProfile = profile([10, 1, 10]);
  const plan = solve([createDemoApplimon("bubbles")], { energyProfile, coreRequests: [original] });
  assert.equal(plan.status, "feasible");
  assert.deepEqual(plan.schedules[0], getSchedulingOptions(original, energyProfile).recommendations!.cost);
  assert.equal(plan.schedules[0].startHour, 1); assert.deepEqual(plan.schedules[0].intervals.map(item => item.energyKwh), [1.1, .1]);
  assert.ok(Math.abs(plan.baseline!.costUsd - 11.1) < 1e-9);
  assert.equal(JSON.stringify(original), before);
  assert.equal(solve([createDemoApplimon("bubbles")], { energyProfile, coreRequests: [original], modeledPowerLimitKw: 1 }).status, "infeasible");
});

test("protected appliances and fixed fan never inflate flexible savings or get rescheduled", () => {
  const inventory = [device("spin"), createDemoApplimon("chill"), createDemoApplimon("ember"), createDemoApplimon("frost"), createDemoApplimon("breeze")];
  const plan = solve(inventory);
  assert.equal(plan.status, "feasible");
  assert.deepEqual(plan.schedules.map(item => item.applianceId), ["spin"]);
  assert.deepEqual(plan.protectedIds, ["chill", "ember", "frost"]);
  assert.deepEqual(plan.unchangedSchedules.map(item => [item.applianceId, item.startHour]), [["breeze", 18]]);
  assert.equal(plan.proposed!.energyKwh, 1); assert.equal(plan.unchangedTotals!.energyKwh, .18);
  const onlyProtected = solve(inventory.slice(1, 4));
  assert.equal(onlyProtected.status, "feasible"); assert.equal(onlyProtected.solver.variableCount, 0); assert.deepEqual(onlyProtected.schedules, []);
  assert.deepEqual(onlyProtected.proposed, { energyKwh: 0, costUsd: 0, carbonGrams: 0 });
});

test("fixed fan and weather background count exactly once in capacity, never in flexible comparisons", () => {
  const background = Array<number>(48).fill(.5);
  const inventory = [device("spin", { earliestStartHour: 18, latestStartHour: 19, deadlineHour: 20, baselineStartHour: 18 }), createDemoApplimon("breeze")];
  assert.equal(solve(inventory, { backgroundPowerKw: background, modeledPowerLimitKw: 1.5 }).status, "infeasible");
  const plan = solve(inventory, { backgroundPowerKw: background, modeledPowerLimitKw: 1.55 });
  assert.equal(plan.status, "feasible"); assert.ok(Math.abs(plan.peakModeledPowerKw! - 1.545) < 1e-9);
  assert.equal(plan.proposed!.energyKwh, 1); assert.equal(plan.baseline!.energyKwh, 1);
  const impossibleBase = solve(inventory, { backgroundPowerKw: background, modeledPowerLimitKw: .4 });
  assert.equal(impossibleBase.status, "infeasible"); assert.match(impossibleBase.issues[0], /background already exceed/);
});

test("distinct day-two weather changes capacity choices without changing rates or task energy", () => {
  const inventory = [device("spin", { earliestStartHour: 23, latestStartHour: 25, deadlineHour: 27, baselineStartHour: 23 })];
  const energyProfile = profile([0, 2], [10, 10]); energyProfile[23].priceUsdPerKwh = 5;
  const background = Array<number>(48).fill(0); background[24] = 1;
  const clear = solve(inventory, { energyProfile, modeledPowerLimitKw: 1 });
  const warm = solve(inventory, { energyProfile, modeledPowerLimitKw: 1, backgroundPowerKw: background });
  assert.equal(clear.schedules[0].startHour, 24); assert.equal(warm.schedules[0].startHour, 25);
  assert.equal(clear.proposed!.energyKwh, warm.proposed!.energyKwh); assert.deepEqual(clear.baseline, warm.baseline);
  assert.equal(solve(inventory, { energyProfile, backgroundPowerKw: background }).schedules[0].startHour, 24, "without a budget background does not invent a new price signal");
});

test("ties and input permutations produce stable canonical schedules, including flat objectives", () => {
  const a = device("spin"), b = device("tumble"), energyProfile = profile(Array(24).fill(1), Array(24).fill(10));
  for (const mode of ["cost", "carbon", "balanced"] as const) {
    const forward = solve([a, b], { mode, energyProfile, modeledPowerLimitKw: 1 });
    const reverse = solve([b, a], { mode, energyProfile, modeledPowerLimitKw: 1 });
    assert.deepEqual(forward.schedules, reverse.schedules); assert.deepEqual(forward.schedules.map(item => item.startHour), [0, 1]);
    assert.equal(forward.solver.optimal, true);
  }
});

test("invalid profiles, inventories, core shapes, budgets and numeric overflow fail gracefully", () => {
  const base: CoordinatedOptimizationInput = { inventory: [device("spin")], energyProfile: profile(), mode: "cost" };
  const malformed: unknown[] = [null, {}, { ...base, inventory: [device("spin"), device("spin")] }, { ...base, mode: "fake" },
    ...[[], Array(24).fill(undefined), profile().map(row => ({ ...row, carbonGramsPerKwh: -1 }))].map(energyProfile => ({ ...base, energyProfile })),
    ...[0, -1, NaN, Infinity].map(modeledPowerLimitKw => ({ ...base, modeledPowerLimitKw })),
    ...[[], Array(48).fill(-1), Array(48).fill(NaN)].map(backgroundPowerKw => ({ ...base, backgroundPowerKw })),
    ...[0, -1, 1.5, 250001, Infinity].map(maxSearchNodes => ({ ...base, maxSearchNodes })),
    ...[null, {}, [null], [{}], [{ appliance: { id: "evie", kind: "ev" }, startWindow: {} }], [defaultSchedulingRequests[0]]].map(coreRequests => ({ ...base, coreRequests })),
    { ...base, inventory: [createDemoApplimon("evie")], coreRequests: [defaultSchedulingRequests[0], defaultSchedulingRequests[0]] },
    { ...base, energyProfile: profile(Array(24).fill(Number.MAX_VALUE)), inventory: [createDemoApplimon("evie")] },
  ];
  for (const input of malformed) {
    let value: ReturnType<typeof optimizeCoordinatedApplimons> | undefined;
    assert.doesNotThrow(() => { value = optimizeCoordinatedApplimons(input as CoordinatedOptimizationInput); });
    assert.equal(value!.status, "invalid-input", JSON.stringify(input)); assert.deepEqual(value!.schedules, []); assert.equal(value!.proposed, null);
  }
  const core = { ...defaultSchedulingRequests[0], appliance: { ...defaultSchedulingRequests[0].appliance, constraints: {} } } as SchedulingRequest;
  assert.equal(solve([createDemoApplimon("evie")], { coreRequests: [core] }).status, "invalid-input");
});

test("search budget exhaustion returns no candidate, proposed total or optimality claim", () => {
  const inventory = [device("spin"), device("tumble")];
  for (const maxSearchNodes of [1, 3]) {
    const plan = solve(inventory, { maxSearchNodes, modeledPowerLimitKw: 1 });
    assert.equal(plan.status, "search-limit"); assert.equal(plan.solver.optimal, false); assert.equal(plan.solver.visitedNodes, maxSearchNodes);
    assert.deepEqual(plan.schedules, []); assert.equal(plan.proposed, null); assert.equal(plan.comparison, null); assert.equal(plan.peakModeledPowerKw, null);
  }
});

test("all ten default appliances solve all objectives within the bounded search with modeled weather and an8kW budget", () => {
  const inventory = APPLIMON_IDS.map(createDemoApplimon);
  const scenario = buildDemoScenario({ ...DEFAULT_DEMO_PROFILE, applianceIds: ["evie", "bubbles", "chill"], applimons: inventory }, createSyntheticWeather("california"));
  const backgroundPowerKw = Array.from({ length: 48 }, (_, hour) => scenario.backgroundDemand.hourly[hour % 24].energyKwh);
  for (const mode of ["cost", "carbon", "balanced"] as const) {
    const start = performance.now();
    const result = optimizeCoordinatedApplimons({ inventory, energyProfile: buildRegionEnergyProfile("california"), mode, modeledPowerLimitKw: 8, backgroundPowerKw, coreRequests: scenario.requests });
    assert.equal(result.status, "feasible"); assert.equal(result.schedules.length, 6); assert.equal(result.unchangedSchedules.length, 1); assert.equal(result.protectedIds.length, 3);
    assert.equal(result.solver.optimal, true); assert.ok(result.solver.visitedNodes <= 250000); assert.ok(result.peakModeledPowerKw! <= 8 + 1e-9);
    console.info(`coordinated-fixture ${JSON.stringify({ mode, nodes: result.solver.visitedNodes, variables: result.solver.variableCount, elapsedMs: Math.round(performance.now() - start) })}`);
  }
});
