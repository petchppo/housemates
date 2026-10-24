import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_REGIONS, getDemoRegion, type RegionId } from "../src/data/demo-regions";
import { copyDemoWeather, createSyntheticWeather, fetchDemoWeather, isDemoWeather, isWeatherSnapshotFresh, normalizeOpenMeteoWeather } from "../src/domain/demo-weather";

function apiResponse(regionId: RegionId = "california") {
  const region = getDemoRegion(regionId);
  const units = { time: "iso8601", temperature_2m: "°C", relative_humidity_2m: "%", weather_code: "wmo code" };
  return { latitude: region.latitude, longitude: region.longitude, timezone: region.timezone,
    current_units: { ...units }, hourly_units: { ...units },
    current: { time: "2026-10-24T12:15", temperature_2m: 18.5, relative_humidity_2m: 61, weather_code: 2 },
    hourly: { time: Array.from({ length: 24 }, (_, hour) => `2026-10-24T${String(hour).padStart(2, "0")}:00`),
      temperature_2m: Array.from({ length: 24 }, (_, hour) => 15 + hour / 10), relative_humidity_2m: Array(24).fill(60) as number[],
      weather_code: Array(24).fill(2) as number[] } };
}

test("all synthetic presets are deterministic, isolated complete local days and clearly non-current", () => {
  for (const region of DEMO_REGIONS) {
    const first = createSyntheticWeather(region.id);
    const second = createSyntheticWeather(region.id);
    assert.deepEqual(first, second);
    assert.equal(first.source, "synthetic");
    assert.match(first.sourceLabel, /not current/);
    assert.equal(first.timezone, region.timezone);
    assert.equal(isDemoWeather(first, region.id), true);
    assert.equal(first.hourly.length, 24);
    first.hourly[0].temperatureC = 999;
    assert.notEqual(second.hourly[0].temperatureC, 999);
  }
});

test("valid external weather retains Celsius, humidity, WMO code and source-local timestamps", () => {
  for (const region of DEMO_REGIONS) {
    const payload = apiResponse(region.id);
    const before = structuredClone(payload);
    const result = normalizeOpenMeteoWeather(payload, region.id);
    assert.ok(result);
    assert.equal(result.source, "live");
    assert.equal(result.temperatureC, 18.5);
    assert.equal(result.humidityPercent, 61);
    assert.equal(result.weatherCode, 2);
    assert.equal(result.currentTime, "2026-10-24T12:15");
    assert.equal(result.timezone, region.timezone);
    assert.equal(result.hourly[23].time, "2026-10-24T23:00");
    assert.match(result.sourceLabel, /not household telemetry/);
    result.hourly[0].temperatureC = 100;
    assert.deepEqual(payload, before);
  }
});

test("external responses reject unit mismatches, wrong cities/timezones, malformed calendars and impossible readings", () => {
  const bad = [
    (value: ReturnType<typeof apiResponse>) => { value.current_units.temperature_2m = "°F"; },
    (value: ReturnType<typeof apiResponse>) => { value.hourly_units.relative_humidity_2m = "ratio"; },
    (value: ReturnType<typeof apiResponse>) => { value.timezone = "Asia/Tokyo"; },
    (value: ReturnType<typeof apiResponse>) => { value.latitude = 0; },
    (value: ReturnType<typeof apiResponse>) => { value.current.time = "2026-02-30T12:15"; },
    (value: ReturnType<typeof apiResponse>) => { value.current.time = "2026-10-25T12:15"; },
    (value: ReturnType<typeof apiResponse>) => { value.current.temperature_2m = NaN; },
    (value: ReturnType<typeof apiResponse>) => { value.current.temperature_2m = 150; },
    (value: ReturnType<typeof apiResponse>) => { value.current.relative_humidity_2m = 101; },
    (value: ReturnType<typeof apiResponse>) => { value.current.weather_code = 999; },
    (value: ReturnType<typeof apiResponse>) => { value.hourly.temperature_2m[3] = Infinity; },
    (value: ReturnType<typeof apiResponse>) => { value.hourly.relative_humidity_2m[3] = -1; },
    (value: ReturnType<typeof apiResponse>) => { value.hourly.weather_code[3] = 6; },
    (value: ReturnType<typeof apiResponse>) => { value.hourly.time[2] = value.hourly.time[1]; },
    (value: ReturnType<typeof apiResponse>) => { value.hourly.time.reverse(); },
    (value: ReturnType<typeof apiResponse>) => { value.hourly.temperature_2m.pop(); },
    (value: ReturnType<typeof apiResponse>) => { value.hourly.time.push("2026-10-25T00:00"); },
  ];
  for (const mutate of bad) {
    const payload = apiResponse();
    mutate(payload);
    assert.equal(normalizeOpenMeteoWeather(payload, "california"), null);
  }
  for (const payload of [null, [], {}, { error: true }, { ...apiResponse(), current: null },
    { ...apiResponse(), current_units: null }, { ...apiResponse(), hourly: { time: new Array(24) } }]) {
    assert.equal(normalizeOpenMeteoWeather(payload, "california"), null);
  }
});

