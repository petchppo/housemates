/** Every agent represents a fictional appliance; no device commands are sent. */
export type ApplianceId = "evie" | "bubbles" | "chill";

type AgentBase = {
  id: ApplianceId;
  name: string;
  role: string;
  personality: string;
  introduction: string;
  simulated: true;
};

export type ApplianceAgent = AgentBase & (
  | { kind: "ev"; constraints: { energyNeededKwh: number; maxPowerKw: number; availableFromHour: number; readyByHour: number } }
  | { kind: "dishwasher"; constraints: { cycleHours: number; cycleEnergyKwh: number; cycleProfileKwh?: number[]; earliestStartHour: number; finishByHour: number; interruptible: false } }
  | { kind: "air-conditioner"; constraints: { minComfortC: number; maxComfortC: number; ratedPowerKw: number; occupiedFromHour: number; occupiedUntilHour: number } }
);
