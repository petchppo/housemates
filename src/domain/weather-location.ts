/** Public place returned by Open-Meteo/GeoNames; never a device or precise user position. */
export type WeatherLocation = {
  id: number;
  name: string;
  admin1?: string;
  admin2?: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasControl = (value: string) => Array.from(value).some(character => { const code = character.charCodeAt(0); return code < 32 || (code >= 127 && code <= 159); });
const label = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 120 && value === value.trim() && !hasControl(value);
const number = (value: unknown, low: number, high: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;

/** Copy a bounded canonical record; never retain provider/user metadata or URLs. */
export function parseWeatherLocation(value: unknown): WeatherLocation | null {
  if (!object(value) || !Number.isSafeInteger(value.id) || !number(value.id, 1, 2147483647) ||
      !label(value.name) || !label(value.country) || typeof value.countryCode !== "string" || !/^[A-Z]{2}$/.test(value.countryCode) ||
      (value.admin1 !== undefined && !label(value.admin1)) || (value.admin2 !== undefined && !label(value.admin2)) ||
      !number(value.latitude, -90, 90) || !number(value.longitude, -180, 180) ||
      typeof value.timezone !== "string" || value.timezone.length > 80 || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value.timezone)) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }).format(0); } catch { return null; }
  return { id: value.id, name: value.name, ...(value.admin1 ? { admin1: value.admin1 } : {}), ...(value.admin2 ? { admin2: value.admin2 } : {}),
    country: value.country, countryCode: value.countryCode, latitude: value.latitude, longitude: value.longitude, timezone: value.timezone };
}

export function weatherLocationLabel(location: WeatherLocation): string {
  return [...new Set([location.name, location.admin2, location.admin1, location.country].filter((part): part is string => Boolean(part)))].join(", ");
}

/** Full canonical identity prevents a restored forecast being relabeled as another place. */
export function weatherLocationsMatch(a: WeatherLocation | undefined, b: WeatherLocation | undefined): boolean {
  if (!a || !b) return a === b;
  return a.id === b.id && a.name === b.name && a.admin1 === b.admin1 && a.admin2 === b.admin2 && a.country === b.country &&
    a.countryCode === b.countryCode && a.latitude === b.latitude && a.longitude === b.longitude && a.timezone === b.timezone;
}
