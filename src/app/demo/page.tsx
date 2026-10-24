import type { Metadata } from "next";
import { DemoOnboarding } from "@/components/demo-onboarding";

export const metadata: Metadata = {
  title: "Build your little world — Housemates",
  description: "Choose a region, build your home and recruit an appliance team in a guided, simulated energy demo.",
};

export default function DemoPage() { return <DemoOnboarding />; }
