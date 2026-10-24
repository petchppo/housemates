import assert from "node:assert/strict";
import test from "node:test";
import { buildDemoGridProfile } from "../src/data/demo-grid";
import { DEMO_REGIONS } from "../src/data/demo-regions";
import { defaultSchedulingRequests } from "../src/data/scheduling";
import { buildDemoScenario, buildRegionEnergyProfile, DEFAULT_DEMO_PROFILE, type DemoProfile } from "../src/domain/demo";
import { buildDemoAcActivity, demoCoolingOccupancyFactor, getDemoAcStats } from "../src/domain/demo-activity";
import { createSyntheticWeather } from "../src/domain/demo-weather";
import { evaluateSchedule } from "../src/domain/scheduling";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const profile = (changes: Partial<DemoProfile> = {}): DemoProfile => ({ ...DEFAULT_DEMO_PROFILE, regionId: "bangkok", applianceIds: ["evie", "bubbles", "chill"], ...changes });

test("indexed solar subtraction produces a California midday belly and distinct regional shapes", () => {
  const curves = DEMO_REGIONS.map(region => buildDemoGridProfile(region.id));
  assert.equal(new Set(curves.map(rows => JSON.stringify(rows.map(row => row.netDemandIndex)))).size, 6);
  for (const rows of curves) {
    assert.equal(rows.length, 24);
    rows.forEach((row, hour) => {
      assert.equal(row.hour, hour);
      assert.ok(row.demandIndex > 0 && row.solarIndex >= 0 && row.netDemandIndex > 0);
      close(row.netDemandIndex, row.demandIndex - row.solarIndex);
    });
    close(rows[0].solarIndex, 0);
    close(rows[23].solarIndex, 0);
  }
  const california = curves[0], oslo = curves[4];
  assert.ok(california[12].netDemandIndex < california[6].netDemandIndex);
  assert.ok(california[12].netDemandIndex < california[18].netDemandIndex * 0.3);
  assert.ok(oslo[12].netDemandIndex > oslo[3].netDemandIndex); // Do not force a California duck onto a low-solar example.
  const rates = buildRegionEnergyProfile("california");
  assert.ok(rates[12].priceUsdPerKwh < rates[18].priceUsdPerKwh);
  assert.ok(rates[12].carbonGramsPerKwh < rates[18].carbonGramsPerKwh);
  assert.throws(() => buildDemoGridProfile("__proto__" as never), RangeError);
});

test("fixed evening baselines remain correct while actual feasible cost/carbon optimizations diverge", () => {
  const originalFixtures = structuredClone(defaultSchedulingRequests);
  const cost = buildDemoScenario(profile({ regionId: "california" }), undefined, "cost");
  const carbon = buildDemoScenario(profile({ regionId: "california" }), undefined, "carbon");
  assert.deepEqual(cost.requests.map(row => row.baselineStartHour), [18, 20]);
  const baselines = cost.requests.map(request => evaluateSchedule(request, request.baselineStartHour, cost.energyProfile));
  assert.ok(baselines.every(row => row.feasible));
  close(cost.plan!.baseline!.costUsd, baselines.reduce((sum, row) => sum + row.schedule!.costUsd, 0));
  close(cost.plan!.comparison!.costSavingsUsd, cost.plan!.baseline!.costUsd - cost.plan!.proposed!.costUsd);
  assert.deepEqual(cost.plan!.baseline, carbon.plan!.baseline);
  assert.ok(cost.plan!.proposed!.costUsd < carbon.plan!.proposed!.costUsd);
  assert.ok(carbon.plan!.proposed!.carbonGrams < cost.plan!.proposed!.carbonGrams);
  for (const scenario of [cost, carbon]) {
    assert.ok(scenario.plan!.schedules.every(row => row.startHour >= (row.applianceId === "evie" ? 18 : 20) && row.endHour <= 31));
  }
  assert.deepEqual(defaultSchedulingRequests, originalFixtures);
});

test("selected Chill activity exactly partitions hourly background cooling and uses the selected rates", () => {
  for (const region of DEMO_REGIONS) {
    const scenario = buildDemoScenario(profile({ regionId: region.id }));
    const activity = scenario.acActivity;
    close(activity.energyKwh, scenario.backgroundDemand.coolingKwh);
    close(activity.energyKwh, activity.hourly.reduce((sum, row) => sum + row.energyKwh, 0));
    close(activity.costUsd, activity.hourly.reduce((sum, row) => sum + row.costUsd, 0));
    close(activity.carbonGrams, activity.hourly.reduce((sum, row) => sum + row.carbonGrams, 0));
    activity.hourly.forEach((row, hour) => {
      close(row.powerKw, row.energyKwh); // Average power × 1 h.
      close(row.energyKwh, scenario.backgroundDemand.hourly[hour].coolingKwh);
      close(row.costUsd, row.energyKwh * scenario.energyProfile[hour].priceUsdPerKwh);
      close(row.carbonGrams, row.energyKwh * scenario.energyProfile[hour].carbonGramsPerKwh);
    });
    close(scenario.plan!.proposed!.energyKwh, 13.2); // Cooling is never inserted into the flexible plan or saving.
  }
});

