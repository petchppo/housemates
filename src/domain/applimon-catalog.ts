import type { ApplianceId } from "./appliances";

export const APPLIMON_IDS = ["evie", "bubbles", "chill", "spin", "tumble", "ember", "misty", "rover", "frost", "breeze"] as const;
export type ApplimonId = typeof APPLIMON_IDS[number];
export type ApplimonDevice = {
  id: ApplimonId;
  ratedPowerW: number;
  energyKwh: number;
  durationHours: number;
  earliestStartHour: number;
  latestStartHour: number;
  deadlineHour: number;
  baselineStartHour: number;
  specSource: "manual" | "ocr-reviewed" | "demo-defaults";
  energyBasis: "cycle-energy" | "rated-power-estimate";
  confirmed: true;
};
export type ApplimonCatalogEntry = {
  id: ApplimonId;
  name: string;
  category: string;
  role: string;
  color: string;
  accent: string;
  shape: "car" | "dishwasher" | "ac" | "washer" | "dryer" | "tank" | "dehumidifier" | "vacuum" | "fridge" | "fan";
  legacyId?: ApplianceId;
  schedulingPolicy: "flexible" | "fixed" | "protected";
  jobKind: "charge" | "cycle" | "fixed" | "protected";
  guidance: string;
  defaults: Omit<ApplimonDevice, "id" | "specSource" | "energyBasis" | "confirmed">;
};

/** Authored example settings, not model specifications or photo-derived measurements. */
export const APPLIMON_CATALOG: readonly ApplimonCatalogEntry[] = [
  { id:"evie", name:"Evie", category:"EV charging setup", role:"The early bird", color:"#bacb7c", accent:"#6c8151", shape:"car", legacyId:"evie", schedulingPolicy:"flexible", jobKind:"charge", guidance:"A vehicle photo does not verify fuel type or charger power. Confirm an EV or plug-in hybrid, then enter the charger limit and energy needed. Schedule only while connected.", defaults:{ratedPowerW:7000,energyKwh:12,durationHours:12/7,earliestStartHour:18,latestStartHour:29,deadlineHour:31,baselineStartHour:18} },
  { id:"bubbles", name:"Bubbles", category:"Dishwasher", role:"The cleanup crew", color:"#d9b692", accent:"#9b7657", shape:"dishwasher", legacyId:"bubbles", schedulingPolicy:"flexible", jobKind:"cycle", guidance:"Use energy per selected wash cycle. A continuous cycle must finish before your deadline.", defaults:{ratedPowerW:1800,energyKwh:1.2,durationHours:2,earliestStartHour:20,latestStartHour:29,deadlineHour:31,baselineStartHour:20} },
  { id:"chill", name:"Chill", category:"Air conditioner", role:"The comfort guard", color:"#bad2db", accent:"#63899a", shape:"ac", legacyId:"chill", schedulingPolicy:"protected", jobKind:"protected", guidance:"Comfort-protected. We can estimate your entered usage, but never shift cooling or claim a comfort-safe temperature.", defaults:{ratedPowerW:1500,energyKwh:3,durationHours:6,earliestStartHour:17,latestStartHour:17,deadlineHour:23,baselineStartHour:17} },
  { id:"spin", name:"Spin", category:"Washing machine", role:"The fresh start", color:"#c6b7dc", accent:"#8e76ab", shape:"washer", schedulingPolicy:"flexible", jobKind:"cycle", guidance:"Match the wash program and load. Choose hours when someone can supervise as required by the appliance instructions.", defaults:{ratedPowerW:2000,energyKwh:.7,durationHours:1.25,earliestStartHour:8,latestStartHour:20,deadlineHour:22,baselineStartHour:18} },
  { id:"tumble", name:"Tumble", category:"Clothes dryer", role:"The warm finish", color:"#e5b69d", accent:"#ac795e", shape:"dryer", schedulingPolicy:"flexible", jobKind:"cycle", guidance:"Enter the selected drying cycle and a supervised operating window. Washer-to-dryer dependencies are not inferred.", defaults:{ratedPowerW:2500,energyKwh:2.5,durationHours:1.5,earliestStartHour:9,latestStartHour:20,deadlineHour:22,baselineStartHour:19} },
  { id:"ember", name:"Ember", category:"Water heater", role:"The warm welcome", color:"#e6c597", accent:"#b18a55", shape:"tank", schedulingPolicy:"protected", jobKind:"protected", guidance:"Hot-water hygiene and temperature need a dedicated model. Display the entered daily consumption without changing thermostat or heater schedules.", defaults:{ratedPowerW:4500,energyKwh:4,durationHours:24,earliestStartHour:0,latestStartHour:0,deadlineHour:24,baselineStartHour:0} },
  { id:"misty", name:"Misty", category:"Dehumidifier", role:"The dry wit", color:"#a9ccc4", accent:"#64958b", shape:"dehumidifier", schedulingPolicy:"flexible", jobKind:"cycle", guidance:"Only shift an optional timed run. This is not humidity control and must not displace essential moisture protection.", defaults:{ratedPowerW:350,energyKwh:.7,durationHours:2,earliestStartHour:9,latestStartHour:19,deadlineHour:21,baselineStartHour:18} },
  { id:"rover", name:"Rover", category:"Robot vacuum", role:"The floor explorer", color:"#d3c2a6", accent:"#9d8768", shape:"vacuum", schedulingPolicy:"flexible", jobKind:"cycle", guidance:"Choose a safe, clear-floor window. Energy represents the entire requested run including your chosen charging allowance.", defaults:{ratedPowerW:60,energyKwh:.06,durationHours:2,earliestStartHour:9,latestStartHour:17,deadlineHour:19,baselineStartHour:17} },
  { id:"frost", name:"Frost", category:"Refrigerator", role:"The pantry guardian", color:"#cad8b7", accent:"#839b6a", shape:"fridge", schedulingPolicy:"protected", jobKind:"protected", guidance:"Food storage stays powered. Enter average daily energy; we never delay or interrupt refrigerator operation.", defaults:{ratedPowerW:180,energyKwh:1.2,durationHours:24,earliestStartHour:0,latestStartHour:0,deadlineHour:24,baselineStartHour:0} },
  { id:"breeze", name:"Breeze", category:"Fan", role:"The easy breeze", color:"#b4cce2", accent:"#698aa8", shape:"fan", schedulingPolicy:"fixed", jobKind:"fixed", guidance:"A fan is useful while someone wants airflow. Its entered usage stays at the original time, with no automatic comfort tradeoff.", defaults:{ratedPowerW:45,energyKwh:.18,durationHours:4,earliestStartHour:18,latestStartHour:18,deadlineHour:22,baselineStartHour:18} },
];

