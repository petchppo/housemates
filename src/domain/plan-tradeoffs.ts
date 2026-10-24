import type { HourlyEnergy } from "./energy";
import { optimizeHousehold, type EnergyTotals, type HouseholdPlan, type OptimizationMode, type SchedulingRequest } from "./scheduling";

export type PlanTradeoffRecommendation = { mode: OptimizationMode; plan: HouseholdPlan };
export type PlanTradeoffs = {
  baseline: EnergyTotals | null;
  baselineFeasible: boolean;
  recommendations: PlanTradeoffRecommendation[];
  issues: string[];
};

/** Three objective searches over identical inputs, not a complete Pareto frontier.
 * Callers must provide the CURRENT proposal's requests, including negotiated edits.
 * No plan is selected, approved, persisted, or executed by this calculation. */
export function buildPlanTradeoffs({ requests, energyProfile, sharedPowerLimitKw }: {
  requests: readonly SchedulingRequest[];
  energyProfile: readonly HourlyEnergy[];
  sharedPowerLimitKw?: number;
}): PlanTradeoffs {
  if (!requests.length) return { baseline: null, baselineFeasible: false, recommendations: [],
    issues: ["No flexible appliances selected. Chill and background cooling are excluded from this comparison."] };
  const recommendations = (["cost", "carbon", "balanced"] as const).map(mode => ({ mode,
    plan: optimizeHousehold(requests, energyProfile, mode, sharedPowerLimitKw) }));
  const first = recommendations[0].plan;
  return { baseline: first.baseline, baselineFeasible: first.baselineFeasible, recommendations,
    issues: [...new Set(recommendations.flatMap(item => item.plan.issues))] };
}
