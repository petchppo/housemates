import type { ApplianceId } from "@/domain/appliances";
import { PixelAppliance } from "./pixel-appliance";

export function ApplianceIcon({ id, className = "" }: { id: ApplianceId; className?: string }) {
  return <PixelAppliance id={id} className={className}/>;
}
