import type { ApplianceAgent } from "@/domain/appliances";

// Hours are relative to midnight on the demo day. 31 = 7am the next day.
export const applianceAgents = [
  {
    id: "evie", name: "Evie", role: "The electric vehicle", kind: "ev",
    personality: "Easygoing, with a very firm morning deadline.",
    introduction: "I’m happy to charge later. Just get me ready for the morning commute.",
    simulated: true,
    constraints: { energyNeededKwh: 14, maxPowerKw: 7, availableFromHour: 18, readyByHour: 31 },
  },
  {
    id: "bubbles", name: "Bubbles", role: "The dishwasher", kind: "dishwasher",
    personality: "A night owl who likes to finish what they start.",
    introduction: "Dinner’s done. I can wait for a better hour, as long as breakfast plates are ready.",
    simulated: true,
    constraints: { cycleHours: 2, cycleEnergyKwh: 1.2, earliestStartHour: 20, finishByHour: 31, interruptible: false },
  },
  {
    id: "chill", name: "Chill", role: "The air conditioner", kind: "air-conditioner",
    personality: "Comfort comes first. A little flexibility comes second.",
    introduction: "Let’s save energy, but keep the living room comfortable while everyone’s home.",
    simulated: true,
    constraints: { minComfortC: 22, maxComfortC: 25, ratedPowerKw: 1.5, occupiedFromHour: 17, occupiedUntilHour: 23 },
  },
] as const satisfies readonly ApplianceAgent[];
