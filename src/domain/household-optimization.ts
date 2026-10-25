import { createDemoApplimon, getApplimon, validateApplimonInventory, type ApplimonDevice } from "./applimon-catalog";
import { calculateBackgroundDemand, validateDemoProfile, type DemoScenario } from "./demo";
import { isDemoWeather } from "./demo-weather";
import { weatherLocationsMatch } from "./weather-location";
import type { HourlyEnergy } from "./energy";
import { sumEnergy, type EnergyTotals, type SchedulingRequest } from "./scheduling";

export type CoordinatedContext = {
  inventory: ApplimonDevice[];
  coreRequests: SchedulingRequest[];
  energyProfile: HourlyEnergy[];
  backgroundPowerKw: number[];
  backgroundTotals: EnergyTotals;
  weatherLabel: string;
  weatherTemperaturesC: number[];
  contextKey: string;
  assumptions: string[];
};

/** Snapshot the current negotiated inputs. Weather contributes one fixed thermal load,
 * never a second copy of Chill or invented weather-adjusted tariffs. */
export function buildCoordinatedContext(
  scenario: DemoScenario,
  coreRequests: readonly SchedulingRequest[] = scenario.requests,
  additionalRequests: readonly ApplimonDevice[] = (scenario.profile.applimons ?? []).filter(device => !getApplimon(device.id).legacyId),
): CoordinatedContext {
  const profile = validateDemoProfile(scenario.profile);
  if (!profile || !isDemoWeather(scenario.weather, profile.regionId) ||
      (scenario.weather.source === "live" && !weatherLocationsMatch(profile.weatherLocation, scenario.weather.location)))
    throw new RangeError("A valid household and matching weather snapshot are required.");
  const stored = profile.applimons ?? [];
  const additional = validateApplimonInventory(additionalRequests);
  const expectedAdditional = stored.filter(device => !getApplimon(device.id).legacyId).map(device => device.id).sort();
  if (!additional || additional.some(device => !!getApplimon(device.id).legacyId) ||
      JSON.stringify(additional.map(device => device.id).sort()) !== JSON.stringify(expectedAdditional))
    throw new RangeError("The optimizer must use the current recruited party and its reviewed constraints.");
  const core = profile.applianceIds.map(id => stored.find(device => device.id === id) ?? createDemoApplimon(id));
  const inventory = validateApplimonInventory([...core, ...additional]);
  if (!inventory) throw new RangeError("The optimizer requires a unique validated inventory.");
  const expectedCore = profile.applianceIds.filter(id => id !== "chill").sort();
  if (!Array.isArray(coreRequests) || coreRequests.length > 2 || coreRequests.some(row => !row?.appliance) ||
      JSON.stringify(coreRequests.map(row => row.appliance.id).sort()) !== JSON.stringify(expectedCore))
    throw new RangeError("Current core planning constraints must match the recruited appliances.");
  // Recompute rather than trusting cached scenario totals; rows represent one-hour loads.
  const background = calculateBackgroundDemand(profile.residenceType, scenario.weather, scenario.energyProfile);
  const hours = [...background.hourly, ...(background.nextDayHourly ?? background.hourly.map(row => ({ ...row, hour: row.hour + 24 })))];
  const weatherHours = [...scenario.weather.hourly, ...(scenario.weather.nextDayHourly ?? scenario.weather.hourly)];
  const snapshot = {
    inventory: structuredClone(inventory), coreRequests: structuredClone([...coreRequests]),
    energyProfile: structuredClone(scenario.energyProfile),
    backgroundPowerKw: hours.map(row => row.energyKwh), backgroundTotals: sumEnergy(hours),
    weatherTemperaturesC: weatherHours.map(row => row.temperatureC),
  };
  return { ...snapshot,
    contextKey: JSON.stringify([profile.regionId, profile.residenceType, scenario.weather, snapshot]),
    weatherLabel: `${scenario.weather.source === "live" ? "Forecast snapshot" : "Synthetic weather"} · ${scenario.weather.sourceLabel} · ${scenario.weather.nextDayHourly ? "two distinct days" : "one day repeated"}`,
    assumptions: [
      "48-hour planning preview, not a device command or a replacement for an approved simulation. No chat or execution state is changed by Optimize.",
      "The modeled power budget is an editable demo assumption, not a measured circuit rating. Thermal background and fixed fan use reserve power before flexible jobs are placed.",
      "Outdoor temperature and humidity shape illustrative fixed heating/cooling demand. Chill is already represented within that background; it is never added twice or shifted.",
      "Weather does not change synthetic rates or task energy. Without a binding power budget it may leave the optimal timing unchanged.",
      "Cost and carbon comparisons cover flexible tasks only. Fixed fan and 48-hour thermal estimates are separate; protected refrigeration/water heating, taxes and other loads are not a full household bill.",
      "Current negotiated windows and deadlines are retained. Whole-hour starts and uninterrupted tasks use the existing fractional-energy ledger; no laundry dependency or safe unattended operation is inferred.",
      ...(!scenario.weather.nextDayHourly ? ["Only one weather day is available; the second day explicitly repeats it."] : []),
    ],
  };
}
