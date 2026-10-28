import { handleBlueBubblesPreflight } from "@/server/bluebubbles-preflight";
import { connection } from "next/server";

const publicDemo = (env: NodeJS.ProcessEnv) => env.VERCEL === "1" || env.HOUSEMATES_PUBLIC_DEMO === "1";
function betaResponse(status: number) {
  return Response.json({ configured: false, status: "beta", message: "iMessage is a beta preview on this public demo. Phone pairing is available only in a privately configured local installation.",
    ...(status === 503 ? { error: "imessage-beta-unavailable" } : {}) },
  { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function GET(request: Request) {
  // Configuration must reflect the running server, not a build-time prerender.
  await connection();
  const env = process.env;
  if (publicDemo(env)) return betaResponse(200);
  return handleBlueBubblesPreflight(request, env);
}

export function POST(request: Request) {
  const env = process.env;
  if (publicDemo(env)) return betaResponse(503);
  return handleBlueBubblesPreflight(request, env);
}
