import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as locationDomain from "../src/domain/weather-location";
import * as weatherDomain from "../src/domain/demo-weather";
import type { useDemoForecast } from "../src/components/use-demo-forecast";
import { createDemoApplimon } from "../src/domain/applimon-catalog";
import { recruitConfiguredApplimon } from "../src/domain/appliance-recruitment";
import { buildDemoScenario, DEFAULT_DEMO_PROFILE, parseDemoProfile, validateDemoProfile, type DemoProfile } from "../src/domain/demo";
import { getDemoAcStats } from "../src/domain/demo-activity";
import { approveDemoCommand, createDemoCommandSession, requestDemoCommand, restoreDemoCommandSession, serializeDemoCommandSession } from "../src/domain/demo-commands";
import { createSyntheticWeather, type DemoWeather } from "../src/domain/demo-weather";
import { evaluateSchedule } from "../src/domain/scheduling";
import { getSimulationStats } from "../src/domain/simulation";

const selectedPlace: locationDomain.WeatherLocation = {id:5378538,name:"Oakland",admin1:"California",admin2:"Alameda County",country:"United States",countryCode:"US",latitude:37.8044,longitude:-122.2708,timezone:"America/Los_Angeles"};
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
function forecast(): DemoWeather {
  const base = createSyntheticWeather("california");
  const hours = (day: string, temperatureC: number) => Array.from({ length: 24 }, (_, hour) => ({
    time: `${day}T${String(hour).padStart(2, "0")}:00`, temperatureC, humidityPercent: 60, weatherCode: 0,
  }));
  return { ...base, location:selectedPlace, source: "live", sourceLabel: "Open-Meteo test fixture — not telemetry", sourceUrl: "https://open-meteo.com/",
    currentTime: "2026-10-24T12:00", fetchedAt: "2026-10-24T19:00:00.000Z", temperatureC: 35,
    hourly: hours("2026-10-24", 35), nextDayHourly: hours("2026-10-25", 20) };
}
const profile = (changes: Partial<DemoProfile> = {}): DemoProfile => ({ ...DEFAULT_DEMO_PROFILE,
  weatherLocation:selectedPlace, applianceIds: ["evie", "bubbles", "chill"], weatherMode: "live", weatherPreferenceExplicit: true, forecast: forecast(), ...changes });

test("live forecast day two drives distinct cooling without entering flexible savings", () => {
  const world = buildDemoScenario(profile());
  assert.equal(world.acActivity.forecastHourly?.length, 48);
  assert.ok(getDemoAcStats(world.acActivity, 12).currentPowerKw > 0);
  assert.equal(getDemoAcStats(world.acActivity, 36).currentPowerKw, 0);
  const completed = getDemoAcStats(world.acActivity, 48);
  close(completed.completedEnergyKwh, world.backgroundDemand.coolingKwh);
  close(completed.totalEnergyKwh, world.acActivity.energyKwh);
  close(completed.accruedCostUsd, world.acActivity.costUsd);
  assert.equal(world.backgroundDemand.nextDayHourly![0].hour, 24);
  const withoutChill = buildDemoScenario(profile({ applianceIds: ["evie", "bubbles"] }));
  assert.deepEqual(withoutChill.plan, world.plan);
  assert.deepEqual(withoutChill.backgroundDemand, world.backgroundDemand);
  assert.equal(getDemoAcStats(withoutChill.acActivity, 48).totalEnergyKwh, 0);
});

test("snapshot allowlisting and reviewed recruitment preserve both forecast days and household settings", () => {
  const weather = forecast();
  const raw = { ...profile({ planningMode: "balanced", applianceIds: ["chill"], residenceType: "townhouse" }),
    secret: "discard", approvedSavings: 9999, forecast: { ...weather, token: "discard",
      hourly: weather.hourly.map(row => ({ ...row, injectedPowerKw: 999 })) } };
  const saved = parseDemoProfile(JSON.stringify(raw));
  assert.ok(saved);
  assert.deepEqual(saved.forecast, weather);
  assert.equal("secret" in saved, false);
  assert.equal("token" in saved.forecast!, false);
  assert.equal("injectedPowerKw" in saved.forecast!.hourly[0], false);
  const recruited = recruitConfiguredApplimon(saved, createDemoApplimon("spin")).profile;
  assert.deepEqual(recruited.forecast, weather);
  assert.equal(recruited.weatherPreferenceExplicit, true);
  assert.equal(recruited.planningMode, "balanced");
  assert.equal(recruited.residenceType, "townhouse");
  assert.deepEqual(recruited.applianceIds, ["chill"]);
  recruited.forecast!.hourly[0].temperatureC = 10;
  assert.equal(saved.forecast!.hourly[0].temperatureC, 35);
  assert.equal(validateDemoProfile({ ...raw, regionId: "tokyo" }), null);
});

