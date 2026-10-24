import type { Metadata } from "next";
import { HouseholdApp } from "@/components/household-app";

export const metadata: Metadata = {
  title: "Appliance Parliament — Housemates",
  description: "An interactive miniature household with API-placeholder dialogue, functional energy planning, and local preference memory.",
};
export default function HouseholdPage() { return <HouseholdApp />; }
