export type HourlyEnergy = {
  hour: number;
  priceUsdPerKwh: number;
  carbonGramsPerKwh: number;
};

/** Pure arithmetic. A constraint-based scheduler is the next milestone. */
export function estimateUsage(energyKwh: number, interval: HourlyEnergy) {
  if (!Number.isFinite(energyKwh) || energyKwh < 0) {
    throw new RangeError("Energy must be a finite, non-negative number of kWh.");
  }
  return {
    costUsd: energyKwh * interval.priceUsdPerKwh,
    carbonGrams: energyKwh * interval.carbonGramsPerKwh,
  };
}