test("reviewed EV passport overrides charging energy, power, baseline and physical window", () => {
  const device = { ...createDemoApplimon("evie"), ratedPowerW: 3600, energyKwh: 9, durationHours: 2.5,
    earliestStartHour: 7, latestStartHour: 10, deadlineHour: 13, baselineStartHour: 7, specSource: "manual" as const };
  const world = buildDemoScenario(profile({ applianceIds: ["evie"], applimons: [device] }));
  const request = world.requests[0];
  assert.equal(request.appliance.kind, "ev");
  if (request.appliance.kind !== "ev") throw Error("EV fixture required");
  assert.deepEqual(request.appliance.constraints, { energyNeededKwh: 9, maxPowerKw: 3.6, availableFromHour: 7, readyByHour: 13 });
  assert.deepEqual(request.startWindow, { earliestHour: 7, latestHour: 10 });
  assert.equal(request.baselineStartHour, 7);
  assert.equal(world.plan!.status, "feasible");
  close(world.plan!.proposed!.energyKwh, 9);
  assert.equal(world.plan!.schedules[0].endHour - world.plan!.schedules[0].startHour, 2.5);
  assert.equal(evaluateSchedule(request, 6, world.energyProfile).feasible, false);
});

test("fractional reviewed dishwasher cycles preserve exact energy across midnight and partial playback", () => {
  const device = { ...createDemoApplimon("bubbles"), ratedPowerW: 2000, energyKwh: 0.9, durationHours: 1.5,
    earliestStartHour: 23, latestStartHour: 23, deadlineHour: 25, baselineStartHour: 23, specSource: "manual" as const };
  const world = buildDemoScenario(profile({ applianceIds: ["bubbles"], applimons: [device] }));
  assert.equal(world.plan!.status, "feasible");
  const schedule = world.plan!.schedules[0];
  assert.equal(schedule.endHour, 24.5);
  assert.equal(schedule.intervals.length, 2);
  close(schedule.intervals[0].energyKwh, 0.6);
  close(schedule.intervals[1].energyKwh, 0.3);
  close(schedule.intervals[1].activeHours, 0.5);
  close(schedule.energyKwh, 0.9);
  close(schedule.costUsd, 0.6 * world.energyProfile[23].priceUsdPerKwh + 0.3 * world.energyProfile[0].priceUsdPerKwh);
  close(getSimulationStats([schedule], 24.25).bubbles.completedEnergyKwh, 0.75);
  close(getSimulationStats([schedule], 25).bubbles.completedEnergyKwh, 0.9);
  close(world.plan!.comparison!.costSavingsUsd, 0);
});

test("morning configured jobs remain executable through commands and persisted approval", () => {
  const device = { ...createDemoApplimon("evie"), ratedPowerW: 4000, energyKwh: 8, durationHours: 2,
    earliestStartHour: 6, latestStartHour: 9, deadlineHour: 11, baselineStartHour: 6, specSource: "manual" as const };
  const world = buildDemoScenario(profile({ applianceIds: ["evie"], applimons: [device] }));
  const initial = createDemoCommandSession(world);
  assert.equal(initial.executionHour, 6);
  assert.equal(initial.requests[0].startWindow.earliestHour, 6);
  const pending = requestDemoCommand(initial, world, "evie", "Find a cheaper plan").session;
  assert.equal(pending.pending!.plan.status, "feasible");
  const approved = approveDemoCommand(pending, world, pending.pending!.id).session;
  assert.equal(approved.status, "running");
  assert.equal(approved.executionHour, 6);
  assert.ok(approved.approved!.plan.schedules[0].endHour <= 11);
  const restored = restoreDemoCommandSession(serializeDemoCommandSession(approved, world), world)!;
  assert.equal(restored.status, "paused");
  assert.equal(restored.executionHour, 6);
});

