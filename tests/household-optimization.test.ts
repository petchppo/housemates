import assert from "node:assert/strict";
import test from "node:test";
import { APPLIMON_IDS, createDemoApplimon } from "../src/domain/applimon-catalog";
import { buildDemoScenario, DEFAULT_DEMO_PROFILE } from "../src/domain/demo";
import { createSyntheticWeather } from "../src/domain/demo-weather";
import { createDemoCommandSession, requestDemoCommand } from "../src/domain/demo-commands";
import { buildCoordinatedContext } from "../src/domain/household-optimization";

const all = () => buildDemoScenario({ ...DEFAULT_DEMO_PROFILE, applianceIds: ["evie", "bubbles", "chill"], applimons: APPLIMON_IDS.map(createDemoApplimon) });

test("all-party snapshot includes every recruited category exactly once and preserves negotiated constraints", () => {
  const scenario = all();
  const revised = requestDemoCommand(createDemoCommandSession(scenario), scenario, "bubbles", "Don't run the dishwasher after 10 PM");
  assert.ok(revised.session.pending);
  const extra = scenario.profile.applimons!.filter(row => !["evie", "bubbles", "chill"].includes(row.id));
  const spin = extra.find(row => row.id === "spin")!;
  spin.latestStartHour = 14; spin.deadlineHour = 16;
  const context = buildCoordinatedContext(scenario, revised.session.pending.requests, extra);
  assert.equal(context.inventory.length, 10);
  assert.equal(new Set(context.inventory.map(row => row.id)).size, 10);
  assert.deepEqual(context.coreRequests, revised.session.pending.requests);
  assert.equal(context.inventory.find(row => row.id === "spin")!.deadlineHour, 16);
  assert.equal(context.inventory.find(row => row.id === "spin")!.baselineStartHour, 18);
  context.coreRequests[0].startWindow.earliestHour = 0;
  assert.notEqual(revised.session.pending.requests[0].startWindow.earliestHour, 0, "snapshot cannot mutate the current command proposal");
});

test("thermal background spans 48 hours, repeats only missing day two, and never adds Chill twice", () => {
  const scenario = all(), context = buildCoordinatedContext(scenario);
  assert.equal(context.backgroundPowerKw.length, 48);
  assert.deepEqual(context.backgroundPowerKw.slice(0, 24), context.backgroundPowerKw.slice(24));
  assert.ok(Math.abs(context.backgroundTotals.energyKwh - scenario.backgroundDemand.energyKwh * 2) < 1e-9);
  assert.ok(Math.abs(context.backgroundTotals.costUsd - scenario.backgroundDemand.costUsd * 2) < 1e-9);
  const noChill = buildDemoScenario({ ...scenario.profile, applianceIds: ["evie", "bubbles"] });
  assert.deepEqual(buildCoordinatedContext(noChill).backgroundPowerKw, context.backgroundPowerKw);
  assert.match(context.weatherLabel, /one day repeated/);
});

test("distinct next-day temperature changes headroom but never fabricates a tariff change", () => {
  const weather = createSyntheticWeather("california");
  const tomorrow = new Date(Date.parse(`${weather.currentTime.slice(0, 10)}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  weather.nextDayHourly = weather.hourly.map((row, hour) => ({ ...row, temperatureC: 38, time: `${tomorrow}T${String(hour).padStart(2, "0")}:00` }));
  const original = all(), warm = buildDemoScenario(original.profile, weather);
  const before = buildCoordinatedContext(original), after = buildCoordinatedContext(warm);
  assert.deepEqual(after.backgroundPowerKw.slice(0, 24), before.backgroundPowerKw.slice(0, 24));
  assert.notDeepEqual(after.backgroundPowerKw.slice(24), before.backgroundPowerKw.slice(24));
  assert.deepEqual(after.energyProfile, before.energyProfile);
  assert.deepEqual(after.inventory, before.inventory);
  assert.notEqual(after.contextKey, before.contextKey);
  assert.equal(after.weatherTemperaturesC[30], 38);
  assert.match(after.weatherLabel, /two distinct days/);
  assert.ok(Math.abs(after.backgroundTotals.energyKwh - [...warm.backgroundDemand.hourly, ...warm.backgroundDemand.nextDayHourly!].reduce((sum, row) => sum + row.energyKwh, 0)) < 1e-9);
});

test("invalid or missing current parties never silently replace negotiated settings with catalog defaults", () => {
  const scenario = all();
  assert.throws(() => buildCoordinatedContext(scenario, scenario.requests, []), RangeError);
  assert.throws(() => buildCoordinatedContext(scenario, []), RangeError);
  const duplicate = [createDemoApplimon("spin"), createDemoApplimon("spin")];
  assert.throws(() => buildCoordinatedContext(scenario, scenario.requests, duplicate), RangeError);
  assert.throws(() => buildCoordinatedContext({ ...scenario, weather: { ...scenario.weather, temperatureC: NaN } }), RangeError);
});

test("legacy and empty households get only recruited devices, without importing the full catalog", () => {
  const ev = buildDemoScenario({ ...DEFAULT_DEMO_PROFILE, applianceIds: ["evie"] });
  assert.deepEqual(buildCoordinatedContext(ev).inventory.map(row => row.id), ["evie"]);
  const empty = buildCoordinatedContext(buildDemoScenario(DEFAULT_DEMO_PROFILE));
  assert.deepEqual(empty.inventory, []);
  assert.deepEqual(empty.coreRequests, []);
});

test("input fingerprints invalidate results for constraints, rates, inventory and weather, not preview clocks", () => {
  const scenario = all(), first = buildCoordinatedContext(scenario);
  const changed = structuredClone(scenario.requests); changed[0].startWindow.latestHour--;
  assert.notEqual(buildCoordinatedContext(scenario, changed).contextKey, first.contextKey);
  const rates = structuredClone(scenario); rates.energyProfile[0].priceUsdPerKwh += .01;
  assert.notEqual(buildCoordinatedContext(rates).contextKey, first.contextKey);
  const corruptCache = { ...scenario, backgroundDemand: { ...scenario.backgroundDemand, energyKwh: 99999 } };
  assert.equal(buildCoordinatedContext(corruptCache).backgroundTotals.energyKwh, first.backgroundTotals.energyKwh, "recompute authoritative totals instead of trusting cached results");
});