test("optional fetch sends only public city parameters and normalizes a successful response", async () => {
  let requested: URL | undefined;
  let settings: RequestInit | undefined;
  const result = await fetchDemoWeather("tokyo", { now: () => Date.parse("2026-10-24T03:15:00.000Z"), fetcher: async (input, init) => {
    requested = new URL(String(input)); settings = init;
    return Response.json(apiResponse("tokyo"));
  } });
  assert.equal(result.source, "live");
  assert.equal(requested?.origin, "https://api.open-meteo.com");
  assert.equal(requested?.pathname, "/v1/forecast");
  assert.equal(requested?.searchParams.get("latitude"), String(getDemoRegion("tokyo").latitude));
  assert.equal(requested?.searchParams.get("timezone"), "Asia/Tokyo");
  assert.equal(requested?.searchParams.get("forecast_days"), "2");
  assert.equal(requested?.searchParams.get("temperature_unit"), "celsius");
  assert.equal(settings?.credentials, "omit");
  assert.equal(settings?.referrerPolicy, "no-referrer");
});

test("network, HTTP, malformed JSON and invalid weather all fall back without claiming a live source", async () => {
  const fetchers: typeof fetch[] = [
    async () => { throw new TypeError("offline"); },
    async () => new Response("unavailable", { status: 503 }),
    async () => new Response("not json", { status: 200 }),
    async () => Response.json({ error: "bad" }),
    async () => Response.json(apiResponse("oslo")),
  ];
  for (const fetcher of fetchers) {
    const result = await fetchDemoWeather("bangkok", { fetcher });
    assert.equal(result.source, "synthetic");
    assert.equal(result.regionId, "bangkok");
    assert.match(result.fallbackReason!, /unavailable or invalid/);
    assert.equal(isDemoWeather(result, "bangkok"), true);
  }
});

test("timeouts resolve to a fallback even if a fetcher ignores abort or response JSON never resolves", async () => {
  for (const fetcher of [
    (async () => new Promise<Response>(() => {})) as typeof fetch,
    (async () => ({ ok: true, json: () => new Promise(() => {}) } as unknown as Response)) as typeof fetch,
  ]) {
    const result = await fetchDemoWeather("london", { timeoutMs: 5, fetcher });
    assert.equal(result.source, "synthetic");
    assert.ok(result.fallbackReason);
  }
});

test("caller cancellation avoids unnecessary calls and aborts in-flight requests without stale live results", async () => {
  const before = new AbortController();
  before.abort();
  let calls = 0;
  const skipped = await fetchDemoWeather("oslo", { signal: before.signal, fetcher: async () => { calls++; return Response.json(apiResponse("oslo")); } });
  assert.equal(calls, 0);
  assert.match(skipped.fallbackReason!, /canceled/);
  const during = new AbortController();
  let requestSignal: AbortSignal | null | undefined;
  const pending = fetchDemoWeather("oslo", { signal: during.signal, fetcher: async (_, init) => {
    requestSignal = init?.signal;
    return new Promise<Response>(() => {});
  } });
  during.abort();
  const canceled = await pending;
  assert.equal(requestSignal?.aborted, true);
  assert.equal(canceled.source, "synthetic");
  assert.match(canceled.fallbackReason!, /canceled/);
  for (const timeoutMs of [0, 0.5, -1, NaN, Infinity, 15001]) await assert.rejects(() => fetchDemoWeather("oslo", { timeoutMs }), RangeError);
});

function twoDays() {
  const payload = apiResponse();
  for (let hour = 0; hour < 24; hour++) {
    payload.hourly.time.push(`2026-10-25T${String(hour).padStart(2, "0")}:00`);
    payload.hourly.temperature_2m.push(8 + hour / 10);
    payload.hourly.relative_humidity_2m.push(72);
    payload.hourly.weather_code.push(61);
  }
  return payload;
}