test("forecast refresh invalidates old approval and persisted execution even when city and tariffs match", () => {
  const before = buildDemoScenario(profile());
  const pending = requestDemoCommand(createDemoCommandSession(before), before, "evie", "Find a cheaper plan").session;
  const approved = approveDemoCommand(pending, before, pending.pending!.id).session;
  const raw = serializeDemoCommandSession(approved, before);
  const changedForecast = forecast();
  changedForecast.fetchedAt = "2026-10-24T19:10:00.000Z";
  changedForecast.nextDayHourly![12].temperatureC = 38;
  const after = buildDemoScenario(profile({ forecast: changedForecast }));
  assert.deepEqual(before.energyProfile, after.energyProfile);
  assert.deepEqual(before.requests, after.requests);
  const stale = approveDemoCommand(pending, after, pending.pending!.id).session;
  assert.equal(stale.approved, null);
  assert.equal(stale.pending, null);
  assert.equal(restoreDemoCommandSession(raw, after), null);
  const fresh = requestDemoCommand(stale, after, "evie", "Find a cheaper plan").session;
  assert.notEqual(fresh.pending!.id, pending.pending!.id);
  assert.equal(approveDemoCommand(fresh, after, pending.pending!.id).session.approved, null);
});

/** Run the actual hook; React scheduling and the HTTP boundary are the only doubles. */
function forecastHarness(initial: DemoProfile) {
  const states: unknown[] = [], refs: {current: unknown}[] = [];
  const effects: {deps: unknown[]; cleanup?: () => void}[] = [], pending: (() => void)[] = [];
  const requests: {signal?: AbortSignal | null; finish: (response: Response) => void}[] = [];
  const received: DemoWeather[] = [];
  let si = 0, ri = 0, ei = 0, dirty = false, value = initial;
  const react = {
    useState(initial: unknown) { const i = si++; if (!(i in states)) states[i] = initial;
      return [states[i], (next: unknown) => { states[i] = typeof next === "function" ? next(states[i]) : next; dirty = true; }]; },
    useRef(initial: unknown) { const i = ri++; return refs[i] ?? (refs[i] = {current: initial}); },
    useEffect(fn: () => void | (() => void), deps: unknown[]) { const i = ei++, old = effects[i];
      if (!old || deps.some((dep, index) => !Object.is(dep, old.deps[index]))) pending.push(() => {
        old?.cleanup?.(); effects[i] = {deps, cleanup: fn() || undefined};
      }); },
  };
  let deadline: (() => void) | undefined;
  const testModule = {exports: {}};
  const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/use-demo-forecast.ts"), "utf8"),
    {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source, {module: testModule, exports: testModule.exports, AbortController, queueMicrotask, Error,
    setTimeout: (callback: () => void) => { deadline = callback; return 1; }, clearTimeout: () => { deadline = undefined; },
    fetch: (_input: unknown, init: RequestInit) => new Promise<Response>(finish => requests.push({signal: init.signal, finish})),
    require: (name: string) => { if (name === "react") return react; if (name === "@/domain/weather-location") return locationDomain; if (name === "@/domain/demo-weather") return weatherDomain; throw Error(name); },
  });
  const hook = (testModule.exports as {useDemoForecast: typeof useDemoForecast}).useDemoForecast;
  let view: ReturnType<typeof useDemoForecast>;
  const onForecast = (weather: DemoWeather) => received.push(weather);
  function render() { si = ri = ei = 0; dirty = false; view = hook(value, true, onForecast); pending.splice(0).forEach(fn => fn()); return view; }
  async function settle() { for (let i = 0; i < 20; i++) { await Promise.resolve(); if (dirty) render(); } return view; }
  render();
  return {requests, received, settle, timeout: () => deadline?.(), props(next: DemoProfile) {value = next; return render();},
    view: () => view, unmount: () => effects.forEach(effect => effect.cleanup?.())};
}

