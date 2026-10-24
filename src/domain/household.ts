import type { ApplianceId } from "./appliances";
import type { OptimizationMode, SchedulingRequest } from "./scheduling";

/** Shared local-only contracts. Saved plans store inputs; never trust cached totals. */
export type ChatRole = "user" | ApplianceId | "housemates";
export type ChatMessage = { id: string; role: ChatRole; text: string; at: string };
export type TrainingEvent = { id: string; at: string; reason: string; xp: number };
export type TrainingProgress = { xp: number; level: number; history: TrainingEvent[]; rewardedKeys: string[] };
export type HouseholdPreferences = { dishwasherCutoffHour: number | null; evDeadlineHour: number | null };
export type SavedPlan = {
  id: string;
  createdAt: string;
  requests: SchedulingRequest[];
  mode: OptimizationMode;
  sharedPowerLimitKw: number | null;
};
export type HouseholdState = {
  version: 1;
  requests: SchedulingRequest[];
  mode: OptimizationMode;
  sharedPowerLimitKw: number | null;
  preferences: HouseholdPreferences;
  messages: ChatMessage[];
  savedPlans: SavedPlan[];
  training: Record<ApplianceId, TrainingProgress>;
  proposalStatus: "none" | "pending" | "rejected" | "approved";
  proposalFingerprint: string | null;
};

/** Canonical planning fields only: stable across restoration and display-copy changes. */
export function planningFingerprint(state: Pick<HouseholdState, "requests" | "mode" | "sharedPowerLimitKw">): string {
  const requests = state.requests.map(request => {
    const agent = request.appliance;
    const constraints = agent.kind === "ev"
      ? [agent.constraints.energyNeededKwh, agent.constraints.maxPowerKw, agent.constraints.availableFromHour, agent.constraints.readyByHour]
      : [agent.constraints.cycleHours, agent.constraints.cycleEnergyKwh, agent.constraints.earliestStartHour,
        agent.constraints.finishByHour, agent.constraints.interruptible, agent.constraints.cycleProfileKwh ?? null];
    return [agent.id, agent.kind, constraints, request.startWindow.earliestHour,
      request.startWindow.latestHour, request.baselineStartHour];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify([requests, state.mode, state.sharedPowerLimitKw]);
}
