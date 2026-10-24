import { DEMO_REGIONS, getDemoRegion, type DemoRegion, type RegionId, type ResidenceType } from "../data/demo-regions";
import { hourlyEnergy } from "../data/energy";
import { defaultSchedulingRequests } from "../data/scheduling";
import type { ApplianceId } from "./appliances";
import { estimateUsage, type HourlyEnergy } from "./energy";
import { optimizeHousehold, sumEnergy, type HouseholdPlan, type OptimizationMode, type SchedulingRequest } from "./scheduling";
import { createSyntheticWeather, isDemoWeather, type DemoWeather } from "./demo-weather";
import { buildDemoGridProfile, type DemoGridHour } from "../data/demo-grid";
import { buildDemoAcActivity, demoCoolingOccupancyFactor, type DemoAcActivity } from "./demo-activity";

export type DemoProfile = {
  version: 1;
  regionId: RegionId;
  residenceType: ResidenceType;
  applianceIds: ApplianceId[];
  weatherMode: "synthetic" | "live";
  /** Optional synthetic what-if controls; no external weather request is implied. */
  weatherOffsetC?: number;
  weatherCode?: number;
  /** Optional saved dashboard choice; older demo profiles default to cost-first. */
  planningMode?: OptimizationMode;
};
export const DEFAULT_DEMO_PROFILE: DemoProfile = {
  version: 1, regionId: "california", residenceType: "detached", applianceIds: [], weatherMode: "synthetic",
};
export type BackgroundDemandHour = {
  hour: number;
  temperatureC: number;
  heatingKwh: number;
  coolingKwh: number;
  energyKwh: number;
  costUsd: number;
  carbonGrams: number;
};
export type BackgroundDemand = {
  label: string;
  heatingKwh: number;
  coolingKwh: number;
  energyKwh: number;
  costUsd: number;
  carbonGrams: number;
  hourly: BackgroundDemandHour[];
  assumptions: string[];
};
export type DemoScenario = {
  profile: DemoProfile;
  region: DemoRegion;
  energyProfile: HourlyEnergy[];
  gridProfile: readonly DemoGridHour[];
  acActivity: DemoAcActivity;
  weather: DemoWeather;
  requests: SchedulingRequest[];
  plan: HouseholdPlan | null;
  backgroundDemand: BackgroundDemand;
  assumptions: string[];
};

const RESIDENCES: readonly ResidenceType[] = ["apartment", "townhouse", "detached"];
const APPLIANCES: readonly ApplianceId[] = ["evie", "bubbles", "chill"];
const DEMO_STORAGE_LIMIT = 2048;
const DEMAND_COEFFICIENT: Record<ResidenceType, number> = { apartment: 0.035, townhouse: 0.06, detached: 0.09 };

/** Rounded minute display on the fictional timeline; hour 48 is the Day 3 boundary, not hour 24. */
export function formatDemoHour(hour: number): string {
  if (!Number.isFinite(hour)) throw new RangeError("Demo hour must be finite.");
  const minutes = Math.round(Math.min(48, Math.max(0, hour)) * 60);
  const day = Math.floor(minutes / 1440) + 1;
  const localMinutes = minutes % 1440;
  return `Day ${day} · ${String(Math.floor(localMinutes / 60)).padStart(2, "0")}:${String(localMinutes % 60).padStart(2, "0")}`;
}

/** Copy only recognized scalar fields; stored planning results and unknown properties are never trusted. */
export function validateDemoProfile(value: unknown): DemoProfile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!["version", "regionId", "residenceType", "applianceIds", "weatherMode"].every(key => Object.prototype.hasOwnProperty.call(source, key)) ||
      source.version !== 1 || !DEMO_REGIONS.some(region => region.id === source.regionId) ||
      !RESIDENCES.includes(source.residenceType as ResidenceType) ||
      (source.weatherMode !== "synthetic" && source.weatherMode !== "live") ||
      (source.planningMode !== undefined && !["cost", "carbon", "balanced"].includes(source.planningMode as string)) ||
      (source.weatherOffsetC !== undefined && (typeof source.weatherOffsetC !== "number" ||
        !Number.isInteger(source.weatherOffsetC) || source.weatherOffsetC < -10 || source.weatherOffsetC > 10)) ||
      (source.weatherCode !== undefined && ![0, 3, 61, 73].includes(source.weatherCode as number)) ||
      !Array.isArray(source.applianceIds) || source.applianceIds.length > 3 ||
      !Array.from(source.applianceIds).every(id => APPLIANCES.includes(id)) ||
      new Set(source.applianceIds).size !== source.applianceIds.length) return null;
  return { version: 1, regionId: source.regionId as RegionId, residenceType: source.residenceType as ResidenceType,
    applianceIds: APPLIANCES.filter(id => (source.applianceIds as unknown[]).includes(id)), weatherMode: source.weatherMode,
    ...(source.weatherOffsetC !== undefined ? { weatherOffsetC: source.weatherOffsetC as number } : {}),
    ...(source.weatherCode !== undefined ? { weatherCode: source.weatherCode as number } : {}),
    ...(source.planningMode !== undefined ? { planningMode: source.planningMode as OptimizationMode } : {}) };
}

