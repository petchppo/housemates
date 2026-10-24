import assert from "node:assert/strict";
import test from "node:test";
import { applianceAgents } from "../src/data/appliances";
import { hourlyEnergy } from "../src/data/energy";
import { defaultSchedulingRequests } from "../src/data/scheduling";
import { compareSchedules, evaluateSchedule, getSchedulingOptions, optimizeHousehold,
  type SchedulingRequest, type FlexibleAppliance } from "../src/domain/scheduling";
import type { HourlyEnergy } from "../src/domain/energy";

type EvConstraints = Extract<FlexibleAppliance, { kind: "ev" }>["constraints"];
function ev(constraints: Partial<EvConstraints> = {}, options: Partial<Omit<SchedulingRequest, "appliance">> = {}): SchedulingRequest {
  const original = applianceAgents[0];
  return { appliance: { ...original, constraints: { ...original.constraints, ...constraints } },
    baselineStartHour: 18, startWindow: { earliestHour: 18, latestHour: 30 }, ...options };
}
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const tradeoffProfile: HourlyEnergy[] = hourlyEnergy.map((row, hour) => ({ ...row,
  priceUsdPerKwh: [0.1, 0.3, 0.6][hour] ?? 1, carbonGramsPerKwh: [500, 250, 100][hour] ?? 600 }));
const tradeoffRequest = () => ev({ energyNeededKwh: 1, maxPowerKw: 1, availableFromHour: 0, readyByHour: 3 },
  { baselineStartHour: 0, startWindow: { earliestHour: 0, latestHour: 2 } });

test("uses the shared 24-hour synthetic dataset and existing agent definitions", () => {
  assert.equal(hourlyEnergy.length, 24);
  assert.equal(defaultSchedulingRequests.length, 2);
  assert.equal(defaultSchedulingRequests[0].appliance.kind, "ev");
  assert.equal(applianceAgents[0].constraints.energyNeededKwh, 12);
  assert.ok(applianceAgents.some(agent => agent.id === "chill"));
});

test("dishwasher uses both hourly rates and conserves total cycle energy", () => {
  const result = evaluateSchedule(defaultSchedulingRequests[1], 20, hourlyEnergy);
  assert.equal(result.feasible, true);
  assert.ok(result.schedule);
  assert.deepEqual(result.schedule.intervals.map(row => row.energyKwh), [0.6, 0.6]);
  close(result.schedule.energyKwh, 1.2);
  close(result.schedule.costUsd, 0.6 * 0.45 + 0.6 * 0.30);
  close(result.schedule.carbonGrams, 0.6 * 370 + 0.6 * 330);
  assert.equal(result.schedule.endHour, 22);
});

test("EV crosses midnight, repeats the profile and only bills the partial final hour", () => {
  const result = evaluateSchedule(ev(), 23, hourlyEnergy);
  assert.ok(result.schedule);
  assert.equal(result.feasible, true);
  assert.deepEqual(result.schedule.intervals.map(row => row.hour), [23, 24]);
  assert.deepEqual(result.schedule.intervals.map(row => row.energyKwh), [7, 5]);
  close(result.schedule.endHour, 24 + 5 / 7);
  close(result.schedule.costUsd, 7 * 0.25 + 5 * 0.24);
  close(result.schedule.carbonGrams, 7 * 290 + 5 * 280);
});

test("multi-hour charging respects a configurable power and exact deadline", () => {
  const request = ev({ maxPowerKw: 3, readyByHour: 31 });
  const result = evaluateSchedule(request, 27, hourlyEnergy);
  assert.equal(result.feasible, true);
  assert.equal(result.schedule?.endHour, 31);
  assert.equal(result.schedule?.intervals.length, 4);
  assert.equal(evaluateSchedule(request, 28, hourlyEnergy).feasible, false);
});

test("infeasible deadline produces no recommendation or household savings", () => {
  const request = ev({ readyByHour: 19 });
  assert.equal(getSchedulingOptions(request, hourlyEnergy).status, "infeasible");
  const plan = optimizeHousehold([request, defaultSchedulingRequests[1]], hourlyEnergy);
  assert.equal(plan.status, "infeasible");
  assert.equal(plan.comparison, null);
  assert.equal(plan.proposed, null);
  assert.equal(plan.baselineFeasible, false);
});

test("reversed windows and conflicts with physical availability are infeasible", () => {
  for (const startWindow of [{ earliestHour: 25, latestHour: 22 }, { earliestHour: 0, latestHour: 10 }]) {
    const result = getSchedulingOptions(ev({}, { startWindow }), hourlyEnergy);
    assert.equal(result.status, "infeasible");
    assert.ok(result.issues.length);
  }
  assert.equal(getSchedulingOptions(ev({ availableFromHour: 32, readyByHour: 31 }), hourlyEnergy).status, "infeasible");
});

