import assert from "node:assert/strict";
import test from "node:test";
import { applianceAgents } from "../src/data/appliances";
import { hourlyEnergy } from "../src/data/energy";
import { estimateUsage } from "../src/domain/energy";
import { evaluateSchedule, getSchedulingOptions, optimizeHousehold,
  type FlexibleAppliance, type SchedulingRequest } from "../src/domain/scheduling";

type DishwasherConstraints = Extract<FlexibleAppliance, { kind: "dishwasher" }>["constraints"];
function dishwasher(constraints: Partial<DishwasherConstraints> = {}, start = 20): SchedulingRequest {
  return { appliance: { ...applianceAgents[1], constraints: { ...applianceAgents[1].constraints, ...constraints } },
    startWindow: { earliestHour: start, latestHour: start }, baselineStartHour: start };
}
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("nonuniform dishwasher profile integrates each energy amount against its own hourly rate", () => {
  const request = dishwasher({ cycleProfileKwh: [1, 0.2] }, 20);
  const result = evaluateSchedule(request, 20, hourlyEnergy);
  assert.equal(result.feasible, true);
  assert.ok(result.schedule);
  assert.deepEqual(result.schedule.intervals.map(row => row.energyKwh), [1, 0.2]);
  assert.deepEqual(result.schedule.intervals.map(row => row.powerKw), [1, 0.2]);
  close(result.schedule.energyKwh, 1.2);
  close(result.schedule.costUsd, 1 * 0.45 + 0.2 * 0.30);
  close(result.schedule.carbonGrams, 1 * 370 + 0.2 * 330);
  close(result.schedule.powerKw, 1);
});

test("three-hour dishwasher cycle crosses midnight and retains a zero-energy phase", () => {
  const request = dishwasher({ cycleHours: 3, cycleEnergyKwh: 1.5, cycleProfileKwh: [1.2, 0, 0.3] }, 23);
  const result = evaluateSchedule(request, 23, hourlyEnergy);
  assert.equal(result.feasible, true);
  assert.ok(result.schedule);
  assert.equal(result.schedule.endHour, 26);
  assert.deepEqual(result.schedule.intervals.map(row => row.hour), [23, 24, 25]);
  assert.deepEqual(result.schedule.intervals.map(row => row.activeHours), [1, 1, 1]);
  close(result.schedule.energyKwh, 1.5);
  close(result.schedule.costUsd, 1.2 * 0.25 + 0.3 * 0.24);
  close(result.schedule.carbonGrams, 1.2 * 290 + 0.3 * 270);
});

test("shared power limits inspect every dishwasher phase, not cycle-average power", () => {
  const ev: SchedulingRequest = { appliance: { ...applianceAgents[0], constraints: {
    ...applianceAgents[0].constraints, energyNeededKwh: 12, maxPowerKw: 6,
  } }, startWindow: { earliestHour: 20, latestHour: 20 }, baselineStartHour: 20 };
  const wash = dishwasher({ cycleProfileKwh: [0.1, 1.1] }, 20);
  assert.equal(optimizeHousehold([ev, wash], hourlyEnergy, "cost", 7).status, "infeasible");
  assert.equal(optimizeHousehold([ev, wash], hourlyEnergy, "cost", 7.1).status, "feasible");
  assert.equal(optimizeHousehold([ev, wash], hourlyEnergy).status, "feasible");
});

test("a zero-energy dishwasher phase does not invent a simultaneous-power conflict", () => {
  const ev: SchedulingRequest = { appliance: { ...applianceAgents[0], constraints: {
    ...applianceAgents[0].constraints, energyNeededKwh: 6, maxPowerKw: 6,
  } }, startWindow: { earliestHour: 20, latestHour: 20 }, baselineStartHour: 20 };
  const wash = dishwasher({ cycleProfileKwh: [0, 1.2] }, 20);
  assert.equal(optimizeHousehold([ev, wash], hourlyEnergy, "cost", 6).status, "feasible");
});

