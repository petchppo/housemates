import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_REGIONS } from "../src/data/demo-regions";
import { hourlyEnergy } from "../src/data/energy";
import { defaultSchedulingRequests } from "../src/data/scheduling";
import { buildDemoScenario, buildDemoWeather, buildRegionEnergyProfile, calculateBackgroundDemand, DEFAULT_DEMO_PROFILE,
  formatDemoHour, parseDemoProfile, validateDemoProfile, type DemoProfile } from "../src/domain/demo";
import { createSyntheticWeather } from "../src/domain/demo-weather";
import { optimizeHousehold } from "../src/domain/scheduling";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const profile = (changes: Partial<DemoProfile> = {}): DemoProfile => ({ ...DEFAULT_DEMO_PROFILE, applianceIds: ["evie", "bubbles", "chill"], ...changes });

test("demo clock rounds fractional minutes reliably and distinguishes the final 48-hour boundary", () => {
  assert.equal(formatDemoHour(18.4), "Day 1 · 18:24");
  assert.equal(formatDemoHour(18.05), "Day 1 · 18:03");
  assert.equal(formatDemoHour(24), "Day 2 · 00:00");
  assert.equal(formatDemoHour(48), "Day 3 · 00:00");
  assert.equal(formatDemoHour(28 + 5 / 7), "Day 2 · 04:43");
  assert.equal(formatDemoHour(-1), "Day 1 · 00:00");
  assert.equal(formatDemoHour(100), "Day 3 · 00:00");
  for (const invalid of [NaN, Infinity, -Infinity]) assert.throws(() => formatDemoHour(invalid), RangeError);
});

test("all six region presets derive distinct finite 24-hour profiles from the shared data in USD", () => {
  const before = structuredClone(hourlyEnergy);
  const profiles = DEMO_REGIONS.map(region => buildRegionEnergyProfile(region.id));
  assert.equal(DEMO_REGIONS.length, 6);
  assert.equal(new Set(profiles.map(rows => rows[0].priceUsdPerKwh)).size, 6);
  DEMO_REGIONS.forEach((region, index) => {
    assert.equal(region.currency, "USD");
    assert.equal(profiles[index].length, 24);
    profiles[index].forEach((row, hour) => {
      assert.equal(row.hour, hour);
      close(row.priceUsdPerKwh, hourlyEnergy[hour].priceUsdPerKwh * region.priceFactor);
      close(row.carbonGramsPerKwh, hourlyEnergy[hour].carbonGramsPerKwh * region.carbonFactor);
    });
  });
  profiles[0][0].priceUsdPerKwh = 999;
  assert.deepEqual(hourlyEnergy, before);
});

test("the chosen team alone enters the existing optimizer; Chill-only and empty teams cannot claim savings", () => {
  for (const applianceIds of [[], ["chill"], ["evie"], ["bubbles"], ["evie", "bubbles", "chill"]] as DemoProfile["applianceIds"][]) {
    const scenario = buildDemoScenario(profile({ applianceIds }));
    const flexibleIds = applianceIds.filter(id => id !== "chill");
    assert.deepEqual(scenario.requests.map(request => request.appliance.id), flexibleIds);
    if (!flexibleIds.length) {
      assert.equal(scenario.plan, null);
      assert.ok(scenario.assumptions.some(text => /no optimized plan/.test(text)));
    } else {
      assert.equal(scenario.plan?.status, "feasible");
      assert.deepEqual(scenario.plan?.schedules.map(schedule => schedule.applianceId), flexibleIds);
      assert.deepEqual(scenario.plan, optimizeHousehold(scenario.requests, scenario.energyProfile, "cost"));
    }
  }
});

test("residence changes illustrative background demand but never alters flexible energy or savings", () => {
  const apartment = buildDemoScenario(profile({ regionId: "bangkok", residenceType: "apartment" }));
  const townhouse = buildDemoScenario(profile({ regionId: "bangkok", residenceType: "townhouse" }));
  const detached = buildDemoScenario(profile({ regionId: "bangkok", residenceType: "detached" }));
  assert.ok(apartment.backgroundDemand.coolingKwh > 0);
  assert.ok(apartment.backgroundDemand.energyKwh < townhouse.backgroundDemand.energyKwh);
  assert.ok(townhouse.backgroundDemand.energyKwh < detached.backgroundDemand.energyKwh);
  assert.deepEqual(apartment.plan, detached.plan);
  close(detached.plan!.proposed!.energyKwh, 13.2);
  assert.ok(detached.backgroundDemand.assumptions.some(text => /not Chill operation/.test(text)));
});

