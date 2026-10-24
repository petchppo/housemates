import type { Metadata } from "next";
import { DemoOnboarding } from "@/components/demo-onboarding";

export const metadata: Metadata = {title:"Your home — Housemates",description:"Explore your completed simulated household, daily grid pattern and appliance energy use."};
export default function DemoHomePage(){return <DemoOnboarding startAtHome/>;}
