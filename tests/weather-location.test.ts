import assert from "node:assert/strict";
import test from "node:test";
import { parseWeatherLocation, weatherLocationLabel, weatherLocationsMatch, type WeatherLocation } from "../src/domain/weather-location";
import { createWeatherLocationProvider, createWeatherLocationsService } from "../src/server/weather-locations";
import { DEFAULT_DEMO_PROFILE, buildDemoScenario, parseDemoProfile } from "../src/domain/demo";
import { copyDemoWeather, createSyntheticWeather, type DemoWeather } from "../src/domain/demo-weather";
import { approveDemoCommand, createDemoCommandSession, requestDemoCommand, serializeDemoCommandSession, restoreDemoCommandSession } from "../src/domain/demo-commands";

const paris: WeatherLocation = { id: 2988507, name: "Paris", admin1: "Île-de-France", admin2: "Paris", country: "France", countryCode: "FR", latitude: 48.85341, longitude: 2.3488, timezone: "Europe/Paris" };
const berlin: WeatherLocation = { id: 2950159, name: "Berlin", admin1: "Berlin", country: "Germany", countryCode: "DE", latitude: 52.52437, longitude: 13.41053, timezone: "Europe/Berlin" };
const raw = (location = paris) => ({ ...location, country_code: location.countryCode, feature_code: "PPLC", elevation: 42, population: 1000, url: "https://untrusted.example" });
function snapshot(location = paris): DemoWeather {
  const base = createSyntheticWeather("bangkok");
  return { ...base, location, timezone: location.timezone, source: "live", sourceLabel: "Open-Meteo forecast fixture", sourceUrl: "https://open-meteo.com/", currentTime: "2026-10-24T21:15", fetchedAt: "2026-10-24T19:15:00.000Z", hourly: base.hourly.map(row => ({ ...row, time: row.time.replace("2000-01-01", "2026-10-24") })) };
}

test("public location parsing bounds scalars, validates timezone, disambiguates administrative names and drops metadata", () => {
  const parsed = parseWeatherLocation({ ...paris, privateField: "discard", unknown: { anything: true } });
  assert.deepEqual(parsed, paris); assert.notEqual(parsed, paris);
  assert.equal(weatherLocationLabel(paris), "Paris, Île-de-France, France");
  assert.equal(weatherLocationLabel({ ...paris, name: "Springfield", admin2: "Hampden County", admin1: "Massachusetts", country: "United States" }), "Springfield, Hampden County, Massachusetts, United States");
  for (const change of [{ id: 0 }, { id: 1.5 }, { id: 2147483648 }, { latitude: NaN }, { longitude: 181 }, { name: " Paris " }, { name: "\u0000Paris" }, { admin1: "" }, { countryCode: "fr" }, { timezone: "not/a/timezone" }, { timezone: "Europe/Paris\n" }, { country: "x".repeat(121) }]) assert.equal(parseWeatherLocation({ ...paris, ...change }), null);
});

test("selected place and forecast survive safe persistence and reject stale or relabeled locations", () => {
  const profile = { ...DEFAULT_DEMO_PROFILE, regionId: "bangkok", weatherMode: "live", applianceIds: ["evie", "chill"], weatherLocation: { ...paris, drop: true }, forecast: { ...snapshot(), extra: "discard", location: { ...paris, extra: "discard" } } };
  const saved = parseDemoProfile(JSON.stringify(profile)); assert.ok(saved);
  assert.deepEqual(saved.weatherLocation, paris); assert.deepEqual(saved.forecast?.location, paris);
  assert.equal("extra" in saved.forecast!, false);
  const world = buildDemoScenario(saved); assert.equal(world.region.id, "bangkok"); assert.equal(world.weather.timezone, "Europe/Paris");
  assert.equal(parseDemoProfile(JSON.stringify({ ...profile, weatherLocation: berlin })), null);
  assert.equal(parseDemoProfile(JSON.stringify({ ...profile, weatherLocation: undefined })), null);
  assert.equal(parseDemoProfile(JSON.stringify({ ...profile, forecast: createSyntheticWeather("bangkok") })), null);
  assert.equal(parseDemoProfile(JSON.stringify({ ...profile, forecast: { ...snapshot(), location: { ...paris, name: "A different place" } } })), null);
  assert.ok(parseDemoProfile(JSON.stringify({ ...profile, forecast: undefined })));
  assert.equal(copyDemoWeather({ ...snapshot(), timezone: "Asia/Bangkok" }, "bangkok"), null);
  assert.equal(weatherLocationsMatch(paris, berlin), false);
});

test("changing actual weather place invalidates pending and persisted approval even in the same scene", () => {
  const world = (location: WeatherLocation) => buildDemoScenario({ ...DEFAULT_DEMO_PROFILE, regionId: "bangkok", weatherMode: "live", applianceIds: ["evie", "bubbles"], weatherLocation: location, forecast: snapshot(location) });
  const first = world(paris), second = world(berlin);
  const proposal = requestDemoCommand(createDemoCommandSession(first), first, "evie", "Find a cheaper plan").session;
  assert.ok(proposal.pending);
  const rejected = approveDemoCommand(proposal, second, proposal.pending.id).session;
  assert.equal(rejected.approved, null); assert.notEqual(rejected.status, "running");
  const approved = approveDemoCommand(proposal, first, proposal.pending.id).session;
  assert.equal(approved.status, "running");
  assert.equal(restoreDemoCommandSession(serializeDemoCommandSession(approved, first), second), null);
});