test("an allowed start still must finish the uninterrupted cycle before the deadline", () => {
  const request = { ...defaultSchedulingRequests[1], startWindow: { earliestHour: 30, latestHour: 30 } };
  assert.equal(getSchedulingOptions(request, hourlyEnergy).status, "infeasible");
});

test("zero savings remains zero rather than a fabricated positive number", () => {
  const request = ev({}, { startWindow: { earliestHour: 18, latestHour: 18 } });
  const plan = optimizeHousehold([request], hourlyEnergy);
  assert.equal(plan.status, "feasible");
  assert.deepEqual(plan.comparison, { costSavingsUsd: 0, carbonReductionGrams: 0 });
});

test("forcing a more expensive window preserves negative savings and the original baseline", () => {
  const request = { ...tradeoffRequest(), startWindow: { earliestHour: 2, latestHour: 2 } };
  const plan = optimizeHousehold([request], tradeoffProfile);
  assert.equal(plan.status, "feasible");
  assert.equal(plan.baselineFeasible, false);
  close(plan.baseline!.costUsd, 0.1);
  close(plan.comparison!.costSavingsUsd, -0.5);
  close(plan.comparison!.carbonReductionGrams, 400);
  assert.equal(plan.appliances[0].baseline.schedule!.startHour, 0);
});

test("cost-first, carbon-first and normalized balanced expose a genuine tradeoff", () => {
  const result = getSchedulingOptions(tradeoffRequest(), tradeoffProfile);
  assert.equal(result.recommendations?.cost.startHour, 0);
  assert.equal(result.recommendations?.carbon.startHour, 2);
  assert.equal(result.recommendations?.balanced.startHour, 1);
  assert.ok(result.recommendations!.carbon.costUsd > result.recommendations!.cost.costUsd);
  assert.ok(result.recommendations!.cost.carbonGrams > result.recommendations!.carbon.carbonGrams);
  for (const [mode, hour] of [["cost", 0], ["carbon", 2], ["balanced", 1]] as const)
    assert.equal(optimizeHousehold([tradeoffRequest()], tradeoffProfile, mode).schedules[0].startHour, hour);
});

test("baseline is evaluated at original starts and household savings sum both appliances", () => {
  const plan = optimizeHousehold(defaultSchedulingRequests, hourlyEnergy);
  assert.equal(plan.status, "feasible");
  assert.equal(plan.baselineFeasible, true);
  const expectedBaselineCost = 7 * 0.52 + 5 * 0.50 + 0.6 * 0.45 + 0.6 * 0.30;
  const expectedBaselineCarbon = 7 * 380 + 5 * 400 + 0.6 * 370 + 0.6 * 330;
  close(plan.baseline!.costUsd, expectedBaselineCost);
  close(plan.baseline!.carbonGrams, expectedBaselineCarbon);
  close(plan.comparison!.costSavingsUsd, expectedBaselineCost - plan.proposed!.costUsd);
  close(plan.comparison!.carbonReductionGrams, expectedBaselineCarbon - plan.proposed!.carbonGrams);
  close(plan.proposed!.energyKwh, 13.2);
  const comparisons = plan.schedules.map((schedule, i) => compareSchedules(plan.appliances[i].baseline.schedule!, schedule));
  close(plan.comparison!.costSavingsUsd, comparisons.reduce((sum, row) => sum + row.costSavingsUsd, 0));
});

test("cost search returns a global minimum among all feasible discrete starts", () => {
  const result = getSchedulingOptions(ev(), hourlyEnergy);
  assert.ok(result.options.length > 1);
  close(result.recommendations!.cost.costUsd, Math.min(...result.options.map(row => row.costUsd)));
  for (const schedule of result.options) {
    assert.equal(evaluateSchedule(ev(), schedule.startHour, hourlyEnergy).feasible, true);
    close(schedule.energyKwh, 12);
  }
});

test("no unconfigured power conflict; explicit limit can make the same sessions infeasible", () => {
  const requests = defaultSchedulingRequests.map(request => ({ ...request, startWindow: { earliestHour: 20, latestHour: 20 } }));
  assert.equal(optimizeHousehold(requests, hourlyEnergy).status, "feasible");
  const constrained = optimizeHousehold(requests, hourlyEnergy, "cost", 7);
  assert.equal(constrained.status, "infeasible");
  assert.match(constrained.issues[0], /shared power limit/);
});

test("explicit power limit shifts one session when a feasible combination exists", () => {
  const requests = defaultSchedulingRequests.map(request => ({ ...request, startWindow: { earliestHour: 20, latestHour: 24 } }));
  const plan = optimizeHousehold(requests, hourlyEnergy, "cost", 7);
  assert.equal(plan.status, "feasible");
  const [first, second] = plan.schedules;
  assert.ok(first.endHour <= second.startHour || second.endHour <= first.startHour);
});

