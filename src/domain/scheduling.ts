import type { ApplianceAgent } from "./appliances";
import { estimateUsage, type HourlyEnergy } from "./energy";

export type FlexibleAppliance = Extract<ApplianceAgent, { kind: "ev" | "dishwasher" }>;
export type OptimizationMode = "cost" | "carbon" | "balanced";
export type SchedulingRequest = {
  appliance: FlexibleAppliance;
  /** Inclusive allowed START hours. Availability and completion deadline also apply. */
  startWindow: { earliestHour: number; latestHour: number };
  /** Fixed reference start; never moved by the optimizer, even when now infeasible. */
  baselineStartHour: number;
};
export type EnergyTotals = { energyKwh: number; costUsd: number; carbonGrams: number };
export type UsageInterval = EnergyTotals & { hour: number; activeHours: number; powerKw: number };
export type Schedule = EnergyTotals & {
  applianceId: "evie" | "bubbles";
  startHour: number;
  endHour: number;
  /** Peak active power. Inspect intervals for a varying dishwasher profile. */
  powerKw: number;
  intervals: UsageInterval[];
};
export type ScheduleAssessment = {
  schedule: Schedule | null;
  feasible: boolean;
  issues: string[];
};
export type ScheduleComparison = {
  /** Baseline minus proposed; negative values mean increases, never clamped. */
  costSavingsUsd: number;
  carbonReductionGrams: number;
};
export type ApplianceOptions = {
  status: "feasible" | "infeasible" | "invalid-input";
  issues: string[];
  baseline: ScheduleAssessment;
  options: Schedule[];
  recommendations: Record<OptimizationMode, Schedule> | null;
  assumptions: string[];
  reasons: string[];
};
export type HouseholdPlan = {
  status: "feasible" | "infeasible" | "invalid-input";
  issues: string[];
  appliances: ApplianceOptions[];
  baseline: EnergyTotals | null;
  baselineFeasible: boolean;
  schedules: Schedule[];
  proposed: EnergyTotals | null;
  comparison: ScheduleComparison | null;
  assumptions: string[];
  reasons: string[];
};

export const PLANNING_HOURS = 48;
const EPSILON = 1e-9;
const isHour = (value: number) => Number.isInteger(value) && value >= 0 && value <= PLANNING_HOURS;
const positive = (value: number) => Number.isFinite(value) && value > 0;

export const SCHEDULING_ASSUMPTIONS = [
  "Simulated appliances and synthetic hourly prices; the 24-hour profile repeats over a 48-hour horizon.",
  "Sessions start on whole hours. EV charging is continuous at configured power; dishwasher cycles are noninterruptible.",
  "Carbon uses modeled grid-average intensity, not measured emissions or necessarily avoided marginal emissions. Grams are converted to kilograms by dividing by 1,000.",
  "Only Evie and Bubbles are included; Chill and other household loads are excluded from optimized savings.",
  "Baseline start times remain fixed. Both baseline and proposal use the current energy requirement and consumption profile.",
  "No shared power limit is imposed unless explicitly configured. Taxes, fixed charges, and charging losses are excluded.",
] as const;

function objectiveReason(mode: OptimizationMode): string {
  if (mode === "cost") return "Lowest total electricity cost among all feasible hourly-start combinations; equal costs prefer lower modeled carbon, then earlier starts.";
  if (mode === "carbon") return "Lowest total modeled grid emissions among all feasible hourly-start combinations; equal emissions prefer lower cost, then earlier starts.";
  return "Equal-weight normalized cost and modeled carbon across feasible combinations; ties prefer lower cost, then lower carbon, then earlier starts.";
}

function profileIssues(profile: readonly HourlyEnergy[]): string[] {
  return profile.length === 24 && Array.from(profile).every((row, hour) =>
    row != null && row.hour === hour && Number.isFinite(row.priceUsdPerKwh) &&
    Number.isFinite(row.carbonGramsPerKwh) && row.carbonGramsPerKwh >= 0)
    ? [] : ["Energy data must contain 24 ordered hours, finite prices, and non-negative carbon intensities."];
}

function operatingParameters(request: SchedulingRequest) {
  const agent = request.appliance;
  if (agent.kind === "ev") {
    const c = agent.constraints;
    return { energyKwh: c.energyNeededKwh, powerKw: c.maxPowerKw,
      duration: c.energyNeededKwh / c.maxPowerKw, available: c.availableFromHour, deadline: c.readyByHour };
  }
  const c = agent.constraints;
  const peakPower = Array.isArray(c.cycleProfileKwh) ? c.cycleProfileKwh.reduce((peak, energy) => Math.max(peak, energy), 0) : c.cycleEnergyKwh / c.cycleHours;
  return { energyKwh: c.cycleEnergyKwh, powerKw: peakPower,
    duration: c.cycleHours, available: c.earliestStartHour, deadline: c.finishByHour };
}

