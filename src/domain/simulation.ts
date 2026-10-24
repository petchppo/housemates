import { PLANNING_HOURS, type Schedule } from "./scheduling";

export type SimulationStatus = "idle" | "queued" | "active" | "complete";
export type SimulationApplianceStats = {
  applianceId: Schedule["applianceId"];
  status: SimulationStatus;
  currentPowerKw: number;
  completedEnergyKwh: number;
  totalEnergyKwh: number;
  /** Elapsed cycle time, including any zero-energy dishwasher phases. */
  progressPercent: number;
  accruedCostUsd: number;
  accruedCarbonGrams: number;
};
export type SimulationStats = Record<Schedule["applianceId"], SimulationApplianceStats>;

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));

function idle(applianceId: Schedule["applianceId"]): SimulationApplianceStats {
  return { applianceId, status: "idle", currentPowerKw: 0, completedEnergyKwh: 0,
    totalEnergyKwh: 0, progressPercent: 0, accruedCostUsd: 0, accruedCarbonGrams: 0 };
}

/** Require the interval ledger produced by the scheduler; never invent missing activity. */
function validateSchedule(schedule: Schedule) {
  if (!Number.isFinite(schedule.startHour) || !Number.isFinite(schedule.endHour) ||
      schedule.startHour < 0 || schedule.endHour > PLANNING_HOURS || schedule.endHour <= schedule.startHour ||
      !Array.isArray(schedule.intervals) || !schedule.intervals.length) {
    throw new RangeError("Simulation requires a complete schedule within hours 0–48.");
  }
  let end = schedule.startHour;
  let energy = 0, cost = 0, carbon = 0;
  for (const interval of schedule.intervals) {
    if (![interval.hour, interval.activeHours, interval.powerKw, interval.energyKwh,
      interval.costUsd, interval.carbonGrams].every(Number.isFinite) ||
      interval.activeHours <= 0 || interval.activeHours > 1 || interval.powerKw < 0 ||
      interval.energyKwh < 0 || interval.carbonGrams < 0 || !close(interval.hour, end) ||
      !close(interval.energyKwh, interval.powerKw * interval.activeHours)) {
      throw new RangeError("Simulation requires finite, contiguous, consistent usage intervals.");
    }
    end = interval.hour + interval.activeHours;
    energy += interval.energyKwh;
    cost += interval.costUsd;
    carbon += interval.carbonGrams;
  }
  if (![energy, cost, carbon, schedule.energyKwh, schedule.costUsd, schedule.carbonGrams].every(Number.isFinite) ||
      !close(end, schedule.endHour) || !close(energy, schedule.energyKwh) ||
      !close(cost, schedule.costUsd) || !close(carbon, schedule.carbonGrams)) {
    throw new RangeError("Simulation schedule totals must match its usage intervals.");
  }
}

/**
 * Replay planned usage at a fictional absolute hour, never real device telemetry.
 * Hourly energy, cost and modeled grid-average carbon accrue uniformly over each
 * interval's actual active duration; a partial EV hour does not become a full hour.
 * Finite clocks are clamped to 0–48. Missing appliances are idle; Chill is excluded.
 */
export function getSimulationStats(schedules: readonly Schedule[], absoluteHour: number): SimulationStats {
  if (!Number.isFinite(absoluteHour)) throw new RangeError("Simulation hour must be finite.");
  const hour = clamp(absoluteHour, 0, PLANNING_HOURS);
  const result: SimulationStats = { evie: idle("evie"), bubbles: idle("bubbles") };
  const seen = new Set<Schedule["applianceId"]>();
  for (const schedule of schedules) {
    if ((schedule.applianceId !== "evie" && schedule.applianceId !== "bubbles") || seen.has(schedule.applianceId)) {
      throw new RangeError("Simulation accepts at most one schedule each for Evie and Bubbles.");
    }
    seen.add(schedule.applianceId);
    validateSchedule(schedule);
    const complete = hour >= schedule.endHour;
    const status: SimulationStatus = complete ? "complete" : hour < schedule.startHour ? "queued" : "active";
    const stats = result[schedule.applianceId];
    stats.status = status;
    stats.totalEnergyKwh = schedule.energyKwh;
    stats.progressPercent = 100 * clamp((hour - schedule.startHour) / (schedule.endHour - schedule.startHour), 0, 1);
    for (const interval of schedule.intervals) {
      const fraction = complete ? 1 : clamp((hour - interval.hour) / interval.activeHours, 0, 1);
      stats.completedEnergyKwh += interval.energyKwh * fraction;
      stats.accruedCostUsd += interval.costUsd * fraction;
      stats.accruedCarbonGrams += interval.carbonGrams * fraction;
      if (status === "active" && hour >= interval.hour && hour < interval.hour + interval.activeHours) {
        stats.currentPowerKw = interval.powerKw;
      }
    }
  }
  return result;
}