test("workday occupancy reduces daytime cooling without forcing positive hot-weather demand off", () => {
  const weather = createSyntheticWeather("bangkok");
  weather.temperatureC = 32;
  weather.hourly = weather.hourly.map(row => ({ ...row, temperatureC: 32, humidityPercent: 60 }));
  const scenario = buildDemoScenario(profile(), weather);
  const rows = scenario.acActivity.hourly;
  rows.forEach(row => assert.ok(row.energyKwh > 0));
  close(rows[7].energyKwh, 8 * 0.09);
  close(rows[12].energyKwh, rows[7].energyKwh * 0.55);
  close(rows[1].energyKwh, rows[7].energyKwh * 0.7);
  close(rows[19].energyKwh, rows[7].energyKwh);
  assert.throws(() => demoCoolingOccupancyFactor(24), RangeError);
  assert.throws(() => demoCoolingOccupancyFactor(NaN), RangeError);
});

test("no Chill, neutral weather and colder weather never fabricate AC draw or alter flexible savings", () => {
  const selected = buildDemoScenario(profile());
  const absent = buildDemoScenario(profile({ applianceIds: ["evie", "bubbles"] }));
  assert.ok(selected.acActivity.energyKwh > 0);
  assert.equal(absent.acActivity.energyKwh, 0);
  assert.ok(absent.acActivity.hourly.every(row => row.powerKw === 0));
  assert.deepEqual(selected.backgroundDemand, absent.backgroundDemand);
  assert.deepEqual(selected.plan, absent.plan);
  const hotter = buildDemoScenario(profile({ weatherOffsetC: 5 }));
  assert.ok(hotter.acActivity.energyKwh > selected.acActivity.energyKwh);
  assert.deepEqual(hotter.plan, selected.plan);
  const cold = buildDemoScenario(profile({ regionId: "oslo" }));
  assert.equal(cold.acActivity.energyKwh, 0);
  assert.ok(cold.backgroundDemand.heatingKwh > 0);
  const weather = createSyntheticWeather("bangkok");
  weather.hourly = weather.hourly.map(row => ({ ...row, temperatureC: 22 }));
  assert.equal(buildDemoScenario(profile(), weather).acActivity.energyKwh, 0);
});

test("AC replay integrates fractional hours, midnight and both complete days with endpoint power zero", () => {
  const { acActivity: activity } = buildDemoScenario(profile());
  const first = activity.hourly[0], last = activity.hourly[23];
  const half = getDemoAcStats(activity, 0.5);
  close(half.completedEnergyKwh, first.energyKwh / 2);
  close(half.accruedCostUsd, first.costUsd / 2);
  close(half.accruedCarbonGrams, first.carbonGrams / 2);
  close(getDemoAcStats(activity, 23.5).completedEnergyKwh, activity.energyKwh - last.energyKwh / 2);
  close(getDemoAcStats(activity, 24).completedEnergyKwh, activity.energyKwh);
  close(getDemoAcStats(activity, 24.5).completedEnergyKwh, activity.energyKwh + first.energyKwh / 2);
  const end = getDemoAcStats(activity, 48);
  close(end.completedEnergyKwh, 2 * activity.energyKwh);
  close(end.accruedCostUsd, 2 * activity.costUsd);
  close(end.accruedCarbonGrams, 2 * activity.carbonGrams);
  close(end.totalEnergyKwh, end.completedEnergyKwh);
  assert.equal(end.currentPowerKw, 0);
  assert.equal(end.status, "complete");
  assert.deepEqual(getDemoAcStats(activity, 100), end);
  assert.equal(getDemoAcStats(activity, -5).completedEnergyKwh, 0);
});

test("AC replay preserves negative costs and rejects malformed hourly ledgers or nonfinite clocks", () => {
  const scenario = buildDemoScenario(profile());
  const negative = buildDemoAcActivity(scenario.backgroundDemand, scenario.energyProfile.map(row => ({ ...row, priceUsdPerKwh: -0.1 })), true);
  close(negative.costUsd, -0.1 * negative.energyKwh);
  assert.ok(getDemoAcStats(negative, 24).accruedCostUsd < 0);
  for (const hour of [NaN, Infinity, -Infinity]) assert.throws(() => getDemoAcStats(negative, hour), RangeError);
  assert.throws(() => getDemoAcStats({ ...negative, energyKwh: negative.energyKwh + 1 }, 12), RangeError);
  assert.throws(() => getDemoAcStats({ ...negative, hourly: negative.hourly.slice(1) }, 12), RangeError);
  const broken = structuredClone(negative);
  broken.hourly[0].powerKw = -1;
  assert.throws(() => getDemoAcStats(broken, 12), RangeError);
});