function requestIssues(request: SchedulingRequest): string[] {
  const p = operatingParameters(request);
  const issues: string[] = [];
  if (!positive(p.energyKwh) || !positive(p.powerKw) || !positive(p.duration))
    issues.push("Energy, power, and cycle duration must be finite and greater than zero.");
  if (positive(p.duration) && p.duration <= Number.EPSILON * PLANNING_HOURS)
    issues.push("The modeled session duration is too small to represent reliably on this timeline.");
  if (request.appliance.kind === "dishwasher") {
    const c = request.appliance.constraints;
    if (!Number.isInteger(c.cycleHours) || c.cycleHours < 1 || c.cycleHours > PLANNING_HOURS)
      issues.push("Dishwasher cycle duration must be a whole number of hours between 1 and 48.");
    if (c.cycleProfileKwh !== undefined) {
      const profile = c.cycleProfileKwh;
      if (!Array.isArray(profile) || profile.length !== c.cycleHours ||
          !Array.from(profile).every(value => Number.isFinite(value) && value >= 0))
        issues.push("Dishwasher consumption profile must contain one finite, non-negative kWh value per cycle hour.");
      else if (Math.abs(profile.reduce((sum, value) => sum + value, 0) - c.cycleEnergyKwh) > EPSILON * Math.max(1, c.cycleEnergyKwh))
        issues.push("Dishwasher consumption profile must sum to the configured cycle energy.");
    }
  }
  if (![p.available, p.deadline, request.startWindow.earliestHour, request.startWindow.latestHour,
    request.baselineStartHour].every(isHour))
    issues.push("Availability, start windows, baseline start, and deadlines must be whole hours between 0 and 48.");
  if (!((request.appliance.kind === "ev" && request.appliance.id === "evie") ||
      (request.appliance.kind === "dishwasher" && request.appliance.id === "bubbles")))
    issues.push("Only Evie (EV) and Bubbles (dishwasher) are supported by this scheduler.");
  return issues;
}

function inputIssues(request: SchedulingRequest, profile: readonly HourlyEnergy[]): string[] {
  const issues = [...profileIssues(profile), ...requestIssues(request)];
  if (!issues.length) {
    const energy = operatingParameters(request).energyKwh;
    if (profile.some(row => !Number.isFinite(energy * row.priceUsdPerKwh) || !Number.isFinite(energy * row.carbonGramsPerKwh)))
      issues.push("Estimated cost or emissions exceed the supported numeric range.");
  }
  return issues;
}

function constraintIssues(request: SchedulingRequest, startHour: number, endHour: number): string[] {
  const p = operatingParameters(request);
  const issues: string[] = [];
  if (startHour < p.available) issues.push("Start is earlier than appliance availability.");
  if (startHour < request.startWindow.earliestHour || startHour > request.startWindow.latestHour)
    issues.push("Start is outside the allowed start window.");
  if (endHour > p.deadline + EPSILON) issues.push("The full session cannot finish before the deadline.");
  return issues;
}

function buildSchedule(request: SchedulingRequest, startHour: number, profile: readonly HourlyEnergy[]): Schedule | null {
  const p = operatingParameters(request);
  const endHour = startHour + p.duration;
  if (!isHour(startHour) || endHour > PLANNING_HOURS || startHour >= PLANNING_HOURS) return null;
  const intervals: UsageInterval[] = [];
  const dishwasherProfile = request.appliance.kind === "dishwasher" ? request.appliance.constraints.cycleProfileKwh : undefined;
  for (let index = 0; index < Math.ceil(p.duration); index++) {
    const hour = startHour + index;
    const energyKwh = request.appliance.kind === "ev"
      ? Math.max(0, Math.min(p.powerKw, p.energyKwh - index * p.powerKw))
      : dishwasherProfile?.[index] ?? p.energyKwh / p.duration;
    const powerKw = request.appliance.kind === "ev" ? p.powerKw : energyKwh;
    const activeHours = request.appliance.kind === "ev" ? energyKwh / p.powerKw : 1;
    const totals = estimateUsage(energyKwh, profile[hour % 24]);
    intervals.push({ hour, energyKwh, activeHours, powerKw, ...totals });
  }
  return { applianceId: request.appliance.id as "evie" | "bubbles", startHour, endHour,
    powerKw: p.powerKw, intervals, ...sumEnergy(intervals) };
}

