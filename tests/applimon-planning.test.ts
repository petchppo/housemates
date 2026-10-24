import assert from "node:assert/strict";
import test from "node:test";
import { createDemoApplimon, type ApplimonDevice } from "../src/domain/applimon-catalog";
import { getApplimonSchedulingOptions, getApplimonSimulationStats, optimizeApplimonTeam } from "../src/domain/applimon-planning";
import type { HourlyEnergy } from "../src/domain/energy";

const profile: HourlyEnergy[] = Array.from({ length: 24 }, (_, hour) => ({ hour, priceUsdPerKwh: hour >= 11 && hour < 15 ? .08 : hour >= 17 && hour < 22 ? .5 : .2, carbonGramsPerKwh: hour >= 11 && hour < 15 ? 120 : 400 }));
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const update = (id: ApplimonDevice["id"], values: Partial<ApplimonDevice> = {}): ApplimonDevice => ({ ...createDemoApplimon(id), ...values });

test("more than two flexible Applimon reuse the search without identity collisions or invented power limits", () => {
  const devices = [update("spin"), update("tumble"), update("misty"), update("rover")];
  const plan = optimizeApplimonTeam(devices, profile);
  assert.equal(plan.status, "feasible"); assert.equal(plan.schedules.length, 4);
  assert.deepEqual(plan.schedules.map(row => row.applianceId), devices.map(row => row.id));
  assert.ok(plan.schedules.every(row => row.startHour === 11), "Independent appliances can use the same solar-priced hours");
  close(plan.proposed!.energyKwh, .7 + 2.5 + .7 + .06);
  close(plan.proposed!.costUsd, plan.proposed!.energyKwh * .08);
  close(plan.proposed!.carbonGrams, plan.proposed!.energyKwh * 120);
  assert.ok(plan.comparison!.costSavingsUsd > 0);
});

test("fractional cycles crossing midnight preserve task energy, interval prices and exact execution totals", () => {
  const device = update("spin", { energyKwh: 1.5, durationHours: 1.5, ratedPowerW: 2000, earliestStartHour: 23, latestStartHour: 23, deadlineHour: 25, baselineStartHour: 18 });
  const rates = profile.map(row => ({ ...row, priceUsdPerKwh: row.hour === 23 ? .3 : .1, carbonGramsPerKwh: row.hour === 23 ? 500 : 100 }));
  const plan = optimizeApplimonTeam([device], rates);
  assert.equal(plan.status, "feasible"); const schedule = plan.schedules[0];
  assert.equal(schedule.startHour, 23); assert.equal(schedule.endHour, 24.5);
  close(schedule.energyKwh, 1.5); close(schedule.costUsd, .35); close(schedule.carbonGrams, 550);
  close(schedule.powerKw, 1);
  const middle = getApplimonSimulationStats(plan.schedules, 24.25).spin!;
  assert.equal(middle.status, "active"); close(middle.completedEnergyKwh, 1.25); close(middle.accruedCostUsd, .325);
  const end = getApplimonSimulationStats(plan.schedules, 24.5).spin!;
  assert.equal(end.status, "complete"); close(end.completedEnergyKwh, schedule.energyKwh); close(end.accruedCostUsd, schedule.costUsd); close(end.accruedCarbonGrams, schedule.carbonGrams);
});

test("rated watts bound average cycle power instead of becoming assumed continuous consumption", () => {
  const device = update("spin", { ratedPowerW: 2200, energyKwh: .6, durationHours: 1.5 });
  const options = getApplimonSchedulingOptions(device, profile);
  assert.equal(options.status, "feasible"); close(options.recommendations!.cost.powerKw, .4); close(options.recommendations!.cost.energyKwh, .6);
  const rated = update("spin", { ratedPowerW: 2200, energyKwh: 3.3, durationHours: 1.5, energyBasis: "rated-power-estimate" });
  assert.equal(getApplimonSchedulingOptions(rated, profile).status, "feasible");
  assert.equal(getApplimonSchedulingOptions({ ...rated, energyKwh: .6 }, profile).status, "invalid-input");
});

test("EV charging respects connected availability and a full deadline across midnight", () => {
  const evie = update("evie", { ratedPowerW: 3000, energyKwh: 12, durationHours: 4, earliestStartHour: 22, latestStartHour: 28, deadlineHour: 31 });
  const options = getApplimonSchedulingOptions(evie, profile);
  assert.ok(options.options.every(row => row.startHour >= 22 && row.endHour <= 31));
  assert.ok(options.options.some(row => row.startHour === 22 && row.endHour === 26));
  assert.equal(getApplimonSchedulingOptions({ ...evie, deadlineHour: 25 }, profile).status, "infeasible");
  assert.equal(getApplimonSchedulingOptions({ ...evie, durationHours: 2 }, profile).status, "invalid-input");
});

