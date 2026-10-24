import { APPLIMON_IDS, getApplimon, validateApplimonDevice, validateApplimonInventory, type ApplimonDevice, type ApplimonId } from "./applimon-catalog";
import type { HourlyEnergy } from "./energy";
import { compareSchedules, evaluateSchedule, getSchedulingOptions, sumEnergy, type EnergyTotals, type OptimizationMode, type Schedule, type ScheduleComparison, type SchedulingRequest } from "./scheduling";
import { getSimulationStats, type SimulationApplianceStats } from "./simulation";

export type ApplimonSchedule = Omit<Schedule, "applianceId"> & { applianceId: ApplimonId };
export type ApplimonAssessment = { schedule: ApplimonSchedule | null; feasible: boolean; issues: string[] };
export type ApplimonOptions = {
  id: ApplimonId | null;
  status: "feasible" | "infeasible" | "invalid-input" | "protected";
  policy: "flexible" | "fixed" | "protected" | null;
  baseline: ApplimonAssessment;
  options: ApplimonSchedule[];
  recommendations: Record<OptimizationMode, ApplimonSchedule> | null;
  issues: string[];
  reasons: string[];
  assumptions: string[];
};
export type ApplimonTeamPlan = {
  status: "feasible" | "infeasible" | "invalid-input";
  mode: OptimizationMode;
  appliances: ApplimonOptions[];
  /** Flexible jobs only. Fixed/protected devices never inflate optimized savings. */
  baseline: EnergyTotals | null;
  baselineFeasible: boolean;
  proposed: EnergyTotals | null;
  comparison: ScheduleComparison | null;
  schedules: ApplimonSchedule[];
  /** Fixed-use estimates are unchanged and accounted separately. */
  unchangedSchedules: ApplimonSchedule[];
  unchangedTotals: EnergyTotals | null;
  protectedIds: ApplimonId[];
  issues: string[];
  assumptions: string[];
};
export type ApplimonActivity = Omit<SimulationApplianceStats, "applianceId"> & { applianceId: ApplimonId };

export const APPLIMON_PLANNING_ASSUMPTIONS = [
  "One reviewed device per category and one uninterrupted job per device in a 48-hour synthetic timeline. Starts and windows use whole hours; jobs may finish between hours.",
  "Cycle energy is the confirmed energy per requested task. Its constant average power is energy divided by duration, bounded by entered rated power; a nameplate rating is not measured cycle consumption.",
  "EV duration is required energy divided by confirmed charging power. Availability and deadlines constrain every candidate; no absent car is shifted into a solar window.",
  "The 24-hour synthetic price and carbon profiles repeat. Cost and grid-average carbon are calculated independently; net demand alone is neither a tariff nor an emissions factor.",
  "Cost-first and carbon-first minimize their respective household totals for independent jobs. Balanced applies equal-weight normalized cost/carbon to each appliance's feasible options; it is not a global household Pareto optimum.",
  "Baseline starts and task energy stay fixed across comparisons. Negative differences are increases. Fixed fan usage is separate and unchanged; protected cooling, refrigeration and water heating are excluded from optimization and totals.",
  "No shared power limit, laundry dependency, unattended-use permission, charging loss or physical device connection is inferred. Choose a safe operating window and required availability explicitly.",
] as const;

const MODES: readonly OptimizationMode[] = ["cost", "carbon", "balanced"];
const emptyAssessment = (issues: string[] = []): ApplimonAssessment => ({ schedule: null, feasible: false, issues });
const relabel = (schedule: Schedule, id: ApplimonId): ApplimonSchedule => ({ ...schedule, applianceId: id, intervals: schedule.intervals.map(interval => ({ ...interval })) });

/** Reuse the existing exact fractional-session ledger/search with a constant-power job adapter.
 * The internal surrogate ID never escapes; it does not turn other appliances into an EV. */
function asSchedulingRequest(device: ApplimonDevice, fixed = false): SchedulingRequest {
  const entry = getApplimon(device.id);
  const power = entry.jobKind === "charge" ? device.ratedPowerW / 1000 : device.energyKwh / device.durationHours;
  return {
    appliance: { id: "evie", name: entry.name, role: entry.category, personality: "", introduction: "", simulated: true, kind: "ev",
      constraints: { energyNeededKwh: device.energyKwh, maxPowerKw: power, availableFromHour: fixed ? 0 : device.earliestStartHour, readyByHour: fixed ? 48 : device.deadlineHour } },
    startWindow: fixed ? { earliestHour: 0, latestHour: 47 } : { earliestHour: device.earliestStartHour, latestHour: device.latestStartHour },
    baselineStartHour: device.baselineStartHour,
  };
}