export function sumEnergy(items: readonly EnergyTotals[]): EnergyTotals {
  return items.reduce((total, item) => ({ energyKwh: total.energyKwh + item.energyKwh,
    costUsd: total.costUsd + item.costUsd, carbonGrams: total.carbonGrams + item.carbonGrams }),
  { energyKwh: 0, costUsd: 0, carbonGrams: 0 });
}

export function compareSchedules(baseline: EnergyTotals, proposed: EnergyTotals): ScheduleComparison {
  return { costSavingsUsd: baseline.costUsd - proposed.costUsd,
    carbonReductionGrams: baseline.carbonGrams - proposed.carbonGrams };
}

/** Evaluate a requested start, including priced but infeasible baseline schedules. */
export function evaluateSchedule(request: SchedulingRequest, startHour: number, profile: readonly HourlyEnergy[]): ScheduleAssessment {
  const issues = inputIssues(request, profile);
  if (issues.length) return { schedule: null, feasible: false, issues };
  const schedule = buildSchedule(request, startHour, profile);
  if (!schedule) return { schedule: null, feasible: false, issues: ["The session must start on a whole hour and fit inside the 48-hour timeline."] };
  const violations = constraintIssues(request, startHour, schedule.endHour);
  return { schedule, feasible: violations.length === 0, issues: violations };
}

/** Equal-weight min/max normalization prevents dollars and grams from mixing units. */
function bestByMode<T extends EnergyTotals>(options: readonly T[], mode: OptimizationMode): T {
  const costs = options.map(item => item.costUsd);
  const carbon = options.map(item => item.carbonGrams);
  const minCost = Math.min(...costs), costRange = Math.max(...costs) - minCost;
  const minCarbon = Math.min(...carbon), carbonRange = Math.max(...carbon) - minCarbon;
  const score = (item: T) => mode === "cost" ? item.costUsd : mode === "carbon" ? item.carbonGrams :
    0.5 * (costRange > EPSILON ? (item.costUsd - minCost) / costRange : 0) +
    0.5 * (carbonRange > EPSILON ? (item.carbonGrams - minCarbon) / carbonRange : 0);
  return options.reduce((best, item) => {
    const difference = score(item) - score(best);
    if (difference < -EPSILON) return item;
    if (Math.abs(difference) <= EPSILON) {
      const secondary = mode === "cost" ? item.carbonGrams - best.carbonGrams : item.costUsd - best.costUsd;
      if (secondary < -EPSILON) return item;
      if (Math.abs(secondary) <= EPSILON && item.carbonGrams < best.carbonGrams - EPSILON) return item;
    }
    // Ascending enumeration resolves remaining ties to the earliest start(s).
    return best;
  });
}

/** Exhaustive hourly-start search: one uninterrupted EV session or dishwasher cycle. */
export function getSchedulingOptions(request: SchedulingRequest, profile: readonly HourlyEnergy[]): ApplianceOptions {
  const invalid = inputIssues(request, profile);
  const baseline = evaluateSchedule(request, request.baselineStartHour, profile);
  const context = { assumptions: [...SCHEDULING_ASSUMPTIONS] };
  if (invalid.length) return { ...context, status: "invalid-input", issues: invalid, reasons: invalid, baseline, options: [], recommendations: null };
  const options: Schedule[] = [];
  for (let start = 0; start < PLANNING_HOURS; start++) {
    const schedule = buildSchedule(request, start, profile);
    if (schedule && constraintIssues(request, start, schedule.endHour).length === 0) options.push(schedule);
  }
  if (!options.length) {
    const p = operatingParameters(request);
    const issues = request.startWindow.earliestHour > request.startWindow.latestHour
      ? ["The earliest allowed start is later than the latest allowed start."]
      : [`No full ${Number(p.duration.toFixed(3))}-hour session fits availability, start window, deadline, and the 48-hour timeline.`];
    return { ...context, status: "infeasible", issues, reasons: issues, baseline, options, recommendations: null };
  }
  return { ...context, status: "feasible", issues: [], reasons: [`${options.length} complete sessions satisfy availability, the allowed start window, the completion deadline, and the 48-hour horizon.`], baseline, options, recommendations: {
    cost: bestByMode(options, "cost"), carbon: bestByMode(options, "carbon"), balanced: bestByMode(options, "balanced"),
  } };
}

