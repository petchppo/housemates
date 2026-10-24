import assert from "node:assert/strict";
import test from "node:test";
import { createWeatherService } from "../src/server/weather-service";
import { createSyntheticWeather, type DemoWeather } from "../src/domain/demo-weather";

const NOW = Date.parse("2026-10-24T19:15:00.000Z");
function weather(now = NOW): DemoWeather {
  const base = createSyntheticWeather("california");
  return { ...base, source: "live", sourceLabel: "Open-Meteo model, test response", sourceUrl: "https://open-meteo.com/", fetchedAt: new Date(now).toISOString(), currentTime: "2026-10-24T12:15",
    hourly: base.hourly.map(row => ({ ...row, time: row.time.replace("2000-01-01", "2026-10-24") })),
    nextDayHourly: base.hourly.map(row => ({ ...row, time: row.time.replace("2000-01-01", "2026-10-25"), temperatureC: row.temperatureC + 4 })) };
}
const req = (query = "region=california") => new Request(`http://localhost:3000/api/weather?${query}`);

test("weather service permits only one fixed public city and caches a live response for ten minutes", async () => {
  let now = NOW, calls = 0;
  const serve = createWeatherService(async (id, options) => { calls++; assert.equal(id, "california"); assert.equal(options?.timeoutMs, 5000); return weather(now); }, () => now);
  for (const query of ["", "region=unknown", "region=california&region=tokyo", "region=https://internal.example", "region=__proto__"]) assert.equal((await serve(req(query))).status, 400);
  assert.equal(calls, 0);
  const first = await serve(req()); assert.equal(first.status, 200); assert.equal(first.headers.get("x-housemates-weather"), "refreshed");
  assert.equal((await first.json()).nextDayHourly.length, 24);
  now += 9 * 60000;
  assert.equal((await serve(req())).headers.get("x-housemates-weather"), "cached"); assert.equal(calls, 1);
  now += 60001;
  assert.equal((await serve(req())).headers.get("x-housemates-weather"), "refreshed"); assert.equal(calls, 2);
});

test("simultaneous same-city requests share one bounded provider call, while failures recover quickly", async () => {
  let resolve!: (value: DemoWeather) => void, calls = 0;
  const blocked = new Promise<DemoWeather>(done => { resolve = done; });
  const serve = createWeatherService(async () => { calls++; return blocked; }, () => NOW);
  const first = serve(req()), second = serve(req()); assert.equal(calls, 1);
  resolve(weather()); assert.equal((await first).status, 200); assert.equal((await second).status, 200);
  let now = NOW, failures = 0;
  const fallback = createWeatherService(async () => { failures++; return { ...createSyntheticWeather("california"), fallbackReason: "Provider unavailable" }; }, () => now);
  assert.equal((await (await fallback(req())).json()).source, "synthetic");
  now += 20000; await fallback(req()); assert.equal(failures, 1);
  now += 10001; await fallback(req()); assert.equal(failures, 2);
});

test("service never leaks invalid or wrong-region loader results and failed promises can be retried", async () => {
  let calls = 0;
  const serve = createWeatherService(async () => { calls++; if (calls === 1) throw Error("provider secret details"); if (calls === 2) return createSyntheticWeather("tokyo"); return weather(); }, () => NOW);
  const failed = await serve(req()); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /secret/);
  assert.equal((await serve(req())).status, 503);
  assert.equal((await serve(req())).status, 200);
});

test("selected forecast resolves a trusted place ID and isolates same-scene location caches", async () => {
  const places = [
    { id: 5391959, name: "San Francisco", country: "United States", countryCode: "US", latitude: 37.77493, longitude: -122.41942, timezone: "America/Los_Angeles" },
    { id: 5392171, name: "San Jose", country: "United States", countryCode: "US", latitude: 37.33939, longitude: -121.89496, timezone: "America/Los_Angeles" },
  ];
  const lookedUp: number[] = [], loaded: number[] = [];
  const serve = createWeatherService(async (_, options) => { assert.ok(options?.location); loaded.push(options.location.id); return { ...weather(), location: options.location }; }, () => NOW, async id => { lookedUp.push(id); return places.find(place => place.id === id)!; });
  for (const place of places) {
    const response = await serve(req(`region=california&locationId=${place.id}`)); assert.equal(response.status, 200); assert.equal((await response.json()).location.id, place.id);
  }
  await serve(req(`region=california&locationId=${places[0].id}`));
  assert.deepEqual(loaded, places.map(place => place.id)); assert.deepEqual(lookedUp, loaded);
  for (const query of ["region=california&locationId=0", "region=california&locationId=-1", "region=california&locationId=1.2", "region=california&locationId=1&locationId=2", "region=california&locationId=1&latitude=90"]) assert.equal((await serve(req(query))).status, 400);
});

test("selected-location failures and mismatched forecasts return503 rather than synthetic success", async () => {
  const location = { id: 5391959, name: "San Francisco", country: "United States", countryCode: "US", latitude: 37.77493, longitude: -122.41942, timezone: "America/Los_Angeles" };
  const request = req(`region=california&locationId=${location.id}`);
  for (const result of [createSyntheticWeather("california"), weather(), { ...weather(), location: { ...location, id: 123 } }]) {
    const serve = createWeatherService(async () => result, () => NOW, async () => location);
    const response = await serve(request); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /synthetic/);
  }
  let loads = 0;
  const incorrectId = createWeatherService(async () => { loads++; return weather(); }, () => NOW, async () => ({ ...location, id: 123 }));
  assert.equal((await incorrectId(request)).status, 503); assert.equal(loads, 0);
});
