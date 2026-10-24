import type { Metadata } from "next";
import { HouseholdApp } from "@/components/household-app";

export const metadata: Metadata = {
  title: "Appliance Parliament — Housemates",
  description: "A simulated household conversation powered by deterministic energy planning and local preference memory.",
};
export default function HouseholdPage() { return <HouseholdApp />; }