/** Exact overlap check, including partial final hours; no power limit exists by default. */
function fitsPowerLimit(schedules: readonly Schedule[], limit: number): boolean {
  const intervals = schedules.flatMap(schedule => schedule.intervals);
  // Power can increase only at an interval start; partial-hour finishes only decrease it.
  return intervals.every(({ hour: time }) => intervals.reduce((power, interval) => power +
    (interval.hour <= time && interval.hour + interval.activeHours > time ? interval.powerKw : 0), 0) <= limit + EPSILON);
}

/** Joint exhaustive search for up to two distinct flexible appliances. Chill is excluded. */
export function optimizeHousehold(requests: readonly SchedulingRequest[], profile: readonly HourlyEnergy[],
  mode: OptimizationMode = "cost", sharedPowerLimitKw?: number): HouseholdPlan {
  const appliances = requests.map(request => getSchedulingOptions(request, profile));
  const issues: string[] = [];
  if (!requests.length || requests.length > 2 || new Set(requests.map(r => r.appliance.id)).size !== requests.length)
    issues.push("Provide one or two distinct flexible appliances.");
  if (!["cost", "carbon", "balanced"].includes(mode)) issues.push("Unknown optimization mode.");
  if (sharedPowerLimitKw !== undefined && !positive(sharedPowerLimitKw)) issues.push("An explicit shared power limit must be finite and greater than zero.");
  const totalEnergy = requests.reduce((sum, request) => sum + operatingParameters(request).energyKwh, 0);
  if (!Number.isFinite(totalEnergy) || profile.some(row => row &&
    (!Number.isFinite(totalEnergy * row.priceUsdPerKwh) || !Number.isFinite(totalEnergy * row.carbonGramsPerKwh))))
    issues.push("Combined household energy, cost, or emissions exceed the supported numeric range.");
  const baselines = appliances.map(result => result.baseline.schedule);
  const baseline = baselines.every((schedule): schedule is Schedule => schedule !== null) ? sumEnergy(baselines) : null;
  const baselineFeasible = appliances.every(result => result.baseline.feasible) &&
    (sharedPowerLimitKw === undefined || (baselines.every((s): s is Schedule => s !== null) && fitsPowerLimit(baselines, sharedPowerLimitKw)));
  const empty = { appliances, baseline, baselineFeasible, schedules: [], proposed: null, comparison: null,
    assumptions: [...SCHEDULING_ASSUMPTIONS], reasons: [] as string[] };
  if (issues.length || appliances.some(result => result.status === "invalid-input")) {
    const errors = [...issues, ...appliances.flatMap(result => result.issues)];
    return { ...empty, status: "invalid-input", issues: errors, reasons: errors };
  }
  if (appliances.some(result => result.status === "infeasible")) {
    const errors = appliances.flatMap((result, i) => result.issues.map(issue => `${requests[i].appliance.name}: ${issue}`));
    return { ...empty, status: "infeasible", issues: errors, reasons: errors };
  }
  const combinations: (EnergyTotals & { schedules: Schedule[] })[] = [];
  for (const first of appliances[0].options) {
    for (const second of appliances[1]?.options ?? [null]) {
      const schedules = second ? [first, second] : [first];
      if (sharedPowerLimitKw === undefined || fitsPowerLimit(schedules, sharedPowerLimitKw))
        combinations.push({ schedules, ...sumEnergy(schedules) });
    }
  }
  if (!combinations.length) {
    const errors = ["No combination of full sessions satisfies the configured shared power limit."];
    return { ...empty, status: "infeasible", issues: errors, reasons: errors };
  }
  const best = bestByMode(combinations, mode);
  const proposed = sumEnergy(best.schedules);
  const comparison = baseline ? compareSchedules(baseline, proposed) : null;
  const reasons = [objectiveReason(mode), `${combinations.length} feasible household combinations were evaluated.`];
  if (sharedPowerLimitKw !== undefined) reasons.push(`Combined interval power stays within the explicit ${sharedPowerLimitKw} kW limit.`);
  if (comparison && comparison.costSavingsUsd > EPSILON && comparison.carbonReductionGrams < -EPSILON)
    reasons.push("This plan reduces estimated cost but increases modeled carbon compared with the original schedule.");
  if (comparison && comparison.costSavingsUsd < -EPSILON)
    reasons.push("This plan costs more than the original schedule under the selected objective and constraints.");
  if (!baselineFeasible) reasons.push("The original baseline does not meet the current constraints; its fixed start remains the comparison reference when it can be priced.");
  return { status: "feasible", issues: [], appliances, baseline, baselineFeasible, schedules: best.schedules,
    proposed, comparison, assumptions: [...SCHEDULING_ASSUMPTIONS], reasons };
}