test("dishwasher profiles reject wrong lengths, nonfinite values, negative consumption and mismatched totals", () => {
  for (const profile of [[1.2], [0.6, 0.6, 0], [1.3, -0.1], [NaN, 1.2], [Infinity, 0], [0.1, 0.1], new Array<number>(2)]) {
    assert.equal(getSchedulingOptions(dishwasher({ cycleProfileKwh: profile }), hourlyEnergy).status, "invalid-input");
  }
  assert.equal(getSchedulingOptions(dishwasher({ cycleHours: 2.5, cycleProfileKwh: [.6, .6] }), hourlyEnergy).status, "invalid-input");
  for (const duration of [0, -1, 49, Infinity, NaN]) {
    assert.equal(getSchedulingOptions(dishwasher({ cycleHours: duration }), hourlyEnergy).status, "invalid-input");
  }
});

test("changing a profile prices the fixed baseline and the proposed cycle consistently", () => {
  const request = { ...dishwasher({ cycleProfileKwh: [1, 0.2] }, 20), startWindow: { earliestHour: 20, latestHour: 29 } };
  const plan = optimizeHousehold([request], hourlyEnergy);
  assert.equal(plan.status, "feasible");
  close(plan.baseline!.costUsd, 1 * 0.45 + 0.2 * 0.30);
  close(plan.comparison!.costSavingsUsd, plan.baseline!.costUsd - plan.proposed!.costUsd);
  close(plan.baseline!.energyKwh, plan.proposed!.energyKwh);
});

test("structured explanations disclose assumptions, valid search, and carbon-increasing savings", () => {
  const custom = hourlyEnergy.map(row => ({ ...row, priceUsdPerKwh: row.hour === 20 ? 0.5 : 0.1,
    carbonGramsPerKwh: row.hour === 20 ? 100 : 500 }));
  const request = { ...dishwasher({ cycleHours: 1, cycleEnergyKwh: 1 }), startWindow: { earliestHour: 20, latestHour: 21 } };
  const plan = optimizeHousehold([request], custom);
  assert.equal(plan.status, "feasible");
  assert.ok(plan.comparison!.costSavingsUsd > 0);
  assert.ok(plan.comparison!.carbonReductionGrams < 0);
  assert.ok(plan.reasons.some(reason => /increases modeled carbon/.test(reason)));
  assert.ok(plan.assumptions.some(reason => /avoided marginal emissions/.test(reason)));
  assert.ok(plan.appliances[0].reasons.some(reason => /complete sessions/.test(reason)));
});

test("numeric extremes cannot silently generate free energy or nonfinite totals", () => {
  const request: SchedulingRequest = { appliance: { ...applianceAgents[0], constraints: {
    ...applianceAgents[0].constraints, maxPowerKw: 1e308,
  } }, startWindow: { earliestHour: 18, latestHour: 30 }, baselineStartHour: 18 };
  assert.equal(getSchedulingOptions(request, hourlyEnergy).status, "invalid-input");
  assert.throws(() => estimateUsage(1e308, { hour: 0, priceUsdPerKwh: 100, carbonGramsPerKwh: 1 }), RangeError);
  assert.throws(() => estimateUsage(1, { hour: 0, priceUsdPerKwh: NaN, carbonGramsPerKwh: 1 }), RangeError);
  assert.throws(() => estimateUsage(1, { hour: 0, priceUsdPerKwh: 0.2, carbonGramsPerKwh: -1 }), RangeError);
});

test("runtime callers cannot disguise Chill as an optimizable appliance", () => {
  const request = dishwasher();
  const attempted = { ...request, appliance: { ...request.appliance, id: "chill", kind: "air-conditioner" } } as unknown as SchedulingRequest;
  assert.equal(getSchedulingOptions(attempted, hourlyEnergy).status, "invalid-input");
});

test("two individually finite loads cannot overflow household totals", () => {
  const profile = hourlyEnergy.map(row => ({ ...row, priceUsdPerKwh: 0.5, carbonGramsPerKwh: 0 }));
  const ev: SchedulingRequest = { appliance: { ...applianceAgents[0], constraints: {
    ...applianceAgents[0].constraints, energyNeededKwh: 1e308, maxPowerKw: 1e308,
  } }, startWindow: { earliestHour: 20, latestHour: 20 }, baselineStartHour: 20 };
  const wash = dishwasher({ cycleHours: 1, cycleEnergyKwh: 1e308 }, 20);
  assert.equal(optimizeHousehold([ev, wash], profile).status, "invalid-input");
});