export function getApplimon(id: ApplimonId): ApplimonCatalogEntry {
  const found=APPLIMON_CATALOG.find(entry=>entry.id===id);
  if(!found) throw new RangeError("Unknown Applimon category.");
  return found;
}

export function createDemoApplimon(id: ApplimonId): ApplimonDevice {
  return { id,...getApplimon(id).defaults,specSource:"demo-defaults",energyBasis:"cycle-energy",confirmed:true };
}

export function validateApplimonDevice(raw: unknown): ApplimonDevice | null {
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const value=raw as Record<string,unknown>;
  if(!APPLIMON_IDS.includes(value.id as ApplimonId)||value.confirmed!==true||
     !["manual","ocr-reviewed","demo-defaults"].includes(value.specSource as string)||
     !["cycle-energy","rated-power-estimate"].includes(value.energyBasis as string))return null;
  const fields=["ratedPowerW","energyKwh","durationHours","earliestStartHour","latestStartHour","deadlineHour","baselineStartHour"] as const;
  if(!fields.every(key=>typeof value[key]==="number"&&Number.isFinite(value[key])))return null;
  const power=value.ratedPowerW as number,energy=value.energyKwh as number,duration=value.durationHours as number;
  const earliest=value.earliestStartHour as number, latest=value.latestStartHour as number, deadline=value.deadlineHour as number, baseline=value.baselineStartHour as number;
  if(power<1||power>30000||energy<.001||energy>200||duration<.05||duration>48||
    [earliest,latest,deadline,baseline].some(hour=>!Number.isInteger(hour)||hour<0||hour>48)||latest<earliest||
    energy>power/1000*duration+1e-8)return null;
  const entry=getApplimon(value.id as ApplimonId);
  if(entry.jobKind==="charge"&&Math.abs(duration-energy/(power/1000))>1e-6)return null;
  if(value.energyBasis==="rated-power-estimate"&&Math.abs(energy-power/1000*duration)>1e-6)return null;
  return {id:value.id as ApplimonId,ratedPowerW:power,energyKwh:energy,durationHours:duration,earliestStartHour:earliest,latestStartHour:latest,deadlineHour:deadline,baselineStartHour:baseline,specSource:value.specSource as ApplimonDevice["specSource"],energyBasis:value.energyBasis as ApplimonDevice["energyBasis"],confirmed:true};
}

/** One reviewed device per category for this prototype; unknown fields/photos are dropped. */
export function validateApplimonInventory(raw: unknown): ApplimonDevice[] | null {
  if(!Array.isArray(raw)||raw.length>APPLIMON_IDS.length)return null;
  const devices=Array.from(raw).map(validateApplimonDevice);
  if(devices.some(device=>!device)||new Set(devices.map(device=>device?.id)).size!==devices.length)return null;
  return devices as ApplimonDevice[];
}