test("protected appliances never produce switched schedules and fixed fan never enters shifting savings", () => {
  const devices = [update("chill"), update("frost"), update("ember"), update("breeze"), update("spin")];
  const plan = optimizeApplimonTeam(devices, profile);
  assert.equal(plan.status, "feasible"); assert.deepEqual(plan.protectedIds, ["chill", "frost", "ember"]);
  assert.deepEqual(plan.schedules.map(row => row.applianceId), ["spin"]);
  assert.deepEqual(plan.unchangedSchedules.map(row => row.applianceId), ["breeze"]);
  assert.equal(plan.unchangedSchedules[0].startHour, 18); close(plan.unchangedTotals!.energyKwh, .18);
  close(plan.proposed!.energyKwh, .7);
  assert.ok(plan.appliances.filter(row => row.policy === "protected").every(row => !row.baseline.schedule && !row.recommendations && !row.options.length));
  assert.throws(() => getApplimonSimulationStats([{ ...plan.schedules[0], applianceId: "frost" }], 48), /protected/);
});

test("cost and carbon tradeoffs remain separate and balanced options are deterministic", () => {
  const tradeoff = profile.map(row => ({ ...row, priceUsdPerKwh: row.hour === 10 ? .01 : row.hour === 11 ? .1 : .2, carbonGramsPerKwh: row.hour === 10 ? 900 : row.hour === 11 ? 400 : 50 }));
  const device = update("misty", { energyKwh: .3, durationHours: 1, earliestStartHour: 10, latestStartHour: 12, deadlineHour: 13, baselineStartHour: 12 });
  const options = getApplimonSchedulingOptions(device, tradeoff);
  assert.equal(options.recommendations!.cost.startHour, 10); assert.equal(options.recommendations!.carbon.startHour, 12);
  const cost = optimizeApplimonTeam([device], tradeoff, "cost");
  assert.ok(cost.comparison!.costSavingsUsd > 0); assert.ok(cost.comparison!.carbonReductionGrams < 0);
  assert.deepEqual(optimizeApplimonTeam([device], tradeoff, "balanced"), optimizeApplimonTeam([device], tradeoff, "balanced"));
});

test("baseline stays fixed and unchanged or worse proposals preserve zero and negative savings", () => {
  const locked = update("rover", { earliestStartHour: 17, latestStartHour: 17, deadlineHour: 20, baselineStartHour: 17 });
  const same = optimizeApplimonTeam([locked], profile);
  close(same.comparison!.costSavingsUsd, 0); close(same.comparison!.carbonReductionGrams, 0);
  const moved = optimizeApplimonTeam([{ ...locked, baselineStartHour: 11 }], profile);
  assert.equal(moved.appliances[0].baseline.schedule!.startHour, 11); assert.equal(moved.baselineFeasible, false);
  assert.ok(moved.comparison!.costSavingsUsd < 0); assert.ok(moved.comparison!.carbonReductionGrams < 0);
});

test("invalid input, duplicate identities, infeasible deadlines and unverifiable baselines fail clearly", () => {
  const device = update("spin");
  for (const input of [null, [device, device], [{ ...device, confirmed: false }], [{ ...device, id: "__proto__" }], [{ ...device, energyKwh: Infinity }], [{ ...device, energyKwh: 20 }], [{ ...device, latestStartHour: 7 }]]) assert.equal(optimizeApplimonTeam(input, profile).status, "invalid-input");
  assert.equal(optimizeApplimonTeam([device], profile, "magic" as never).status, "invalid-input");
  assert.equal(optimizeApplimonTeam([device], [] ).status, "invalid-input");
  assert.equal(getApplimonSchedulingOptions({ ...device, earliestStartHour: 8.5 }, profile).status, "invalid-input");
  assert.equal(optimizeApplimonTeam([{ ...device, deadlineHour: 8 }], profile).status, "infeasible");
  const outside = optimizeApplimonTeam([{ ...device, baselineStartHour: 48 }], profile);
  assert.equal(outside.status, "feasible"); assert.equal(outside.baseline, null); assert.equal(outside.comparison, null);
});

test("generic ledger rejects forged intervals and duplicate schedules and clamps a finite preview clock", () => {
  const schedule = optimizeApplimonTeam([update("spin")], profile).schedules[0];
  assert.throws(() => getApplimonSimulationStats([schedule, schedule], 48), /unique/);
  assert.throws(() => getApplimonSimulationStats([{ ...schedule, energyKwh: 100 }], 48), /totals/);
  assert.throws(() => getApplimonSimulationStats([{ ...schedule, intervals: [{ ...schedule.intervals[0], activeHours: -1 }] }], 48), /consistent/);
  assert.throws(() => getApplimonSimulationStats([schedule], NaN), /finite/);
  assert.equal(getApplimonSimulationStats([schedule], -20).spin!.status, "queued");
  assert.equal(getApplimonSimulationStats([schedule], 100).spin!.status, "complete");
});
