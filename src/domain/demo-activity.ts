import { estimateUsage, type HourlyEnergy } from "./energy";
import type { BackgroundDemand } from "./demo";

export type DemoAcHour = { hour: number; powerKw: number; energyKwh: number; costUsd: number; carbonGrams: number };
export type DemoAcActivity = {
  hourly: DemoAcHour[];
  energyKwh: number;
  costUsd: number;
  carbonGrams: number;
  assumptions: string[];
};
export type DemoAcStats = {
  status: "active" | "idle" | "complete";
  currentPowerKw: number;
  completedEnergyKwh: number;
  /** Two repetitions of the fictional 24-hour activity on the 48-hour clock. */
  totalEnergyKwh: number;
  accruedCostUsd: number;
  accruedCarbonGrams: number;
};

/** Illustrative workday exposure: occupied mornings/evenings, lower (never forced off) otherwise. */
export function demoCoolingOccupancyFactor(hour: number): number {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RangeError("Occupancy hour must be 0–23.");
  return hour >= 6 && hour < 9 || hour >= 17 && hour < 23 ? 1 : hour >= 9 && hour < 17 ? 0.55 : 0.7;
}

/** Cooling is a subset of backgroundDemand, NOT an additional load or optimized schedule. */
export function buildDemoAcActivity(background: BackgroundDemand, rates: readonly HourlyEnergy[], selected: boolean): DemoAcActivity {
  if (typeof selected !== "boolean" || background.hourly.length !== 24 || rates.length !== 24) throw new RangeError("AC activity requires 24 hourly background and energy rows.");
  const hourly = Array.from(background.hourly, (row, hour): DemoAcHour => {
    if (!row || row.hour !== hour || !Number.isFinite(row.coolingKwh) || row.coolingKwh < 0 || rates[hour]?.hour !== hour) throw new RangeError("Invalid AC background interval.");
    const energyKwh = selected ? row.coolingKwh : 0;
    return { hour, powerKw: energyKwh, energyKwh, ...estimateUsage(energyKwh, rates[hour]) };
  });
  const totals = hourly.reduce((sum, row) => ({ energyKwh: sum.energyKwh + row.energyKwh,
    costUsd: sum.costUsd + row.costUsd, carbonGrams: sum.carbonGrams + row.carbonGrams }), { energyKwh: 0, costUsd: 0, carbonGrams: 0 });
  if (!Object.values(totals).every(Number.isFinite)) throw new RangeError("AC totals exceed the numeric range.");
  return { hourly, ...totals, assumptions: [
    "Illustrative average AC electrical draw in one-hour intervals, not compressor telemetry, a thermostat command, or a comfort prediction.",
    "The chosen workday example gives morning 06–09 and evening 17–23 full occupancy weight, daytime 09–17 weight 0.55, and sleeping hours weight 0.7. No positive cooling load is forced off.",
    "Temperature, humidity and residence scale the background cooling model; neither optimization objective nor electricity price changes this activity.",
    "This is the cooling portion already included in background demand. Do not add it again to household totals; it contributes no optimized savings.",
    "The fictional 24-hour activity repeats on the 48-hour clock. Carbon is modeled average grid CO₂e, not measured or marginal avoided emissions.",
    ...(selected ? [] : ["Chill is not selected, so no AC activity is assigned; background demand remains a separate illustrative building estimate."]),
  ] };
}

/** Integrate partial hourly intervals exactly; finite clocks clamp to the modeled 0–48 hour horizon. */
export function getDemoAcStats(activity: DemoAcActivity, absoluteHour: number): DemoAcStats {
  if (!Number.isFinite(absoluteHour)) throw new RangeError("Simulation hour must be finite.");
  if (activity.hourly.length !== 24 || !Array.from(activity.hourly).every((row, hour) => row && row.hour === hour &&
    [row.energyKwh, row.powerKw, row.costUsd, row.carbonGrams].every(Number.isFinite) && row.energyKwh >= 0 && row.carbonGrams >= 0 && row.powerKw === row.energyKwh)) throw new RangeError("Invalid hourly AC activity.");
  const totals = activity.hourly.reduce((sum, row) => ({ energyKwh: sum.energyKwh + row.energyKwh,
    costUsd: sum.costUsd + row.costUsd, carbonGrams: sum.carbonGrams + row.carbonGrams }), { energyKwh: 0, costUsd: 0, carbonGrams: 0 });
  for (const key of ["energyKwh", "costUsd", "carbonGrams"] as const) {
    if (!Number.isFinite(activity[key]) || !Number.isFinite(2 * totals[key]) || Math.abs(activity[key] - totals[key]) > 1e-8 * Math.max(1, Math.abs(totals[key]))) throw new RangeError("AC totals do not match hourly activity.");
  }
  const time = Math.min(48, Math.max(0, absoluteHour));
  let completedEnergyKwh = 0, accruedCostUsd = 0, accruedCarbonGrams = 0;
  for (let hour = 0; hour < 48; hour++) {
    const duration = Math.max(0, Math.min(1, time - hour));
    const row = activity.hourly[hour % 24];
    completedEnergyKwh += row.energyKwh * duration;
    accruedCostUsd += row.costUsd * duration;
    accruedCarbonGrams += row.carbonGrams * duration;
  }
  const currentPowerKw = time < 48 ? activity.hourly[Math.floor(time) % 24].powerKw : 0;
  return { status: time === 48 ? "complete" : currentPowerKw > 0 ? "active" : "idle", currentPowerKw,
    completedEnergyKwh, totalEnergyKwh: totals.energyKwh * 2, accruedCostUsd, accruedCarbonGrams };
}