export function parseDemoProfile(raw: string | null): DemoProfile | null {
  if (typeof raw !== "string" || raw.length > DEMO_STORAGE_LIMIT) return null;
  try { return validateDemoProfile(JSON.parse(raw)); } catch { return null; }
}

/** Pure synthetic-only weather, including saved what-if choices; never initiates a network request. */
export function buildDemoWeather(profile: DemoProfile): DemoWeather {
  const validated = validateDemoProfile(profile);
  if (!validated) throw new RangeError("Invalid demo profile for synthetic weather.");
  const weather = createSyntheticWeather(validated.regionId);
  const offset = validated.weatherOffsetC ?? 0;
  if (validated.weatherOffsetC === undefined && validated.weatherCode === undefined) return weather;
  return { ...weather, temperatureC: weather.temperatureC + offset, weatherCode: validated.weatherCode ?? weather.weatherCode,
    hourly: weather.hourly.map(row => ({ ...row, temperatureC: row.temperatureC + offset, weatherCode: validated.weatherCode ?? row.weatherCode })),
    sourceLabel: "Synthetic what-if weather — chosen scenario, not current conditions or a forecast." };
}

/** USD throughout. Authored net-load sensitivity, not a market dispatch or tariff model. */
export function buildRegionEnergyProfile(regionId: RegionId): HourlyEnergy[] {
  const region = getDemoRegion(regionId);
  const grid = buildDemoGridProfile(regionId);
  return hourlyEnergy.map(row => {
    const { hour, solarIndex, netDemandIndex } = grid[row.hour];
    const evening = Math.exp(-(((hour - 19) / 2.5) ** 2));
    // A separate fictional early-morning clean supply shape keeps cost and carbon objectives distinct.
    const overnightClean = Math.exp(-(((hour - 5) / 1.3) ** 2));
    const priceSignal = 0.09 + 0.14 * netDemandIndex + 0.08 * evening - 0.05 * solarIndex;
    const carbonSignal = Math.max(20, 110 + 190 * netDemandIndex - 150 * solarIndex - 100 * overnightClean);
    return { hour, priceUsdPerKwh: (0.6 * row.priceUsdPerKwh + 0.4 * priceSignal) * region.priceFactor,
      carbonGramsPerKwh: (0.35 * row.carbonGramsPerKwh + 0.65 * carbonSignal) * region.carbonFactor };
  });
}

/** A transparent illustrative background model, never an AC controller or optimized saving. */
export function calculateBackgroundDemand(residenceType: ResidenceType, weather: DemoWeather, energyProfile: readonly HourlyEnergy[]): BackgroundDemand {
  if (!RESIDENCES.includes(residenceType) || !isDemoWeather(weather, weather.regionId)) throw new RangeError("Invalid residence or weather for the demo.");
  if (energyProfile.length !== 24 || !Array.from(energyProfile).every((row, hour) => row != null && row.hour === hour &&
      Number.isFinite(row.priceUsdPerKwh) && Number.isFinite(row.carbonGramsPerKwh) && row.carbonGramsPerKwh >= 0)) {
    throw new RangeError("Background demand requires a complete finite 24-hour energy profile.");
  }
  const coefficient = DEMAND_COEFFICIENT[residenceType];
  const hourly = weather.hourly.map((row, hour): BackgroundDemandHour => {
    const heatingKwh = Math.max(0, 18 - row.temperatureC) * coefficient;
    const coolingKwh = Math.max(0, row.temperatureC - 24) * coefficient * (1 + Math.max(0, row.humidityPercent - 60) * 0.004) * demoCoolingOccupancyFactor(hour);
    const energyKwh = heatingKwh + coolingKwh;
    return { hour, temperatureC: row.temperatureC, heatingKwh, coolingKwh, energyKwh, ...estimateUsage(energyKwh, energyProfile[hour]) };
  });
  const totals = sumEnergy(hourly);
  if (![totals.energyKwh, totals.costUsd, totals.carbonGrams].every(Number.isFinite)) throw new RangeError("Background demand totals exceed the numeric range.");
  return { label: "Illustrative background heating/cooling demand — separate from appliance savings", ...totals,
    heatingKwh: hourly.reduce((sum, row) => sum + row.heatingKwh, 0), coolingKwh: hourly.reduce((sum, row) => sum + row.coolingKwh, 0), hourly,
    assumptions: [
      "Illustrative electrical demand, not a calibrated building/thermal model, measured usage, or a thermostat recommendation.",
      `The ${residenceType} example uses ${coefficient} kW per degree outside an illustrative 18–24°C neutral band.`,
      "Cooling adds 0.4% per relative-humidity point above 60%; this is an authored demonstration coefficient, not an equipment specification.",
      "Cooling uses an authored workday occupancy weight: 1 during 06–09 and 17–23, 0.55 during 09–17, and 0.7 overnight; heating is unchanged. This is not an automatic off command.",
      "Residence is only a rough exposure proxy; floor area, insulation, equipment efficiency, and thermal inertia are not modeled.",
      "This background estimate is not Chill operation telemetry and is excluded from all optimized appliance cost/carbon savings. When selected, Chill displays its cooling portion without adding it again.",
    ] };
}

