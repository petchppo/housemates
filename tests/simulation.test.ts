import assert from "node:assert/strict";
import test from "node:test";
import { applianceAgents } from "../src/data/appliances";
import { hourlyEnergy } from "../src/data/energy";
import { evaluateSchedule, type Schedule, type SchedulingRequest } from "../src/domain/scheduling";
import { getSimulationStats } from "../src/domain/simulation";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function makeSchedule(request: SchedulingRequest): Schedule {
  const result = evaluateSchedule(request, request.baselineStartHour, hourlyEnergy);
  assert.ok(result.schedule);
  return result.schedule;
}
function ev(start = 23, energy = 12, power = 7): Schedule {
  return makeSchedule({ appliance: { ...applianceAgents[0], constraints: { ...applianceAgents[0].constraints,
    energyNeededKwh: energy, maxPowerKw: power, availableFromHour: 0, readyByHour: 48 } },
  startWindow: { earliestHour: 0, latestHour: 47 }, baselineStartHour: start });
}
function dishwasher(start = 23, profile = [1, 0, 0.5]): Schedule {
  return makeSchedule({ appliance: { ...applianceAgents[1], constraints: { ...applianceAgents[1].constraints,
    cycleHours: profile.length, cycleEnergyKwh: profile.reduce((sum, energy) => sum + energy, 0),
    cycleProfileKwh: profile, earliestStartHour: 0, finishByHour: 48 } },
  startWindow: { earliestHour: 0, latestHour: 47 }, baselineStartHour: start });
}

test("missing appliances are idle; scheduled appliances queue, activate, and complete at exact boundaries", () => {
  const schedule = ev();
  assert.equal(getSimulationStats([], 20).evie.status, "idle");
  const queued = getSimulationStats([schedule], 22.9);
  assert.equal(queued.evie.status, "queued");
  assert.equal(queued.evie.currentPowerKw, 0);
  assert.equal(queued.evie.completedEnergyKwh, 0);
  assert.equal(queued.evie.totalEnergyKwh, 12);
  assert.equal(queued.bubbles.status, "idle");
  const start = getSimulationStats([schedule], 23).evie;
  assert.equal(start.status, "active");
  assert.equal(start.currentPowerKw, 7);
  assert.equal(start.progressPercent, 0);
  const end = getSimulationStats([schedule], schedule.endHour).evie;
  assert.equal(end.status, "complete");
  assert.equal(end.currentPowerKw, 0);
  assert.equal(end.progressPercent, 100);
  close(end.completedEnergyKwh, 12);
  close(end.accruedCostUsd, schedule.costUsd);
  close(end.accruedCarbonGrams, schedule.carbonGrams);
});

test("fractional EV charging crosses midnight with full configured power during its partial final hour", () => {
  const schedule = ev();
  const firstHalf = getSimulationStats([schedule], 23.5).evie;
  close(firstHalf.completedEnergyKwh, 3.5);
  close(firstHalf.accruedCostUsd, 3.5 * hourlyEnergy[23].priceUsdPerKwh);
  close(firstHalf.accruedCarbonGrams, 3.5 * hourlyEnergy[23].carbonGramsPerKwh);
  const midnight = getSimulationStats([schedule], 24).evie;
  close(midnight.completedEnergyKwh, 7);
  assert.equal(midnight.currentPowerKw, 7);
  const later = getSimulationStats([schedule], 24.5).evie;
  close(later.completedEnergyKwh, 10.5);
  close(later.accruedCostUsd, 7 * hourlyEnergy[23].priceUsdPerKwh + 3.5 * hourlyEnergy[0].priceUsdPerKwh);
  close(later.accruedCarbonGrams, 7 * hourlyEnergy[23].carbonGramsPerKwh + 3.5 * hourlyEnergy[0].carbonGramsPerKwh);
  assert.equal(later.currentPowerKw, 7);
  const finished = getSimulationStats([schedule], 24.9).evie;
  assert.equal(finished.status, "complete");
  assert.equal(finished.currentPowerKw, 0);
  close(finished.completedEnergyKwh, 12);
});

