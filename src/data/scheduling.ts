import { applianceAgents } from "./appliances";
import type { FlexibleAppliance, SchedulingRequest } from "../domain/scheduling";

/** Original starts remain fixed while users edit planning constraints. */
export const defaultSchedulingRequests: readonly SchedulingRequest[] = applianceAgents
  .filter((agent): agent is Extract<typeof agent, { kind: "ev" | "dishwasher" }> => agent.kind !== "air-conditioner")
  .map((appliance: FlexibleAppliance) => {
    const earliest = appliance.kind === "ev" ? appliance.constraints.availableFromHour : appliance.constraints.earliestStartHour;
    const deadline = appliance.kind === "ev" ? appliance.constraints.readyByHour : appliance.constraints.finishByHour;
    return { appliance, startWindow: { earliestHour: earliest, latestHour: deadline - 1 }, baselineStartHour: earliest };
  });
