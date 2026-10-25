import { validateDemoProfile, type DemoProfile } from "./demo";

/** Pairing follows the reviewed household, not a refreshed forecast or planning preview. */
export function messageHouseholdContext(profile: DemoProfile): string {
  const valid = validateDemoProfile(profile);
  if (!valid) throw new RangeError("A valid household is required for messaging.");
  return JSON.stringify({
    version: valid.version,
    regionId: valid.regionId,
    residenceType: valid.residenceType,
    applianceIds: [...valid.applianceIds].sort(),
    weatherLocation: valid.weatherLocation ?? null,
    applimons: valid.applimons ? [...valid.applimons].sort((a, b) => a.id.localeCompare(b.id)) : [],
  });
}
