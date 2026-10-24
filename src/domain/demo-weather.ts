import { getDemoRegion, type RegionId } from "../data/demo-regions";

export type WeatherHour = { time: string; temperatureC: number; humidityPercent: number; weatherCode: number };
export type DemoWeather = {
  regionId: RegionId;
  temperatureC: number;
  humidityPercent: number;
  weatherCode: number;
  /** ISO local wall-clock time in timezone; never parse this as the browser's local time. */
  currentTime: string;
  timezone: string;
  hourly: WeatherHour[];
  source: "live" | "synthetic";
  sourceLabel: string;
  sourceUrl?: string;
  fallbackReason?: string;
};

const WEATHER_CODES = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const between = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
const validTemperature = (value: unknown): value is number => between(value, -90, 65);
const validHumidity = (value: unknown): value is number => between(value, 0, 100);
const validCode = (value: unknown): value is number => typeof value === "number" && WEATHER_CODES.has(value);

function validTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(`${value}:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
}

function validHour(value: unknown): value is WeatherHour {
  return object(value) && validTime(value.time) && validTemperature(value.temperatureC) &&
    validHumidity(value.humidityPercent) && validCode(value.weatherCode);
}

/** Validate normalized records too: caller-supplied weather never bypasses boundary checks. */
export function isDemoWeather(value: unknown, regionId: RegionId): value is DemoWeather {
  const region = getDemoRegion(regionId);
  if (!object(value) || value.regionId !== regionId || value.timezone !== region.timezone ||
      !validTemperature(value.temperatureC) || !validHumidity(value.humidityPercent) || !validCode(value.weatherCode) ||
      !validTime(value.currentTime) || (value.source !== "live" && value.source !== "synthetic") ||
      typeof value.sourceLabel !== "string" || !value.sourceLabel.length || value.sourceLabel.length > 240 ||
      !Array.isArray(value.hourly) || value.hourly.length !== 24) return false;
  const day = value.currentTime.slice(0, 10);
  return Array.from(value.hourly).every((row, hour) => validHour(row) && row.time === `${day}T${String(hour).padStart(2, "0")}:00`);
}

/** Fixed fictional calendar date makes the authored preset repeatable and explicitly non-current. */
export function createSyntheticWeather(regionId: RegionId): DemoWeather {
  const region = getDemoRegion(regionId);
  const preset = region.syntheticWeather;
  const hourly = Array.from({ length: 24 }, (_, hour) => {
    const wave = Math.cos((hour - 15) * Math.PI / 12);
    return { time: `2000-01-01T${String(hour).padStart(2, "0")}:00`,
      temperatureC: Math.round((preset.temperatureC + preset.dailySwingC * wave) * 10) / 10,
      humidityPercent: Math.round(Math.max(0, Math.min(100, preset.humidityPercent - 6 * wave))),
      weatherCode: preset.weatherCode };
  });
  return { regionId, temperatureC: hourly[12].temperatureC, humidityPercent: hourly[12].humidityPercent,
    weatherCode: hourly[12].weatherCode, currentTime: hourly[12].time, timezone: region.timezone,
    hourly, source: "synthetic", sourceLabel: "Synthetic weather preset — illustrative day, not current conditions." };
}

/**
 * Strict Open-Meteo boundary for current conditions plus one local 24-hour day.
 * API reference: https://open-meteo.com/en/docs . Values are weather-model data,
 * not indoor measurements or appliance telemetry. Unsupported day shapes fall back.
 */
export function normalizeOpenMeteoWeather(value: unknown, regionId: RegionId): DemoWeather | null {
  const region = getDemoRegion(regionId);
  if (!object(value) || value.timezone !== region.timezone ||
      !between(value.latitude, -90, 90) || !between(value.longitude, -180, 180) ||
      Math.abs(value.latitude - region.latitude) > 0.5 || Math.abs(value.longitude - region.longitude) > 0.5 ||
      !object(value.current) || !object(value.hourly) || !object(value.current_units) || !object(value.hourly_units)) return null;
  for (const units of [value.current_units, value.hourly_units]) {
    if (units.time !== "iso8601" || units.temperature_2m !== "°C" ||
        units.relative_humidity_2m !== "%" || units.weather_code !== "wmo code") return null;
  }
  const current = value.current;
  const hourly = value.hourly;
  if (!validTime(current.time) || !validTemperature(current.temperature_2m) ||
      !validHumidity(current.relative_humidity_2m) || !validCode(current.weather_code)) return null;
  const times = hourly.time, temperatures = hourly.temperature_2m, humidity = hourly.relative_humidity_2m, codes = hourly.weather_code;
  if (![times, temperatures, humidity, codes].every(array => Array.isArray(array) && array.length === 24)) return null;
  const rows: WeatherHour[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const row = { time: (times as unknown[])[hour], temperatureC: (temperatures as unknown[])[hour],
      humidityPercent: (humidity as unknown[])[hour], weatherCode: (codes as unknown[])[hour] };
    if (!validHour(row)) return null;
    rows.push(row);
  }
  const result: DemoWeather = { regionId, temperatureC: current.temperature_2m, humidityPercent: current.relative_humidity_2m,
    weatherCode: current.weather_code, currentTime: current.time, timezone: region.timezone, hourly: rows, source: "live",
    sourceLabel: "Open-Meteo current and forecast weather model — not household telemetry.", sourceUrl: "https://open-meteo.com/" };
  return isDemoWeather(result, regionId) ? result : null;
}

export type FetchDemoWeatherOptions = { signal?: AbortSignal; timeoutMs?: number; fetcher?: typeof fetch };

/** Optional public-city request only; callers decide whether/when to enable it. Never requests geolocation. */
export async function fetchDemoWeather(regionId: RegionId, options: FetchDemoWeatherOptions = {}): Promise<DemoWeather> {
  const region = getDemoRegion(regionId);
  const fallback = (reason: string): DemoWeather => ({ ...createSyntheticWeather(regionId), fallbackReason: reason });
  if (options.signal?.aborted) return fallback("Weather request canceled; using the synthetic preset.");
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw new RangeError("Weather timeout must be between 1 and 15,000 milliseconds.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({ latitude: String(region.latitude), longitude: String(region.longitude), timezone: region.timezone,
    current: "temperature_2m,relative_humidity_2m,weather_code", hourly: "temperature_2m,relative_humidity_2m,weather_code",
    forecast_days: "1", temperature_unit: "celsius", timeformat: "iso8601" }).toString();
  try {
    const deadline = new Promise<never>((_, reject) => {
      cancel = () => { controller.abort(); reject(new Error("canceled")); };
      options.signal?.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, timeoutMs);
    });
    const request = async () => {
      const response = await (options.fetcher ?? fetch)(url.toString(), {
        signal: controller.signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error("unavailable");
      const normalized = normalizeOpenMeteoWeather(await response.json(), regionId);
      if (!normalized) throw new Error("invalid");
      return normalized;
    };
    return await Promise.race([request(), deadline]);
  } catch {
    return fallback(options.signal?.aborted ? "Weather request canceled; using the synthetic preset." :
      "Live weather unavailable or invalid; using the synthetic preset.");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (cancel) options.signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
}