test("weather shifts heating/cooling estimates while appliance baseline comparisons remain unchanged", () => {
  const cold = createSyntheticWeather("california");
  cold.temperatureC = -5;
  cold.hourly = cold.hourly.map(row => ({ ...row, temperatureC: -5 }));
  const hot = structuredClone(cold);
  hot.temperatureC = 32;
  hot.hourly = hot.hourly.map(row => ({ ...row, temperatureC: 32 }));
  const winter = buildDemoScenario(profile(), cold);
  const summer = buildDemoScenario(profile(), hot);
  close(winter.backgroundDemand.heatingKwh, 24 * (18 + 5) * 0.09);
  close(winter.backgroundDemand.coolingKwh, 0);
  close(summer.backgroundDemand.heatingKwh, 0);
  assert.ok(summer.backgroundDemand.coolingKwh > 0);
  assert.deepEqual(winter.plan, summer.plan);
  close(winter.plan!.comparison!.costSavingsUsd, winter.plan!.baseline!.costUsd - winter.plan!.proposed!.costUsd);
});

test("neutral weather preserves zero demand; negative synthetic prices retain negative background cost", () => {
  const weather = createSyntheticWeather("california");
  weather.temperatureC = 21;
  weather.hourly = weather.hourly.map(row => ({ ...row, temperatureC: 21 }));
  const rates = buildRegionEnergyProfile("california");
  const zero = calculateBackgroundDemand("detached", weather, rates);
  assert.deepEqual([zero.energyKwh, zero.costUsd, zero.carbonGrams], [0, 0, 0]);
  weather.hourly = weather.hourly.map(row => ({ ...row, temperatureC: 10 }));
  const negative = calculateBackgroundDemand("apartment", weather, rates.map(row => ({ ...row, priceUsdPerKwh: -0.1 })));
  assert.ok(negative.energyKwh > 0);
  close(negative.costUsd, negative.energyKwh * -0.1);
  close(negative.costUsd, negative.hourly.reduce((sum, row) => sum + row.costUsd, 0));
  close(negative.carbonGrams, negative.hourly.reduce((sum, row) => sum + row.carbonGrams, 0));
});

test("region-derived profiles preserve signed zero/negative savings in the shared scheduler", () => {
  const scenario = buildDemoScenario(profile({ applianceIds: ["evie"] }));
  const original = structuredClone(scenario.requests[0]);
  original.startWindow = { earliestHour: original.baselineStartHour, latestHour: original.baselineStartHour };
  const zero = optimizeHousehold([original], scenario.energyProfile);
  close(zero.comparison!.costSavingsUsd, 0);
  const forced = structuredClone(original);
  forced.baselineStartHour = 3;
  forced.startWindow = { earliestHour: 18, latestHour: 18 };
  const negative = optimizeHousehold([forced], scenario.energyProfile);
  assert.ok(negative.comparison!.costSavingsUsd < 0);
  close(negative.comparison!.costSavingsUsd, negative.baseline!.costUsd - negative.proposed!.costUsd);
});

test("scenarios copy inputs and shared fixtures; invalid or wrong-region weather cannot enter calculations", () => {
  const input = profile();
  const weather = createSyntheticWeather(input.regionId);
  const before = structuredClone({ input, weather, requests: defaultSchedulingRequests });
  const result = buildDemoScenario(input, weather, "balanced");
  result.profile.applianceIds.length = 0;
  result.weather.hourly[0].temperatureC = 50;
  result.requests[0].startWindow.earliestHour = 0;
  assert.deepEqual({ input, weather, requests: defaultSchedulingRequests }, before);
  assert.throws(() => buildDemoScenario(input, createSyntheticWeather("tokyo")), RangeError);
  assert.throws(() => buildDemoScenario(input, { ...weather, temperatureC: NaN }), RangeError);
  assert.throws(() => calculateBackgroundDemand("detached", weather, []), RangeError);
  assert.throws(() => calculateBackgroundDemand("detached", weather, hourlyEnergy.map(row => ({ ...row, carbonGramsPerKwh: -1 }))), RangeError);
});

