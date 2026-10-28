import { connection } from "next/server";
import { handleBridgeRequest, IMessageBridge, readBridgeConfig } from "@/server/imessage-bridge";
import { FilePairingStore } from "@/server/imessage-pairing-store";

const betaMessage = "iMessage is a beta preview on this public demo. Phone pairing is available only in a privately configured local installation.";
const publicDemo = (env: NodeJS.ProcessEnv) => env.VERCEL === "1" || env.HOUSEMATES_PUBLIC_DEMO === "1";
function betaResponse(status: number) {
  return Response.json({ available: false, status: "beta", message: betaMessage, ...(status === 503 ? { error: "imessage-beta-unavailable" } : {}) },
    { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

// Local single-process bridge only. Never construct its filesystem store on Vercel.
let bridge: IMessageBridge | undefined;
function localBridge() { return bridge ??= new IMessageBridge(Date.now, undefined, new FilePairingStore()); }
export async function GET(request: Request) {
  await connection();
  const env = process.env;
  if (publicDemo(env)) return betaResponse(200);
  return handleBridgeRequest(request, localBridge(), readBridgeConfig(env));
}
export function POST(request: Request) {
  const env = process.env;
  if (publicDemo(env)) return betaResponse(503);
  return handleBridgeRequest(request, localBridge(), readBridgeConfig(env));
}
