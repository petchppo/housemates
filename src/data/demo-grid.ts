import { getDemoRegion, type RegionId } from "./demo-regions";

export type DemoGridHour = {
  readonly hour: number;
  /** Shared arbitrary index, not MW, household kW, or a measured regional series. */
  readonly demandIndex: number;
  readonly solarIndex: number;
  readonly netDemandIndex: number;
};

/** Primary background references explain mechanisms; none supply these authored numeric curves. */
export const DEMO_ENERGY_REFERENCES = [
  { title: "CAISO: What the duck curve tells us about managing a green grid", url: "https://www.caiso.com/documents/flexibleresourceshelprenewables_fastfacts.pdf" },
  { title: "EIA: California's deeper midday net-load dip", url: "https://www.eia.gov/todayinenergy/detail.php?id=56880" },
  { title: "NREL: Aligning utilities and electric vehicles", url: "https://www.nrel.gov/news/program/2022/aligning-utilities-electric-vehicles-for-greater-grid.html" },
  { title: "EIA: Electricity use in homes varies by region and housing type", url: "https://www.eia.gov/energyexplained/use-of-energy/electricity-use-in-homes.php" },
] as const;

const BASE_DEMAND = [0.66, 0.62, 0.59, 0.58, 0.59, 0.64, 0.72, 0.84, 0.88, 0.87, 0.89, 0.92, 0.95, 0.96, 0.97, 1, 1.06, 1.12, 1.18, 1.16, 1.09, 0.98, 0.85, 0.75] as const;
const SHAPES: Record<RegionId, { solarPeak: number; sunrise: number; sunset: number; daytimeLoad: number; eveningLoad: number }> = {
  california: { solarPeak: 0.78, sunrise: 6, sunset: 18, daytimeLoad: 0, eveningLoad: 0 },
  london: { solarPeak: 0.2, sunrise: 8, sunset: 16, daytimeLoad: -0.04, eveningLoad: 0.08 },
  bangkok: { solarPeak: 0.26, sunrise: 6, sunset: 18, daytimeLoad: 0.2, eveningLoad: -0.04 },
  tokyo: { solarPeak: 0.34, sunrise: 6, sunset: 18, daytimeLoad: 0.08, eveningLoad: 0.03 },
  oslo: { solarPeak: 0.08, sunrise: 9, sunset: 15, daytimeLoad: -0.08, eveningLoad: 0.12 },
  sydney: { solarPeak: 0.68, sunrise: 5, sunset: 19, daytimeLoad: 0.08, eveningLoad: -0.02 },
};

/** Fictional regional contrasts, not forecasts or assertions about a city's actual grid mix. */
export function buildDemoGridProfile(regionId: RegionId): readonly DemoGridHour[] {
  getDemoRegion(regionId); // Validate before indexing, including prototype-like strings from JS callers.
  const shape = SHAPES[regionId];
  return BASE_DEMAND.map((base, hour) => {
    const daylight = hour > shape.sunrise && hour < shape.sunset
      ? Math.sin(Math.PI * (hour - shape.sunrise) / (shape.sunset - shape.sunrise)) : 0;
    const solarIndex = shape.solarPeak * daylight ** 1.5;
    const demandIndex = base + shape.daytimeLoad * Math.exp(-(((hour - 14) / 4) ** 2))
      + shape.eveningLoad * Math.exp(-(((hour - 19) / 3) ** 2));
    return { hour, demandIndex, solarIndex, netDemandIndex: demandIndex - solarIndex };
  });
}