test("zero-energy dishwasher phases remain active while time advances and accrued totals pause", () => {
  const schedule = dishwasher();
  const idlePhase = getSimulationStats([schedule], 24.5).bubbles;
  assert.equal(idlePhase.status, "active");
  assert.equal(idlePhase.currentPowerKw, 0);
  close(idlePhase.progressPercent, 50);
  close(idlePhase.completedEnergyKwh, 1);
  close(idlePhase.accruedCostUsd, hourlyEnergy[23].priceUsdPerKwh);
  close(idlePhase.accruedCarbonGrams, hourlyEnergy[23].carbonGramsPerKwh);
  const finalPhase = getSimulationStats([schedule], 25.5).bubbles;
  close(finalPhase.currentPowerKw, 0.5);
  close(finalPhase.completedEnergyKwh, 1.25);
  close(finalPhase.accruedCostUsd, hourlyEnergy[23].priceUsdPerKwh + 0.25 * hourlyEnergy[1].priceUsdPerKwh);
  const trailingZero = getSimulationStats([dishwasher(20, [1, 0])], 21.5).bubbles;
  assert.equal(trailingZero.status, "active");
  close(trailingZero.completedEnergyKwh, trailingZero.totalEnergyKwh);
  close(trailingZero.progressPercent, 75);
});

test("both complete ledgers equal their planned totals and simulation never mutates schedules", () => {
  const schedules = [ev(), dishwasher()];
  const before = structuredClone(schedules);
  const result = getSimulationStats(schedules, 48);
  for (const schedule of schedules) {
    const stats = result[schedule.applianceId];
    close(stats.completedEnergyKwh, schedule.energyKwh);
    close(stats.accruedCostUsd, schedule.costUsd);
    close(stats.accruedCarbonGrams, schedule.carbonGrams);
    assert.equal(stats.status, "complete");
  }
  assert.deepEqual(schedules, before);
  assert.deepEqual(Object.keys(result).sort(), ["bubbles", "evie"]);
});

test("the fictional clock clamps to 0–48 without wrapping midnight or accepting nonfinite values", () => {
  const schedule = ev(47, 7, 7);
  assert.equal(getSimulationStats([schedule], -4).evie.status, "queued");
  close(getSimulationStats([schedule], 47.5).evie.completedEnergyKwh, 3.5);
  assert.equal(getSimulationStats([schedule], 48).evie.status, "complete");
  assert.deepEqual(getSimulationStats([schedule], 100), getSimulationStats([schedule], 48));
  assert.equal(getSimulationStats([ev(0)], -4).evie.status, "active");
  for (const hour of [NaN, Infinity, -Infinity]) assert.throws(() => getSimulationStats([], hour), RangeError);
});

test("accrued cost preserves negative prices instead of fabricating free or positive electricity", () => {
  const schedule = ev(20, 7, 7);
  const negative = { ...schedule, costUsd: -2, intervals: schedule.intervals.map(row => ({ ...row, costUsd: -2 })) };
  close(getSimulationStats([negative], 20.5).evie.accruedCostUsd, -1);
  close(getSimulationStats([negative], 21).evie.accruedCostUsd, -2);
});

test("invalid or duplicate schedule ledgers cannot turn into believable simulated readings", () => {
  const schedule = ev();
  assert.throws(() => getSimulationStats([schedule, schedule], 24), RangeError);
  assert.throws(() => getSimulationStats([{ ...schedule, applianceId: "chill" } as unknown as Schedule], 24), RangeError);
  assert.throws(() => getSimulationStats([{ ...schedule, intervals: [] }], 24), RangeError);
  assert.throws(() => getSimulationStats([{ ...schedule, endHour: 49 }], 24), RangeError);
  assert.throws(() => getSimulationStats([{ ...schedule, costUsd: NaN }], 24), RangeError);
  assert.throws(() => getSimulationStats([{ ...schedule, energyKwh: 100 }], 24), RangeError);
  assert.throws(() => getSimulationStats([{ ...schedule, intervals: schedule.intervals.map(row => ({ ...row, activeHours: 0 })) }], 24), RangeError);
});