test("power checks use active power rather than averaged energy in a partial hour", () => {
  const requests = [ev({}, { startWindow: { earliestHour: 23, latestHour: 23 } }),
    { ...defaultSchedulingRequests[1], startWindow: { earliestHour: 24, latestHour: 24 } }];
  assert.equal(optimizeHousehold(requests, hourlyEnergy, "cost", 7).status, "infeasible");
});

test("sessions finishing at hour 48 are allowed; beyond 48 are rejected", () => {
  const request = ev({ maxPowerKw: 6, readyByHour: 48 }, { startWindow: { earliestHour: 46, latestHour: 47 } });
  assert.equal(evaluateSchedule(request, 46, hourlyEnergy).feasible, true);
  assert.equal(evaluateSchedule(request, 47, hourlyEnergy).schedule, null);
  assert.equal(evaluateSchedule(request, -1, hourlyEnergy).schedule, null);
  assert.equal(evaluateSchedule(request, 18.5, hourlyEnergy).schedule, null);
});

test("bad inputs and malformed profiles return validation issues without proposals", () => {
  for (const power of [0, -1, NaN, Infinity])
    assert.equal(getSchedulingOptions(ev({ maxPowerKw: power }), hourlyEnergy).status, "invalid-input");
  for (const deadline of [NaN, 49, -1, 31.5])
    assert.equal(getSchedulingOptions(ev({ readyByHour: deadline }), hourlyEnergy).status, "invalid-input");
  assert.equal(getSchedulingOptions(ev(), hourlyEnergy.slice(1)).status, "invalid-input");
  assert.equal(getSchedulingOptions(ev(), hourlyEnergy.map(row => ({ ...row, carbonGramsPerKwh: -1 }))).status, "invalid-input");
  assert.equal(optimizeHousehold(defaultSchedulingRequests, hourlyEnergy, "cost", 0).status, "invalid-input");
  assert.equal(optimizeHousehold([ev(), ev()], hourlyEnergy).status, "invalid-input");
});

test("flat objectives use earliest starts deterministically and leave inputs untouched", () => {
  const profile = hourlyEnergy.map(row => ({ ...row, priceUsdPerKwh: 0.2, carbonGramsPerKwh: 100 }));
  const request = ev();
  const before = JSON.stringify({ request, profile });
  const result = getSchedulingOptions(request, profile);
  for (const schedule of Object.values(result.recommendations!)) assert.equal(schedule.startHour, 18);
  assert.deepEqual(getSchedulingOptions(request, profile), result);
  assert.equal(JSON.stringify({ request, profile }), before);
});

test("the existing synthetic profile exposes a cost/carbon tradeoff for slower charging", () => {
  const request = ev({ maxPowerKw: 3, readyByHour: 40 }, { startWindow: { earliestHour: 18, latestHour: 36 } });
  const result = getSchedulingOptions(request, hourlyEnergy);
  assert.ok(result.recommendations);
  const { cost, carbon } = result.recommendations;
  assert.ok(cost.costUsd < carbon.costUsd);
  assert.ok(cost.carbonGrams > carbon.carbonGrams);
  close(cost.energyKwh, carbon.energyKwh);
});

test("switching to a cheaper but dirtier schedule preserves negative carbon reduction", () => {
  const request = { ...tradeoffRequest(), baselineStartHour: 2 };
  const plan = optimizeHousehold([request], tradeoffProfile, "cost");
  close(plan.comparison!.costSavingsUsd, 0.5);
  close(plan.comparison!.carbonReductionGrams, -400);
});

test("changing charging power recalculates both schedules without moving the baseline start", () => {
  const plan = optimizeHousehold([ev({ maxPowerKw: 3 })], hourlyEnergy);
  const baseline = plan.appliances[0].baseline.schedule!;
  assert.equal(baseline.startHour, 18);
  assert.equal(baseline.endHour, 22);
  close(baseline.costUsd, 3 * (0.52 + 0.50 + 0.45 + 0.30));
  close(plan.proposed!.energyKwh, baseline.energyKwh);
});

test("no comparison is emitted when the original session runs beyond the horizon", () => {
  const request = ev({}, { baselineStartHour: 47 });
  const plan = optimizeHousehold([request], hourlyEnergy);
  assert.equal(plan.status, "feasible");
  assert.ok(plan.proposed);
  assert.equal(plan.baseline, null);
  assert.equal(plan.comparison, null);
});

test("sparse energy profiles are rejected rather than crashing during estimation", () => {
  const sparse: HourlyEnergy[] = new Array(24);
  assert.equal(getSchedulingOptions(ev(), sparse).status, "invalid-input");
});