test("geocoder searches a global bounded official URL, returns reviewed fields and resolves trusted IDs", async () => {
  const calls: URL[] = [];
  const provider = createWeatherLocationProvider({ fetcher: async (url, options) => {
    const target = new URL(String(url)); calls.push(target);
    assert.equal(target.origin, "https://geocoding-api.open-meteo.com"); assert.equal(options?.redirect, "error"); assert.equal(options?.credentials, "omit");
    return Response.json(target.pathname.endsWith("search") ? { results: [raw(), raw(), { ...raw(berlin), timezone: "bad" }] } : raw(berlin));
  } });
  const results = await provider.search("Paris, France"); assert.deepEqual(results, [paris]);
  assert.equal(calls[0].searchParams.get("name"), "Paris, France"); assert.equal(calls[0].searchParams.get("count"), "10"); assert.equal(calls[0].searchParams.has("countryCode"), false);
  results[0].name = "mutated"; assert.deepEqual(await provider.resolve(paris.id), paris); assert.equal(calls.length, 1);
  assert.deepEqual(await provider.resolve(berlin.id), berlin); assert.equal(calls[1].pathname, "/v1/get"); assert.equal(calls[1].searchParams.get("id"), String(berlin.id));
});

test("location lookup coalesces identical searches and bounds cache retention and concurrency", async () => {
  let calls = 0, now = 1, release!: (value: Response) => void;
  const provider = createWeatherLocationProvider({ now: () => now, cacheLimit: 2, inflightLimit: 1, fetcher: async () => { calls++; if (calls === 1) return new Promise<Response>(done => { release = done; }); return Response.json({ results: [raw()] }); } });
  const first = provider.search("Paris"), duplicate = provider.search("PARIS"); assert.equal(calls, 1);
  await assert.rejects(provider.search("Berlin"), /busy/);
  release(Response.json({ results: [raw()] })); await first; await duplicate;
  await provider.search("Paris"); assert.equal(calls, 1);
  await provider.search("Elsewhere"); await provider.search("Paris"); assert.equal(calls, 3);
  now += 24 * 60 * 60_000 + 1; await provider.search("Paris"); assert.equal(calls, 4);
});

test("location lookup rejects invalid provider identity, excessive bodies and hanging requests", async () => {
  const mismatch = createWeatherLocationProvider({ fetcher: async () => Response.json(raw(berlin)) });
  await assert.rejects(mismatch.resolve(paris.id), /requested place/);
  const oversized = createWeatherLocationProvider({ fetcher: async () => new Response("x".repeat(64_001)) });
  await assert.rejects(oversized.search("Paris"), /too large/);
  const invalid = createWeatherLocationProvider({ fetcher: async () => Response.json({ results: [{ ...raw(), latitude: 200 }] }) });
  await assert.rejects(invalid.search("Paris"), /requested place/);
  let signal: AbortSignal | null | undefined;
  const hanging = createWeatherLocationProvider({ timeoutMs: 5, fetcher: async (_, init) => { signal = init?.signal; return new Promise<Response>(() => {}); } });
  await assert.rejects(hanging.search("Paris"), /timed out/); assert.equal(signal?.aborted, true);
  let canceledBody = false;
  const stalledBody = createWeatherLocationProvider({ timeoutMs: 5, fetcher: async () => new Response(new ReadableStream({ cancel() { canceledBody = true; } })) });
  await assert.rejects(stalledBody.search("Paris"), /timed out/); assert.equal(canceledBody, true);
  for (const id of [0, -1, 1.2, Infinity, NaN]) await assert.rejects(mismatch.resolve(id), RangeError);
});

test("location API rejects duplicated or unsupported queries and exposes safe failures", async () => {
  let calls = 0;
  const serve = createWeatherLocationsService({ search: async () => { calls++; return [paris]; }, resolve: async () => paris });
  const request = (query: string) => new Request(`http://localhost:3000/api/weather/locations?${query}`);
  for (const query of ["", "q=P", "q=Paris&q=Berlin", "q=Paris&latitude=12", `q=${"x".repeat(81)}`]) assert.equal((await serve(request(query))).status, 400);
  assert.equal(calls, 0); assert.deepEqual(await (await serve(request("q=Paris"))).json(), { locations: [paris] });
  const broken = createWeatherLocationsService({ search: async () => { throw Error("provider secret details"); }, resolve: async () => paris });
  const response = await broken(request("q=Paris")); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret/);
});


test("city/county search filters facilities and retries county base names without inventing labels", async () => {
  const searched: string[] = [];
  const county = { ...paris, id: 5322745, name: "Alameda", admin1: "California", admin2: "Alameda County", country: "United States", countryCode: "US", latitude: 37.65, longitude: -121.91, timezone: "America/Los_Angeles" };
  const provider = createWeatherLocationProvider({ fetcher: async url => {
    const query = new URL(String(url)).searchParams.get("name")!; searched.push(query);
    return Response.json({ results: query === "Alameda County, California" ? [{ ...raw(county), name: "Alameda County Fairgrounds", feature_code: "RECG" }, { ...raw(county), id: 3, name: "Parking Garage Heliport", feature_code: "AIRH" }] : [{ ...raw(county), feature_code: "ADM2" }] });
  } });
  assert.deepEqual(await provider.search("Alameda County, California"), [county]);
  assert.deepEqual(searched, ["Alameda County, California", "Alameda, California"]);
  assert.equal((await provider.resolve(county.id)).name, "Alameda");
  const facility = createWeatherLocationProvider({ fetcher: async () => Response.json({ ...raw(county), feature_code: "AIRH" }) });
  await assert.rejects(facility.resolve(county.id), /requested place/);
});