test("persisted profiles validate enums, schema, team uniqueness, size and numeric/prototype injections", () => {
  const input = profile({ applianceIds: ["chill", "evie"] });
  assert.deepEqual(parseDemoProfile(JSON.stringify(input))?.applianceIds, ["evie", "chill"]);
  assert.deepEqual(validateDemoProfile(DEFAULT_DEMO_PROFILE)?.applianceIds, []);
  for (const value of [null, [], {}, Object.create(input), { ...input, version: 2 }, { ...input, regionId: "__proto__" },
    { ...input, residenceType: "palace" }, { ...input, weatherMode: "telemetry" },
    { ...input, applianceIds: ["evie", "evie"] }, { ...input, applianceIds: ["unknown"] },
    { ...input, applianceIds: new Array(1) }, { ...input, applianceIds: [Infinity] }]) assert.equal(validateDemoProfile(value), null);
  assert.equal(parseDemoProfile("{bad"), null);
  assert.equal(parseDemoProfile(" ".repeat(3000)), null);
  assert.equal(parseDemoProfile(null), null);
  const injection = JSON.parse(JSON.stringify(input).replace('"version":1', '"__proto__":{"polluted":true},"costUsd":-999,"version":1'));
  const restored = validateDemoProfile(injection)!;
  assert.equal(Object.getPrototypeOf(restored), Object.prototype);
  assert.equal("polluted" in restored, false);
  assert.equal("costUsd" in restored, false);
  restored.applianceIds.push("bubbles");
  assert.equal(input.applianceIds.length, 2);
});

test("synthetic what-if preferences survive restore and affect temperatures/background without inventing appliance savings", () => {
  const input = profile({ regionId: "bangkok", weatherMode: "synthetic", weatherOffsetC: 5, weatherCode: 61 });
  const restored = parseDemoProfile(JSON.stringify(input));
  assert.deepEqual(restored, input);
  const base = createSyntheticWeather("bangkok");
  const before = structuredClone(base);
  const adjusted = buildDemoWeather(restored!);
  assert.equal(adjusted.source, "synthetic");
  assert.match(adjusted.sourceLabel, /what-if/);
  close(adjusted.temperatureC, base.temperatureC + 5);
  adjusted.hourly.forEach((row, hour) => {
    close(row.temperatureC, base.hourly[hour].temperatureC + 5);
    assert.equal(row.humidityPercent, base.hourly[hour].humidityPercent);
    assert.equal(row.weatherCode, 61);
  });
  assert.deepEqual(base, before);
  const hot = buildDemoScenario(restored!);
  const original = buildDemoScenario(profile({ regionId: "bangkok" }));
  assert.deepEqual(hot.weather, adjusted);
  assert.ok(hot.backgroundDemand.coolingKwh > original.backgroundDemand.coolingKwh);
  assert.deepEqual(hot.plan, original.plan);
  assert.deepEqual(buildDemoWeather(profile()), createSyntheticWeather("california"));
});

test("synthetic weather override boundaries are finite, whole and explicit rather than silently coerced", () => {
  for (const weatherOffsetC of [-11, 11, 0.5, NaN, Infinity, -Infinity, null, "5"]) {
    assert.equal(validateDemoProfile({ ...profile(), weatherOffsetC }), null);
  }
  for (const weatherCode of [2, 45, 99, NaN, Infinity, -1, null, "61"]) {
    assert.equal(validateDemoProfile({ ...profile(), weatherCode }), null);
  }
  for (const region of DEMO_REGIONS) {
    for (const weatherOffsetC of [-10, 0, 10]) {
      for (const weatherCode of [0, 3, 61, 73]) {
        const input = profile({ regionId: region.id, weatherOffsetC, weatherCode });
        const weather = buildDemoWeather(input);
        assert.equal(weather.source, "synthetic");
        assert.equal(weather.weatherCode, weatherCode);
        assert.ok(weather.hourly.every(row => Number.isFinite(row.temperatureC)));
        assert.equal(buildDemoScenario(input).weather.temperatureC, weather.temperatureC);
      }
    }
  }
  assert.throws(() => buildDemoWeather({ ...profile(), weatherOffsetC: 11 }), RangeError);
});
