import type { ApplianceId } from "./appliances";
import { validateDemoProfile, type DemoProfile } from "./demo";
import { APPLIMON_IDS, getApplimon, validateApplimonDevice, type ApplimonDevice, type ApplimonId } from "./applimon-catalog";

export const DEMO_PROFILE_STORAGE_KEY = "housemates-demo-v1";
const IDS: readonly ApplianceId[] = ["evie", "bubbles", "chill"];

/** A transferred category is a suggestion, never proof of recognition or consent. */
export function parseTransferredAppliance(search: string): ApplimonId | null {
  if (typeof search !== "string" || search.length > 1024) return null;
  const values = new URLSearchParams(search).getAll("appliance");
  return values.length === 1 && APPLIMON_IDS.includes(values[0] as ApplimonId) ? values[0] as ApplimonId : null;
}

export function applianceTransferPath(id: ApplimonId): string {
  if (!APPLIMON_IDS.includes(id)) throw new RangeError("Unsupported appliance category.");
  return `/demo/scan?appliance=${id}`;
}

/** Pure confirmed recruitment; preserves scenario inputs and prevents duplicate models. */
export function recruitDemoAppliance(value: unknown, id: unknown): { status: "added" | "already-present"; profile: DemoProfile } {
  const profile = validateDemoProfile(value);
  if (!profile || !IDS.includes(id as ApplianceId)) throw new RangeError("A valid household and supported appliance are required.");
  if (profile.applianceIds.includes(id as ApplianceId)) return { status: "already-present", profile };
  return { status: "added", profile: { ...profile, applianceIds: IDS.filter(candidate => candidate === id || profile.applianceIds.includes(candidate)) } };
}

/** Upsert only a reviewed specification; preserve all other household settings. */
export function recruitConfiguredApplimon(value: unknown, rawDevice: unknown): {status:"added"|"updated"|"already-present";profile:DemoProfile;device:ApplimonDevice} {
  const profile=validateDemoProfile(value),device=validateApplimonDevice(rawDevice);
  if(!profile||!device)throw new RangeError("A valid household and confirmed appliance specification are required.");
  const existing=profile.applimons??[];
  const previous=existing.find(item=>item.id===device.id);
  const legacy=getApplimon(device.id).legacyId;
  const already=!!previous&&JSON.stringify(previous)===JSON.stringify(device)&&(!legacy||profile.applianceIds.includes(legacy));
  if(already)return {status:"already-present",profile,device};
  const inventory=[...existing.filter(item=>item.id!==device.id),device];
  return {status:previous?"updated":"added",device,profile:{...profile,applianceIds:legacy?IDS.filter(id=>id===legacy||profile.applianceIds.includes(id)):profile.applianceIds,applimons:APPLIMON_IDS.flatMap(id=>inventory.filter(item=>item.id===id))}};
}
