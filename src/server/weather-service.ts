import { DEMO_REGIONS, type RegionId } from "../data/demo-regions";
import { copyDemoWeather, fetchDemoWeather, isWeatherSnapshotFresh, type DemoWeather } from "../domain/demo-weather";
import { parseWeatherLocation, weatherLocationsMatch, type WeatherLocation } from "../domain/weather-location";
import { weatherLocationProvider } from "./weather-locations";

/** Bounded cache/coalescing by scene and trusted public place ID. No browser coordinates are accepted. */
export function createWeatherService(load: typeof fetchDemoWeather = fetchDemoWeather, now = Date.now,
  resolveLocation: (id: number) => Promise<WeatherLocation> = weatherLocationProvider.resolve) {
  const cache = new Map<string, { expires: number; weather: DemoWeather }>();
  const inflight = new Map<string, Promise<DemoWeather>>();
  const headers = { "Cache-Control": "no-store" };
  return async function serve(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams, values = params.getAll("region"), ids = params.getAll("locationId");
    if (values.length !== 1 || !DEMO_REGIONS.some(region => region.id === values[0]) || ids.length > 1 ||
        [...params.keys()].some(key => key !== "region" && key !== "locationId") ||
        (ids.length === 1 && (!/^[1-9]\d{0,9}$/.test(ids[0]) || Number(ids[0]) > 2147483647))) return Response.json({ error: "Choose one scene region and a valid weather location." }, { status: 400, headers });
    const id = values[0] as RegionId, locationId = ids.length ? Number(ids[0]) : undefined;
    const key = `${id}:${locationId ?? "preset"}`;
    const stored = cache.get(key);
    const usable = stored && stored.expires > now() && (stored.weather.source === "synthetic" || isWeatherSnapshotFresh(stored.weather, now()));
    let weather: DemoWeather;
    if (usable) weather = stored.weather;
    else {
      let pending = inflight.get(key);
      if (!pending) {
        if (inflight.size >= 8) return Response.json({ error: "Weather service is busy. Retry shortly." }, { status: 503, headers });
        const validate = (value: DemoWeather, location?: WeatherLocation) => {
          const safe = copyDemoWeather(value, id);
          if (!safe || !weatherLocationsMatch(location, safe.location) || (location && safe.source !== "live") ||
              (safe.source === "live" && !isWeatherSnapshotFresh(safe, now()))) throw new Error("Weather loader returned invalid, stale or mismatched data.");
          for (const [entry, record] of cache) if (record.expires <= now()) cache.delete(entry);
          while (cache.size >= 64) cache.delete(cache.keys().next().value!);
          cache.set(key, { weather: safe, expires: now() + (safe.source === "live" ? 10 * 60_000 : 30_000) });
          return safe;
        };
        pending = (locationId === undefined ? load(id, { timeoutMs: 5000, now }).then(value => validate(value)) :
          resolveLocation(locationId).then(async result => {
            const location = parseWeatherLocation(result);
            if (!location || location.id !== locationId) throw new Error("Location resolver returned the wrong place.");
            return validate(await load(id, { timeoutMs: 5000, now, location }), location);
          })).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      try { weather = await pending; }
      catch { return Response.json({ error: locationId === undefined ? "Weather service unavailable. Use the synthetic preset." : "The selected location forecast is unavailable. Retry or select another location." }, { status: 503, headers }); }
    }
    return Response.json(weather, { headers: { ...headers, "X-Housemates-Weather": usable ? "cached" : "refreshed" } });
  };
}