/** Validated, side-effect-free API for future agents. OCR output must be reviewed before this boundary. */
export function getApplimonSchedulingOptions(input: unknown, profile: readonly HourlyEnergy[]): ApplimonOptions {
  const device = validateApplimonDevice(input);
  const base = { id: device?.id ?? null, policy: device ? getApplimon(device.id).schedulingPolicy : null,
    assumptions: [...APPLIMON_PLANNING_ASSUMPTIONS], options: [], recommendations: null, baseline: emptyAssessment() };
  const invalid = !device ? ["A confirmed supported appliance with finite, physically consistent energy, power and duration is required."] :
    ![device.earliestStartHour, device.latestStartHour, device.deadlineHour, device.baselineStartHour].every(Number.isInteger)
      ? ["Availability, start windows, deadline and baseline must use whole hours from 0 to 48."] :
      !Array.isArray(profile) ? ["An ordered 24-hour energy profile is required."] : [];
  if (invalid.length || !device) return { ...base, status: "invalid-input", issues: invalid, reasons: invalid, baseline: emptyAssessment(invalid) };
  // The existing scheduler validates the entire hourly data and numeric arithmetic for every policy.
  const request = asSchedulingRequest(device, base.policy !== "flexible");
  const evaluated = evaluateSchedule(request, device.baselineStartHour, profile);
  const options = getSchedulingOptions(request, profile);
  if (options.status === "invalid-input") return { ...base, status: "invalid-input", issues: options.issues, reasons: options.reasons, baseline: emptyAssessment(options.issues) };
  if (base.policy === "protected") return { ...base, status: "protected", issues: [], reasons: [getApplimon(device.id).guidance] };
  const baseline: ApplimonAssessment = { ...evaluated, schedule: evaluated.schedule ? relabel(evaluated.schedule, device.id) : null };
  if (base.policy === "fixed") {
    if (!baseline.schedule) return { ...base, baseline, status: "infeasible", issues: baseline.issues, reasons: baseline.issues };
    return { ...base, baseline, status: "feasible", issues: [], reasons: ["This comfort-use routine stays at its fixed original start; no shifting savings are claimed."] };
  }
  return { ...base, baseline, status: options.status, issues: options.issues, reasons: options.reasons,
    options: options.options.map(schedule => relabel(schedule, device.id)),
    recommendations: options.recommendations ? {
      cost: relabel(options.recommendations.cost, device.id), carbon: relabel(options.recommendations.carbon, device.id), balanced: relabel(options.recommendations.balanced, device.id),
    } : null };
}

/** Independent hourly-start search. No shared power/dependency constraint is invented or silently dropped. */
export function optimizeApplimonTeam(input: unknown, profile: readonly HourlyEnergy[], mode: OptimizationMode = "cost"): ApplimonTeamPlan {
  const inventory = validateApplimonInventory(input);
  const shell: ApplimonTeamPlan = { status: "invalid-input", mode, appliances: [], baseline: null, baselineFeasible: false, proposed: null, comparison: null,
    schedules: [], unchangedSchedules: [], unchangedTotals: null, protectedIds: [], issues: [], assumptions: [...APPLIMON_PLANNING_ASSUMPTIONS] };
  if (!inventory || !MODES.includes(mode)) return { ...shell, issues: ["Provide a unique, confirmed inventory and cost, carbon or balanced objective."] };
  if (!Array.isArray(profile) || profile.length !== 24 || !Array.from(profile).every((row, hour) => row != null && row.hour === hour && Number.isFinite(row.priceUsdPerKwh) && Number.isFinite(row.carbonGramsPerKwh) && row.carbonGramsPerKwh >= 0))
    return { ...shell, issues: ["Energy data must contain 24 ordered hours, finite prices and non-negative carbon intensities."] };
  const appliances = inventory.map(device => getApplimonSchedulingOptions(device, profile));
  const issues = appliances.flatMap(item => item.issues.map(issue => `${item.id ? getApplimon(item.id).name : "Appliance"}: ${issue}`));
  const flexible = appliances.filter(item => item.policy === "flexible");
  const unchanged = appliances.filter(item => item.policy === "fixed");
  const protectedIds = inventory.filter(device => getApplimon(device.id).schedulingPolicy === "protected").map(device => device.id);
  const baseline = flexible.every(item => item.baseline.schedule) ? sumEnergy(flexible.map(item => item.baseline.schedule!)) : null;
  const unchangedSchedules = unchanged.flatMap(item => item.baseline.schedule ? [item.baseline.schedule] : []);
  const unchangedTotals = unchanged.every(item => item.baseline.schedule) ? sumEnergy(unchangedSchedules) : null;
  const status = appliances.some(item => item.status === "invalid-input") ? "invalid-input" : appliances.some(item => item.status === "infeasible") ? "infeasible" : "feasible";
  const schedules = status === "feasible" ? flexible.map(item => item.recommendations![mode]) : [];
  const proposed = status === "feasible" ? sumEnergy(schedules) : null;
  if ([baseline, proposed, unchangedTotals].some(total => total && !Object.values(total).every(Number.isFinite)))
    return { ...shell, appliances, protectedIds, issues: ["Combined cost or emissions exceed the supported numeric range."] };
  return { ...shell, status, appliances, issues, baseline, baselineFeasible: flexible.every(item => item.baseline.feasible), proposed,
    comparison: baseline && proposed ? compareSchedules(baseline, proposed) : null, schedules, unchangedSchedules, unchangedTotals, protectedIds };
}

/** Reuse the strict interval validator and fractional replay. These readings are always simulated. */
export function getApplimonSimulationStats(schedules: readonly ApplimonSchedule[], absoluteHour: number): Partial<Record<ApplimonId, ApplimonActivity>> {
  if (!Array.isArray(schedules) || schedules.length > APPLIMON_IDS.length || !Number.isFinite(absoluteHour)) throw new RangeError("A bounded schedule list and finite simulation hour are required.");
  const output: Partial<Record<ApplimonId, ApplimonActivity>> = {};
  for (const schedule of schedules as readonly ApplimonSchedule[]) {
    if (!schedule || !APPLIMON_IDS.includes(schedule.applianceId) || output[schedule.applianceId] || getApplimon(schedule.applianceId).schedulingPolicy === "protected")
      throw new RangeError("Simulation requires unique supported, non-protected appliance schedules.");
    const stats = getSimulationStats([{ ...schedule, applianceId: "evie" }], absoluteHour).evie;
    output[schedule.applianceId] = { ...stats, applianceId: schedule.applianceId };
  }
  return output;
}