test("two-day forecasts preserve tomorrow's distinct conditions instead of repeating today", () => {
  const payload = twoDays();
  const result = normalizeOpenMeteoWeather(payload, "california");
  assert.ok(result?.nextDayHourly); assert.equal(result.hourly.length, 24); assert.equal(result.nextDayHourly.length, 24);
  assert.equal(result.hourly[0].temperatureC, 15); assert.equal(result.nextDayHourly[0].temperatureC, 8);
  assert.equal(result.nextDayHourly[23].time, "2026-10-25T23:00"); assert.equal(result.nextDayHourly[0].weatherCode, 61);
  const changed = structuredClone(payload); changed.hourly.time[24] = "2026-10-24T00:00";
  assert.equal(normalizeOpenMeteoWeather(changed, "california"), null);
  for (const bad of [[], result.nextDayHourly.slice(1), [...result.nextDayHourly.slice(0, 23), undefined]]) assert.equal(isDemoWeather({ ...result, nextDayHourly: bad }, "california"), false);
});

test("snapshot copying drops unknown fields, preserves provenance and refuses unsafe source URLs", () => {
  const normalized = normalizeOpenMeteoWeather(twoDays(), "california")!;
  const input = { ...normalized, fetchedAt: "2026-10-24T19:15:00.000Z", secret: "drop", hourly: normalized.hourly.map(row => ({ ...row, unexpected: 123 })) };
  const copy = copyDemoWeather(input, "california")!;
  assert.equal("secret" in copy, false); assert.equal("unexpected" in copy.hourly[0], false);
  copy.nextDayHourly![0].temperatureC = 40; assert.equal(normalized.nextDayHourly![0].temperatureC, 8);
  assert.equal(copyDemoWeather({ ...input, sourceUrl: "javascript:alert(1)" }, "california"), null);
  assert.equal(copyDemoWeather({ ...input, fetchedAt: "2026-02-30T19:15:00.000Z" }, "california"), null);
});

test("freshness checks source-local current time and bounded UTC retrieval age", async () => {
  const now = Date.parse("2026-10-24T19:15:00.000Z");
  const weather = { ...normalizeOpenMeteoWeather(twoDays(), "california")!, fetchedAt: new Date(now).toISOString() };
  assert.equal(isWeatherSnapshotFresh(weather, now), true);
  assert.equal(isWeatherSnapshotFresh(weather, now + 31 * 60000), false);
  assert.equal(isWeatherSnapshotFresh(weather, now - 2 * 60000), false);
  assert.equal(isWeatherSnapshotFresh({ ...weather, currentTime: "2026-10-24T04:15" }, now), false);
  assert.equal(isWeatherSnapshotFresh(createSyntheticWeather("california"), now), false);
  assert.equal(isWeatherSnapshotFresh({ ...weather, fetchedAt: undefined }, now), false);
  const fetched = await fetchDemoWeather("california", { now: () => now, fetcher: async () => Response.json(twoDays()) });
  assert.equal(fetched.fetchedAt, "2026-10-24T19:15:00.000Z"); assert.equal(fetched.nextDayHourly?.length, 24);
  const stale = await fetchDemoWeather("california", { now: () => now + 86400000, fetcher: async () => Response.json(twoDays()) });
  assert.equal(stale.source, "synthetic"); assert.match(stale.fallbackReason!, /unavailable or invalid/);
});

test("arbitrary selected location uses its coordinates/timezone and refuses a different city's data", async () => {
  const location = { id: 2988507, name: "Paris", admin1: "Île-de-France", country: "France", countryCode: "FR", latitude: 48.85341, longitude: 2.3488, timezone: "Europe/Paris" };
  const payload = { ...apiResponse(), latitude: location.latitude, longitude: location.longitude, timezone: location.timezone };
  payload.current.time = "2026-10-24T21:15";
  let target: URL | undefined;
  const result = await fetchDemoWeather("bangkok", { location, now: () => Date.parse("2026-10-24T19:15:00.000Z"), fetcher: async url => { target = new URL(String(url)); return Response.json(payload); } });
  assert.equal(result.regionId, "bangkok"); assert.equal(result.location?.id, location.id); assert.equal(result.timezone, location.timezone);
  assert.equal(target?.searchParams.get("latitude"), String(location.latitude)); assert.equal(target?.searchParams.get("timezone"), "Europe/Paris");
  assert.equal(isDemoWeather(result, "bangkok"), true); assert.deepEqual(copyDemoWeather(result, "bangkok")?.location, location);
  assert.equal(normalizeOpenMeteoWeather(apiResponse("bangkok"), "bangkok", location), null);
  for (const fetcher of [(async () => { throw Error("offline"); }) as typeof fetch, (async () => Response.json(apiResponse("bangkok"))) as typeof fetch]) await assert.rejects(fetchDemoWeather("bangkok", { location, fetcher }), /Forecast unavailable/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchDemoWeather("bangkok", { location, signal: controller.signal }), /Forecast unavailable/);
  await assert.rejects(fetchDemoWeather("bangkok", { location, timeoutMs: 5, fetcher: async () => new Promise<Response>(() => {}) }), /Forecast unavailable/);
});
