import assert from "node:assert/strict";
import test from "node:test";
import { hourlyEnergy } from "../src/data/energy";
import { defaultSchedulingRequests } from "../src/data/scheduling";
import { buildPlanTradeoffs } from "../src/domain/plan-tradeoffs";
import type { SchedulingRequest } from "../src/domain/scheduling";

function fixture() {
  const request = structuredClone(defaultSchedulingRequests[0]);
  if (request.appliance.kind !== "ev") throw new Error("Expected EV fixture");
  request.appliance.constraints = { energyNeededKwh: 1, maxPowerKw: 1, availableFromHour: 0, readyByHour: 3 };
  request.startWindow = { earliestHour: 0, latestHour: 2 };
  request.baselineStartHour = 0;
  const energyProfile = hourlyEnergy.map((row, hour) => ({ ...row,
    priceUsdPerKwh: [0.1, 0.3, 0.6][hour] ?? 1, carbonGramsPerKwh: [500, 250, 100][hour] ?? 600 }));
  return { requests: [request], energyProfile };
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("tradeoff recommendations use independent full-session ledgers and preserve input and baseline", () => {
  const input = fixture(), before = structuredClone(input);
  const result = buildPlanTradeoffs(input);
  assert.deepEqual(input, before);
  assert.deepEqual(result.recommendations.map(row => row.mode), ["cost", "carbon", "balanced"]);
  assert.deepEqual(result.recommendations.map(row => row.plan.schedules[0].startHour), [0, 2, 1]);
  assert.equal(result.baseline!.costUsd, .1);
  for (const { plan } of result.recommendations) {
    const intervals = plan.schedules.flatMap(row => row.intervals);
    close(plan.proposed!.costUsd, intervals.reduce((sum, row) => sum + row.energyKwh * input.energyProfile[row.hour % 24].priceUsdPerKwh, 0));
    close(plan.proposed!.carbonGrams, intervals.reduce((sum, row) => sum + row.energyKwh * input.energyProfile[row.hour % 24].carbonGramsPerKwh, 0));
    close(plan.proposed!.energyKwh, 1);
    close(plan.baseline!.costUsd, .1);
  }
});

test("negotiated finish cutoff and shared power cap apply to every objective", () => {
  const requests: SchedulingRequest[] = structuredClone(defaultSchedulingRequests) as SchedulingRequest[];
  const bubbles = requests.find(row => row.appliance.kind === "dishwasher")!;
  if (bubbles.appliance.kind !== "dishwasher") throw new Error("Expected dishwasher");
  bubbles.appliance.constraints.finishByHour = 22;
  const result = buildPlanTradeoffs({ requests, energyProfile: hourlyEnergy, sharedPowerLimitKw: 7 });
  for (const { plan } of result.recommendations) {
    assert.equal(plan.status, "feasible");
    assert.ok(plan.schedules.find(row => row.applianceId === "bubbles")!.endHour <= 22);
    const intervals = plan.schedules.flatMap(row => row.intervals);
    for (const { hour } of intervals) assert.ok(intervals.filter(row => row.hour <= hour && row.hour + row.activeHours > hour)
      .reduce((sum, row) => sum + row.powerKw, 0) <= 7);
  }
});

test("flat objectives retain coincident values and negative prices are not clamped", () => {
  const input = fixture();
  input.energyProfile = input.energyProfile.map(row => ({ ...row, priceUsdPerKwh: -.2, carbonGramsPerKwh: 0 }));
  const result = buildPlanTradeoffs(input);
  for (const { plan } of result.recommendations) {
    close(plan.proposed!.costUsd, -.2); close(plan.proposed!.carbonGrams, 0);
    close(plan.comparison!.costSavingsUsd, 0);
    assert.equal(plan.schedules[0].startHour, 0);
  }
});

test("forced tradeoff retains signed increases and an infeasible fixed baseline", () => {
  const input = fixture(); input.requests[0].startWindow = { earliestHour: 2, latestHour: 2 };
  const result = buildPlanTradeoffs(input);
  assert.equal(result.baselineFeasible, false);
  for (const { plan } of result.recommendations) {
    close(plan.comparison!.costSavingsUsd, -.5);
    close(plan.comparison!.carbonReductionGrams, 400);
  }
  input.requests[0].baselineStartHour = 2; input.requests[0].startWindow = { earliestHour: 0, latestHour: 0 };
  close(buildPlanTradeoffs(input).recommendations[0].plan.comparison!.carbonReductionGrams, -400);
});

test("missing baseline, impossible constraints, invalid inputs and empty teams fail honestly", () => {
  const input = fixture();
  if (input.requests[0].appliance.kind !== "ev") throw new Error("Expected EV");
  input.requests[0].appliance.constraints.energyNeededKwh = 2;
  input.requests[0].baselineStartHour = 47;
  assert.equal(buildPlanTradeoffs(input).baseline, null);
  input.requests[0].appliance.constraints.readyByHour = 0;
  const impossible = buildPlanTradeoffs(input);
  assert.ok(impossible.issues.length > 0);
  assert.ok(impossible.recommendations.every(row => row.plan.status === "infeasible" && row.plan.proposed === null));
  const invalid = buildPlanTradeoffs({ ...fixture(), sharedPowerLimitKw: NaN });
  assert.ok(invalid.recommendations.every(row => row.plan.status === "invalid-input"));
  const empty = buildPlanTradeoffs({ requests: [], energyProfile: hourlyEnergy });
  assert.deepEqual(empty.recommendations, []); assert.equal(empty.baseline, null); assert.match(empty.issues[0], /No flexible appliances/);
});
