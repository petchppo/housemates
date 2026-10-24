export type RegionId = "california" | "london" | "bangkok" | "tokyo" | "oslo" | "sydney";
export type ResidenceType = "apartment" | "townhouse" | "detached";
export type RegionTheme = "coastal" | "garden" | "tropical" | "urban" | "nordic" | "dry";
export type DemoRegion = {
  readonly id: RegionId;
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly theme: RegionTheme;
  /** Public city-centre coordinates, never the user's precise location. */
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly syntheticWeather: {
    readonly temperatureC: number;
    readonly humidityPercent: number;
    readonly weatherCode: number;
    readonly dailySwingC: number;
  };
  /** Fictional multipliers of the existing demo dataset, not market statistics. */
  readonly priceFactor: number;
  readonly carbonFactor: number;
  readonly currency: "USD";
};

/** Weather presets and tariff multipliers are authored examples, not climate normals or live rates. */
export const DEMO_REGIONS: readonly DemoRegion[] = [
  { id: "california", name: "California, US", city: "San Francisco", country: "United States", theme: "coastal",
    latitude: 37.7749, longitude: -122.4194, timezone: "America/Los_Angeles", currency: "USD",
    syntheticWeather: { temperatureC: 16, humidityPercent: 68, weatherCode: 2, dailySwingC: 4 }, priceFactor: 1, carbonFactor: 1 },
  { id: "london", name: "London, UK", city: "London", country: "United Kingdom", theme: "garden",
    latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London", currency: "USD",
    syntheticWeather: { temperatureC: 12, humidityPercent: 78, weatherCode: 3, dailySwingC: 3 }, priceFactor: 1.1, carbonFactor: 0.65 },
  { id: "bangkok", name: "Bangkok, Thailand", city: "Bangkok", country: "Thailand", theme: "tropical",
    latitude: 13.7563, longitude: 100.5018, timezone: "Asia/Bangkok", currency: "USD",
    syntheticWeather: { temperatureC: 30, humidityPercent: 76, weatherCode: 2, dailySwingC: 3 }, priceFactor: 0.45, carbonFactor: 1.4 },
  { id: "tokyo", name: "Tokyo, Japan", city: "Tokyo", country: "Japan", theme: "urban",
    latitude: 35.6762, longitude: 139.6503, timezone: "Asia/Tokyo", currency: "USD",
    syntheticWeather: { temperatureC: 20, humidityPercent: 64, weatherCode: 2, dailySwingC: 4 }, priceFactor: 0.8, carbonFactor: 1.3 },
  { id: "oslo", name: "Oslo, Norway", city: "Oslo", country: "Norway", theme: "nordic",
    latitude: 59.9139, longitude: 10.7522, timezone: "Europe/Oslo", currency: "USD",
    syntheticWeather: { temperatureC: 1, humidityPercent: 72, weatherCode: 3, dailySwingC: 3 }, priceFactor: 0.5, carbonFactor: 0.12 },
  { id: "sydney", name: "Sydney, Australia", city: "Sydney", country: "Australia", theme: "dry",
    latitude: -33.8688, longitude: 151.2093, timezone: "Australia/Sydney", currency: "USD",
    syntheticWeather: { temperatureC: 25, humidityPercent: 48, weatherCode: 0, dailySwingC: 5 }, priceFactor: 0.75, carbonFactor: 1.5 },
];

export function getDemoRegion(id: RegionId): DemoRegion {
  const region = DEMO_REGIONS.find(candidate => candidate.id === id);
  if (!region) throw new RangeError("Unknown demo region.");
  return region;
}
