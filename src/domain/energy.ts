export type HourlyEnergy = {
  hour: number;
  priceUsdPerKwh: number;
  carbonGramsPerKwh: number;
};

/** Pure arithmetic shared by the homepage and deterministic scheduler. */
export function estimateUsage(energyKwh: number, interval: HourlyEnergy) {
  if (!Number.isFinite(energyKwh) || energyKwh < 0) {
    throw new RangeError("Energy must be a finite, non-negative number of kWh.");
  }
  if (!Number.isFinite(interval.priceUsdPerKwh) || !Number.isFinite(interval.carbonGramsPerKwh) || interval.carbonGramsPerKwh < 0) {
    throw new RangeError("Prices must be finite and carbon intensity must be finite and non-negative.");
  }
  if (!Number.isFinite(energyKwh * interval.priceUsdPerKwh) || !Number.isFinite(energyKwh * interval.carbonGramsPerKwh)) {
    throw new RangeError("Estimated cost or emissions exceed the supported numeric range.");
  }
  return {
    costUsd: energyKwh * interval.priceUsdPerKwh,
    carbonGrams: energyKwh * interval.carbonGramsPerKwh,
  };
}
