import { APPLIMON_IDS, getApplimon, validateApplimonInventory, type ApplimonId } from "./applimon-catalog";
import { getApplimonSchedulingOptions, type ApplimonOptions, type ApplimonSchedule, type ApplimonTeamPlan } from "./applimon-planning";
import type { HourlyEnergy } from "./energy";
import { compareSchedules, getSchedulingOptions, sumEnergy, type OptimizationMode, type SchedulingRequest } from "./scheduling";

export type CoordinatedOptimizationInput = {
  inventory: unknown;
  energyProfile: readonly HourlyEnergy[];
  mode: OptimizationMode;
  /** Authoritative current requests for selected Evie/Bubbles; preserves negotiated profiles and constraints. */
  coreRequests?: readonly SchedulingRequest[];
  /** Explicit simulated load budget, not a claim about household circuit capacity. */
  modeledPowerLimitKw?: number;
  /** Exactly 48 one-hour constant modeled background powers. Never included in flexible savings. */
  backgroundPowerKw?: readonly number[];
  maxSearchNodes?: number;
};
export type CoordinatedOptimizationResult = Omit<ApplimonTeamPlan, "status"> & {
  status: ApplimonTeamPlan["status"] | "search-limit";
  solver: {
    method: "binary-linear-branch-and-bound";
    optimal: boolean;
    visitedNodes: number;
    variableCount: number;
    objectiveValue: number | null;
    normalization: { costRangeUsd: number; carbonRangeGrams: number } | null;
  };
  peakModeledPowerKw: number | null;
};

const EPS = 1e-9;
const MAX_NODES = 250_000;
const MODES = ["cost", "carbon", "balanced"] as const;
const ASSUMPTIONS = [
  "Planning preview only: simulated activity and synthetic USD prices/grid-average carbon, not device control or verified savings.",
  "Binary linear model: choose exactly one complete hourly-start candidate per flexible appliance within its existing availability, window and deadline. Fractional completion and varying core cycle profiles are preserved.",
  "Supplied core requests are authoritative for selected Evie/Bubbles, including their original baseline and consumption profile. The caller owns immutable-setting policy; this pure optimizer validates but never mutates those requests.",
  "Chill, Frost and Ember are protected and excluded from optimized totals. Breeze keeps its original fixed routine and is accounted separately.",
  "Flexible baseline starts and task energy remain fixed across comparisons. Negative savings mean an increase. Background and fixed-device totals never inflate flexible savings.",
  "Balanced minimizes equal-weight normalized household cost and carbon. Its scales are aggregate ranges over individually feasible candidates, not independently normalized appliances or a claimed Pareto frontier.",
  "A configured load budget constrains instantaneous modeled flexible power plus unchanged fan power plus the supplied constant hourly background. It is not a verified whole-house or electrical circuit limit; protected appliance specifications are not added as extra background.",
  "Weather can affect the supplied background load and therefore budget feasibility; it does not change task energy, synthetic prices or carbon factors. Without a load budget that background is context only.",
  "No laundry dependency, unattended-use permission, charging loss or additional task is inferred. The 24-hour price/carbon profile repeats across the 48-hour horizon.",
  "Search has a fixed work bound. Only a completed optimality proof produces a schedule; an exhausted search returns no approvable schedule. Numerical comparisons use a small floating-point tolerance.",
];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finiteTotals = (value: { energyKwh: number; costUsd: number; carbonGrams: number } | null) => value === null || Object.values(value).every(Number.isFinite);
const rank = (id: ApplimonId) => APPLIMON_IDS.indexOf(id);
const cloneSchedule = (schedule: ApplimonSchedule): ApplimonSchedule => ({ ...schedule, intervals: schedule.intervals.map(interval => ({ ...interval })) });

function validCoreShape(value: unknown): value is SchedulingRequest {
  if (!record(value) || !record(value.appliance) || !record(value.appliance.constraints) || !record(value.startWindow)) return false;
  return (value.appliance.id === "evie" && value.appliance.kind === "ev") || (value.appliance.id === "bubbles" && value.appliance.kind === "dishwasher");
}
function peak(schedules: readonly ApplimonSchedule[], background: readonly number[]): number {
  const load = [...background];
  for (const schedule of schedules) for (const interval of schedule.intervals) {
    // Every increase occurs at an integer start. Partial final hours reduce power only later.
    if (interval.activeHours > 0) load[interval.hour] += interval.powerKw;
  }
  return Math.max(0, ...load);
}

