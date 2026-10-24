import { parseWeatherLocation, type WeatherLocation } from "../domain/weather-location";

const ORIGIN = "https://geocoding-api.open-meteo.com";
const MAX_BODY = 64_000;
const HEADERS = { "Cache-Control": "no-store" };
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export type WeatherLocationProvider = { search: (query: string) => Promise<WeatherLocation[]>; resolve: (id: number) => Promise<WeatherLocation> };
type Options = { fetcher?: typeof fetch; now?: () => number; timeoutMs?: number; cacheLimit?: number; inflightLimit?: number };
const hasControl = (value: string) => Array.from(value).some(character => { const code = character.charCodeAt(0); return code < 32 || (code >= 127 && code <= 159); });
const validId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0 && id <= 2147483647;

const isPlace = (value: unknown): value is Record<string, unknown> => object(value) && typeof value.feature_code === "string" && /^(?:PPL[A-Z0-9]*|ADM[1-5D])$/.test(value.feature_code);

function fromProvider(value: unknown): WeatherLocation | null {
  if (!isPlace(value)) return null;
  return parseWeatherLocation({ id: value.id, name: value.name, country: value.country, countryCode: value.country_code,
    latitude: value.latitude, longitude: value.longitude, timezone: value.timezone,
    ...(value.admin1 ? { admin1: value.admin1 } : {}), ...(value.admin2 ? { admin2: value.admin2 } : {}) });
}

/** Official API supports global name/administrative-area searches and /v1/get?id.
 * https://open-meteo.com/en/docs/geocoding-api . Coordinates never come from the browser. */
export function createWeatherLocationProvider(options: Options = {}): WeatherLocationProvider {
  const now = options.now ?? Date.now, timeoutMs = options.timeoutMs ?? 4500;
  const limit = options.cacheLimit ?? 64, inflightLimit = options.inflightLimit ?? 8;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000 || !Number.isInteger(limit) || limit < 1 || limit > 256 || !Number.isInteger(inflightLimit) || inflightLimit < 1 || inflightLimit > 32) throw new RangeError("Invalid weather location service bounds.");
  const cache = new Map<string, { expires: number; value: WeatherLocation[] }>();
  const pending = new Map<string, Promise<WeatherLocation[]>>();
  function remember(key: string, value: WeatherLocation[]) {
    for (const [entry, record] of cache) if (record.expires <= now()) cache.delete(entry);
    cache.delete(key);
    while (cache.size >= limit) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: now() + 24 * 60 * 60_000, value });
  }
  async function requestJson(url: URL): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Location lookup timed out.")); }, timeoutMs); });
    const request = async () => {
      const response = await (options.fetcher ?? fetch)(url.toString(), { signal: controller.signal, cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
      if (!response.ok || !response.body || Number(response.headers.get("content-length") ?? 0) > MAX_BODY) throw new Error("Location provider unavailable.");
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let size = 0, text = "";
      const cancelRead = () => { void reader.cancel().catch(() => {}); };
      controller.signal.addEventListener("abort", cancelRead, { once: true });
      try {
        if (controller.signal.aborted) throw new Error("Location lookup canceled.");
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_BODY) throw new Error("Location response too large.");
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
        return JSON.parse(text) as unknown;
      } finally { controller.signal.removeEventListener("abort", cancelRead); void reader.cancel().catch(() => {}); }
    };
    try { return await Promise.race([request(), deadline]); }
    finally { if (timer !== undefined) clearTimeout(timer); controller.abort(); }
  }
  async function load(key: string, path: string, parameters: Record<string, string>, search: boolean): Promise<WeatherLocation[]> {
    const stored = cache.get(key);
    if (stored && stored.expires > now()) return structuredClone(stored.value);
    let task = pending.get(key);
    if (!task) {
      if (pending.size >= inflightLimit) throw new Error("Location service is busy. Retry shortly.");
      const url = new URL(path, ORIGIN); url.search = new URLSearchParams({ ...parameters, language: "en", format: "json" }).toString();
      task = requestJson(url).then(raw => {
        if (!object(raw) || raw.error) throw new Error("Invalid location provider response.");
        const rows = search ? raw.results === undefined ? [] : raw.results : [raw];
        if (!Array.isArray(rows) || rows.length > 20) throw new Error("Invalid location results.");
        const results: WeatherLocation[] = [];
        const places = rows.filter(isPlace);
        for (const row of places) {
          const location = fromProvider(row);
          if (location && !results.some(value => value.id === location.id)) results.push(location);
        }
        if ((!search && (results.length !== 1 || results[0].id !== Number(parameters.id))) || (places.length > 0 && !results.length)) throw new Error("Location provider did not return the requested place.");
        remember(key, results);
        if (search) for (const location of results) remember(`id:${location.id}`, [location]);
        return results;
      }).finally(() => pending.delete(key));
      pending.set(key, task);
    }
    return structuredClone(await task);
  }
  return {
    async search(query) {
      const clean = query.trim();
      if (clean.length < 2 || clean.length > 80 || hasControl(query)) throw new RangeError("Enter 2–80 characters for a city, county or postal code.");
      const results = await load(`query:${clean.toLocaleLowerCase("en")}`, "/v1/search", { name: clean, count: "10" }, true);
      // GeoNames may index a county under its base name. Never relabel a returned city as a county.
      const base = clean.replace(/^(.+?)\s+county(\s*(?:,.*)?)$/i, "$1$2").trim();
      if (results.length || base === clean || base.length < 2) return results;
      return load(`query:${base.toLocaleLowerCase("en")}`, "/v1/search", { name: base, count: "10" }, true);
    },
    async resolve(id) {
      if (!validId(id)) throw new RangeError("Choose a valid public weather location.");
      const results = await load(`id:${id}`, "/v1/get", { id: String(id) }, false);
      return results[0];
    },
  };
}

export const weatherLocationProvider = createWeatherLocationProvider();

export function createWeatherLocationsService(provider: WeatherLocationProvider = weatherLocationProvider) {
  return async function serve(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams, values = params.getAll("q");
    if (values.length !== 1 || [...params.keys()].some(key => key !== "q") || values[0].trim().length < 2 || values[0].trim().length > 80 || hasControl(values[0])) return Response.json({ error: "Enter 2–80 characters for a city, county or postal code." }, { status: 400, headers: HEADERS });
    try { return Response.json({ locations: await provider.search(values[0]) }, { headers: HEADERS }); }
    catch { return Response.json({ error: "Location search is unavailable. Retry shortly; no place was selected." }, { status: 503, headers: HEADERS }); }
  };
}
