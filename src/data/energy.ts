import type { HourlyEnergy } from "@/domain/energy";

export const energyScenario = {
  name: "A synthetic California weekday",
  source: "Hand-authored demo data — not a utility tariff, live grid feed, or forecast.",
  timezone: "America/Los_Angeles",
  intervalHours: 1,
  description: "Illustrative time-of-use prices rise from 4–9pm; midday solar lowers carbon intensity. Carbon represents estimated operational grid emissions, not lifecycle emissions.",
} as const;

// Fictional 24-hour profile with no actual date (avoids DST ambiguity).
// Rows cover [hour, hour + 1). Prices exclude taxes and fixed charges.
// A future overnight planner can repeat the profile using planningHour % 24.
const prices = [0.24, 0.24, 0.23, 0.23, 0.23, 0.24, 0.26, 0.28, 0.28, 0.26, 0.25, 0.24, 0.23, 0.23, 0.24, 0.28, 0.43, 0.49, 0.52, 0.50, 0.45, 0.30, 0.27, 0.25];
const carbon = [280, 270, 260, 255, 260, 280, 310, 300, 260, 210, 160, 125, 105, 100, 120, 165, 240, 320, 380, 400, 370, 330, 305, 290];

export const hourlyEnergy: readonly HourlyEnergy[] = prices.map((priceUsdPerKwh, hour) => ({
  hour, priceUsdPerKwh, carbonGramsPerKwh: carbon[hour],
}));

export function formatHour(hour: number) {
  const localHour = hour % 24;
  return `${localHour % 12 || 12}${localHour < 12 ? "am" : "pm"}`;
}