test("forecast hook rejects late city responses and unmounted completion", async () => {
  const h = forecastHarness(profile({forecast: undefined}));
  await h.settle();
  assert.equal(h.view().loading, true);
  h.props(profile({regionId: "tokyo", forecast: undefined}));
  assert.equal(h.requests[0].signal!.aborted, true);
  h.requests[0].finish(Response.json(forecast()));
  await h.settle();
  assert.equal(h.received.length, 0);
  assert.equal(h.requests.length, 2);
  h.unmount();
  h.requests[1].finish(Response.json(createSyntheticWeather("tokyo")));
  await h.settle();
  assert.equal(h.received.length, 0);
});

test("canceling explicit refresh by switching synthetic clears loading state", async () => {
  const saved = profile();
  const h = forecastHarness(saved);
  await h.settle();
  assert.equal(h.requests.length, 0, "Saved planning snapshot is retained until explicit refresh");
  h.view().refresh();
  await h.settle();
  assert.equal(h.view().loading, true);
  h.props({...saved, weatherMode: "synthetic"});
  await h.settle();
  assert.equal(h.view().loading, false, "Canceled request must clear loading before controls change mode");
  h.unmount();
});


test("forecast hook rejects synthetic fallback and HTTP errors, then accepts an actual retry", async () => {
  const h=forecastHarness(profile({forecast:createSyntheticWeather("california")}));
  await h.settle();
  assert.equal(h.requests.length,1,"Saved synthetic fallback must not suppress fetching");
  h.requests[0].finish(Response.json(createSyntheticWeather("california")));
  await h.settle();
  assert.equal(h.received.length,0);
  assert.match(h.view().notice,/unavailable/);
  assert.equal(h.view().loading,false);
  h.view().refresh(); await h.settle();
  h.requests[1].finish(Response.json({error:"offline"},{status:503}));
  await h.settle(); assert.equal(h.received.length,0);
  h.view().refresh(); await h.settle();
  h.requests[2].finish(Response.json(forecast()));
  await h.settle(); assert.deepEqual(h.received,[forecast()]);
  h.unmount();
});

test("failed forecast refresh retains the real planning snapshot", async () => {
  const h=forecastHarness(profile());
  h.view().refresh(); await h.settle();
  h.requests[0].finish(Response.json(createSyntheticWeather("california")));
  await h.settle();
  assert.equal(h.received.length,0,"Failure must not replace the saved actual snapshot");
  assert.match(h.view().notice,/Keeping your saved forecast/);
  h.unmount();
});


test("hung forecast requests release the weather gate with a retryable error", async () => {
  const h=forecastHarness(profile({forecast:undefined}));
  await h.settle(); assert.equal(h.view().loading,true);
  h.timeout(); await h.settle();
  assert.equal(h.requests[0].signal!.aborted,true);
  assert.equal(h.view().loading,false);
  assert.match(h.view().notice,/unavailable/);
  h.requests[0].finish(Response.json(forecast()));
  await h.settle(); assert.equal(h.received.length,0);
  h.unmount();
});


test("forecast hook requires an explicit place and isolates different places within one scene", async () => {
  const h=forecastHarness(profile({weatherLocation:undefined,forecast:undefined}));
  await h.settle(); assert.equal(h.requests.length,0);
  h.props(profile({forecast:undefined})); await h.settle();
  const next={...selectedPlace,id:5391959,name:"San Francisco",latitude:37.7749,longitude:-122.4194};
  h.props(profile({weatherLocation:next,forecast:undefined}));
  assert.equal(h.requests[0].signal!.aborted,true);
  h.requests[0].finish(Response.json(forecast())); await h.settle();
  assert.equal(h.received.length,0);
  h.requests[1].finish(Response.json({...forecast(),location:next})); await h.settle();
  assert.equal(h.received[0]?.location?.id,next.id); h.unmount();
});

test("forecast hook rejects incorrect location metadata before committing an invalid profile", async () => {
  for(const location of [{...selectedPlace,name:"Wrong city"},{...selectedPlace,latitude:0},{...selectedPlace,id:1}]) {
    const h=forecastHarness(profile({forecast:undefined})); await h.settle();
    h.requests[0].finish(Response.json({...forecast(),location})); await h.settle();
    assert.equal(h.received.length,0); assert.match(h.view().notice,/unavailable/); h.unmount();
  }
});