type Candidate = { schedule: ApplimonSchedule; score: number };
type Job = { index: number; options: Candidate[]; minScore: number; minCost: number; minCarbon: number; minStart: number };
type Value = { score: number; cost: number; carbon: number; starts: number[] };
function compareValue(a: Value, b: Value, mode: OptimizationMode): number {
  const aKeys = mode === "cost" ? [a.cost, a.carbon] : mode === "carbon" ? [a.carbon, a.cost] : [a.score, a.cost, a.carbon];
  const bKeys = mode === "cost" ? [b.cost, b.carbon] : mode === "carbon" ? [b.carbon, b.cost] : [b.score, b.cost, b.carbon];
  for (let i = 0; i < aKeys.length; i++) if (Math.abs(aKeys[i] - bKeys[i]) > EPS) return aKeys[i] < bKeys[i] ? -1 : 1;
  for (let i = 0; i < a.starts.length; i++) if (a.starts[i] !== b.starts[i]) return a.starts[i] < b.starts[i] ? -1 : 1;
  return 0;
}

/** Exact bounded binary-start optimizer. No network, storage, React, approval or execution authority. */
export function optimizeCoordinatedApplimons(input: CoordinatedOptimizationInput): CoordinatedOptimizationResult {
  const mode: OptimizationMode = input && MODES.includes(input.mode) ? input.mode : "cost";
  const empty: CoordinatedOptimizationResult = {
    status: "invalid-input", mode, appliances: [], baseline: null, baselineFeasible: false, proposed: null, comparison: null,
    schedules: [], unchangedSchedules: [], unchangedTotals: null, protectedIds: [], issues: [], assumptions: [...ASSUMPTIONS],
    solver: { method: "binary-linear-branch-and-bound", optimal: false, visitedNodes: 0, variableCount: 0, objectiveValue: null, normalization: null },
    peakModeledPowerKw: null,
  };
  const invalid = (message: string): CoordinatedOptimizationResult => ({ ...empty, issues: [message] });
  if (!record(input) || !MODES.includes(input.mode)) return invalid("Choose cost, carbon or balanced planning.");
  const inventory = validateApplimonInventory(input.inventory);
  if (!inventory) return invalid("Provide a unique, confirmed and physically consistent appliance inventory.");
  if (!Array.isArray(input.energyProfile) || input.energyProfile.length !== 24 || !Array.from(input.energyProfile).every((row, hour) => row != null && row.hour === hour && Number.isFinite(row.priceUsdPerKwh) && Number.isFinite(row.carbonGramsPerKwh) && row.carbonGramsPerKwh >= 0))
    return invalid("Energy data must contain 24 ordered hours, finite prices and non-negative carbon intensities.");
  const limit = input.modeledPowerLimitKw;
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) return invalid("The explicit modeled power budget must be finite and greater than zero.");
  const background = input.backgroundPowerKw === undefined ? Array<number>(48).fill(0) : input.backgroundPowerKw;
  if (!Array.isArray(background) || background.length !== 48 || !Array.from(background).every(value => typeof value === "number" && Number.isFinite(value) && value >= 0))
    return invalid("Background power must contain exactly 48 finite non-negative hourly kW values.");
  const nodeBudget = input.maxSearchNodes ?? MAX_NODES;
  if (!Number.isSafeInteger(nodeBudget) || nodeBudget < 1 || nodeBudget > MAX_NODES) return invalid(`Search work must be an integer from 1 to ${MAX_NODES}.`);
  const overrides = new Map<ApplimonId, SchedulingRequest>();
  if (input.coreRequests !== undefined) {
    if (!Array.isArray(input.coreRequests) || input.coreRequests.length > 2) return invalid("Core requests must be a unique selected Evie/Bubbles subset.");
    for (const request of input.coreRequests) {
      if (!validCoreShape(request) || overrides.has(request.appliance.id) || !inventory.some(device => device.id === request.appliance.id))
        return invalid("Core requests must be a unique selected Evie/Bubbles subset with valid scheduling fields.");
      overrides.set(request.appliance.id, request);
    }
  }
  const appliances: ApplimonOptions[] = inventory.sort((a, b) => rank(a.id) - rank(b.id)).map(device => {
    const request = overrides.get(device.id);
    if (!request) return getApplimonSchedulingOptions(device, input.energyProfile);
    const options = getSchedulingOptions(request, input.energyProfile);
    return { ...options, id: device.id, policy: "flexible", assumptions: [...ASSUMPTIONS] };
  });
  const flexible = appliances.filter(item => item.policy === "flexible");
  const fixed = appliances.filter(item => item.policy === "fixed");
  const protectedIds = inventory.filter(device => getApplimon(device.id).schedulingPolicy === "protected").map(device => device.id);
  const baselineSchedules = flexible.flatMap(item => item.baseline.schedule ? [item.baseline.schedule] : []);
  const baseline = baselineSchedules.length === flexible.length ? sumEnergy(baselineSchedules) : null;
  const unchangedSchedules = fixed.flatMap(item => item.baseline.schedule ? [item.baseline.schedule] : []);
  const unchangedTotals = unchangedSchedules.length === fixed.length ? sumEnergy(unchangedSchedules) : null;
  const basePeak = peak(unchangedSchedules, background);
  const baselinePeak = baseline ? peak([...baselineSchedules, ...unchangedSchedules], background) : null;
  const shell: CoordinatedOptimizationResult = { ...empty, appliances, protectedIds, baseline, unchangedSchedules, unchangedTotals,
    baselineFeasible: !!baseline && flexible.every(item => item.baseline.feasible) && (limit === undefined || (baselinePeak !== null && baselinePeak <= limit + EPS)),
  };
  const issues = appliances.flatMap(item => item.issues.map(issue => `${item.id ? getApplimon(item.id).name : "Appliance"}: ${issue}`));
  if (appliances.some(item => item.status === "invalid-input") || !finiteTotals(baseline) || !finiteTotals(unchangedTotals) || !Number.isFinite(basePeak) || (baselinePeak !== null && !Number.isFinite(baselinePeak)))
    return { ...shell, issues: issues.length ? issues : ["Combined costs, emissions or modeled power exceed the supported numeric range."] };
  if (appliances.some(item => item.status === "infeasible")) return { ...shell, status: "infeasible", issues };
  if (limit !== undefined && basePeak > limit + EPS) return { ...shell, status: "infeasible", issues: ["Unchanged fan and modeled background already exceed the simulated load budget; protected loads will not be shifted or removed."] };

  const ranges = flexible.map(item => {
    const costs = item.options.map(option => option.costUsd), carbon = item.options.map(option => option.carbonGrams);
    return { minCost: Math.min(...costs), maxCost: Math.max(...costs), minCarbon: Math.min(...carbon), maxCarbon: Math.max(...carbon) };
  });
  const costRangeUsd = ranges.reduce((sum, value) => sum + (value.maxCost - value.minCost), 0);
  const carbonRangeGrams = ranges.reduce((sum, value) => sum + (value.maxCarbon - value.minCarbon), 0);
  const extremeTotals = [ranges.reduce((sum, value) => sum + value.minCost, 0), ranges.reduce((sum, value) => sum + value.maxCost, 0), ranges.reduce((sum, value) => sum + value.maxCarbon, 0)];
  if (![costRangeUsd, carbonRangeGrams, ...extremeTotals].every(Number.isFinite)) return { ...shell, issues: ["Objective normalization exceeds the supported numeric range."] };
  const jobs: Job[] = flexible.map((item, index) => {
    const scores = item.options.map(schedule => ({ schedule, score: mode === "cost" ? schedule.costUsd : mode === "carbon" ? schedule.carbonGrams :
      .5 * (costRangeUsd > EPS ? (schedule.costUsd - ranges[index].minCost) / costRangeUsd : 0) +
      .5 * (carbonRangeGrams > EPS ? (schedule.carbonGrams - ranges[index].minCarbon) / carbonRangeGrams : 0) }));
    scores.sort((a, b) => compareValue({ score: a.score, cost: a.schedule.costUsd, carbon: a.schedule.carbonGrams, starts: [a.schedule.startHour] },
      { score: b.score, cost: b.schedule.costUsd, carbon: b.schedule.carbonGrams, starts: [b.schedule.startHour] }, mode));
    return { index, options: scores, minScore: Math.min(...scores.map(item => item.score)), minCost: ranges[index].minCost, minCarbon: ranges[index].minCarbon, minStart: Math.min(...scores.map(item => item.schedule.startHour)) };
  }).sort((a, b) => a.options.length - b.options.length || a.index - b.index);
  const variableCount = jobs.reduce((sum, job) => sum + job.options.length, 0);
  const solver = { ...shell.solver, variableCount, normalization: { costRangeUsd, carbonRangeGrams } };
  const loads = [...background];
  for (const schedule of unchangedSchedules) for (const interval of schedule.intervals) if (interval.activeHours > 0) loads[interval.hour] += interval.powerKw;
  const selected: (ApplimonSchedule | undefined)[] = Array(flexible.length).fill(undefined);
  let best: { value: Value; schedules: ApplimonSchedule[] } | null = null, visitedNodes = 1, exhausted = false;
  function search(depth: number, score: number, cost: number, carbon: number) {
    if (exhausted) return;
    const starts = selected.map(schedule => schedule?.startHour ?? 0);
    let boundScore = score, boundCost = cost, boundCarbon = carbon;
    for (let i = depth; i < jobs.length; i++) {
      boundScore += jobs[i].minScore; boundCost += jobs[i].minCost; boundCarbon += jobs[i].minCarbon; starts[jobs[i].index] = jobs[i].minStart;
    }
    if (best && compareValue({ score: boundScore, cost: boundCost, carbon: boundCarbon, starts }, best.value, mode) >= 0) return;
    if (depth === jobs.length) {
      best = { value: { score, cost, carbon, starts }, schedules: selected.map(schedule => cloneSchedule(schedule!)) };
      return;
    }
    const job = jobs[depth];
    for (const candidate of job.options) {
      if (visitedNodes >= nodeBudget) { exhausted = true; return; }
      visitedNodes++;
      const schedule = candidate.schedule;
      if (limit !== undefined && schedule.intervals.some(interval => interval.activeHours > 0 && loads[interval.hour] + interval.powerKw > limit + EPS)) continue;
      const priorLoads = schedule.intervals.map(interval => loads[interval.hour]);
      for (const interval of schedule.intervals) if (interval.activeHours > 0) loads[interval.hour] += interval.powerKw;
      selected[job.index] = schedule;
      search(depth + 1, score + candidate.score, cost + schedule.costUsd, carbon + schedule.carbonGrams);
      selected[job.index] = undefined;
      schedule.intervals.forEach((interval, index) => { loads[interval.hour] = priorLoads[index]; });
      if (exhausted) return;
    }
  }
  search(0, 0, 0, 0);
  const completed = best as { value: Value; schedules: ApplimonSchedule[] } | null;
  if (exhausted) return { ...shell, solver: { ...solver, visitedNodes }, status: "search-limit", issues: ["The bounded search could not finish proving the optimal schedule. Narrow appliance windows or adjust the simulated load budget; no schedule is proposed."] };
  if (!completed) return { ...shell, solver: { ...solver, visitedNodes }, status: "infeasible", issues: ["No combination of complete sessions fits the existing constraints and simulated load budget."] };
  const proposed = sumEnergy(completed.schedules);
  const peakModeledPowerKw = peak([...completed.schedules, ...unchangedSchedules], background);
  if (!finiteTotals(proposed) || !Number.isFinite(peakModeledPowerKw)) return { ...shell, solver: { ...solver, visitedNodes }, issues: ["Combined schedule totals exceed the supported numeric range."] };
  return { ...shell, status: "feasible", schedules: completed.schedules, proposed, comparison: baseline ? compareSchedules(baseline, proposed) : null,
    peakModeledPowerKw, solver: { ...solver, visitedNodes, optimal: true, objectiveValue: completed.value.score }, issues: [] };
}