export function buildDemoScenario(profile: DemoProfile, suppliedWeather?: DemoWeather, mode?: OptimizationMode): DemoScenario {
  const validated = validateDemoProfile(profile);
  const objective = mode === undefined ? validated?.planningMode ?? "cost" : mode;
  if (!validated || !["cost", "carbon", "balanced"].includes(objective)) throw new RangeError("Invalid demo profile or optimization objective.");
  const weather = suppliedWeather ?? buildDemoWeather(validated);
  if (!isDemoWeather(weather, validated.regionId)) throw new RangeError("Weather does not match the selected region or contains invalid values.");
  const region = getDemoRegion(validated.regionId);
  const energyProfile = buildRegionEnergyProfile(region.id);
  const gridProfile = buildDemoGridProfile(region.id);
  const requests = structuredClone(defaultSchedulingRequests.filter(request => validated.applianceIds.includes(request.appliance.id)));
  requests.forEach(request => { request.baselineStartHour = request.appliance.id === "evie" ? 18 : 20; });
  const plan = requests.length ? optimizeHousehold(requests, energyProfile, objective) : null;
  const backgroundDemand = calculateBackgroundDemand(validated.residenceType, weather, energyProfile);
  const acActivity = buildDemoAcActivity(backgroundDemand, energyProfile, validated.applianceIds.includes("chill"));
  return { profile: validated, region, energyProfile, gridProfile, acActivity, weather: structuredClone(weather), requests, plan, backgroundDemand,
    assumptions: [
      "The grid chart is authored indexed demand minus solar, not MW or measured household load. Wind, storage, imports and dispatch are omitted; it is a simplified solar-only net-load illustration.",
      "California shows a pronounced solar-driven duck curve. Other city examples use distinct authored solar/daytime/evening shapes; these are not claims about actual regional daily profiles.",
      `Synthetic USD prices blend 60% existing demonstration rates with 40% an indexed net-load/solar/evening signal, then apply factor ${region.priceFactor}. Carbon blends 35% existing grid intensity with 65% a separate illustrative supply signal, then factor ${region.carbonFactor}.`,
      "Price and carbon signals are not interchangeable: a separate fictional early-morning clean-supply contribution permits genuine cost/carbon tradeoffs. They are not an economic dispatch model or marginal emissions estimate.",
      "Fixed original schedules represent an example workday: Evie starts at 18:00 after arrival; Bubbles starts at 20:00 after dinner. These are illustrative household choices, not universal or inferred habits. Available windows remain 18:00–07:00 and 20:00–07:00 respectively; no unavailable midday slot is proposed.",
      "All monetary values are USD demonstration amounts; no currency conversion, live tariffs, or actual regional carbon statistics are used.",
      "The synthetic energy day repeats across the existing 48-hour planner; calendar/DST effects and weather-driven tariff changes are not modeled.",
      "Weather describes a public city location, never indoor conditions or real appliance telemetry. Synthetic presets use a fictional fixed date.",
      "Synthetic temperature offsets apply uniformly to the 24-hour preset; humidity is unchanged. Weather-condition choices change scenery, not precipitation-related energy demand.",
      "Only selected Evie/Bubbles schedules enter the optimizer. Chill stays protected; background heating/cooling remains separate and is never counted as savings.",
      ...(!requests.length ? ["No flexible appliances are selected, so there is no optimized plan or claimed saving."] : []),
    ] };
}
