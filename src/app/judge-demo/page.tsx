import { JudgeDemo } from "@/components/judge-demo";
import { connection } from "next/server";
import { Suspense } from "react";

export const metadata = { title: "Housemates · Judge demo" };

async function RuntimeJudgeDemo() {
  await connection();
  return <JudgeDemo publicDemo={process.env.VERCEL === "1" || process.env.HOUSEMATES_PUBLIC_DEMO === "1"} />;
}

export default function JudgeDemoPage() {
  return <Suspense fallback={<main><p role="status">Opening the demo…</p></main>}><RuntimeJudgeDemo /></Suspense>;
}
