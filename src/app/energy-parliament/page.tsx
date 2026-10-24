import type { Metadata } from "next";
import { EnergyParliament } from "@/components/energy-parliament";

export const metadata: Metadata = {
  title: "Energy Parliament — Housemates",
  description: "Test deterministic household energy plans with simulated appliances and synthetic electricity data.",
};

export default function EnergyParliamentPage() {
  return <EnergyParliament />;
}
