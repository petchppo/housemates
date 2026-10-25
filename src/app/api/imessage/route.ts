import { connection } from "next/server";
import { handleBridgeRequest, IMessageBridge, readBridgeConfig } from "@/server/imessage-bridge";
import { FilePairingStore } from "@/server/imessage-pairing-store";

// One Node process only. Binding metadata survives restart; conversation queues never persist.
const bridge = new IMessageBridge(Date.now, undefined, new FilePairingStore());
export async function GET(request: Request) { await connection(); return handleBridgeRequest(request, bridge, readBridgeConfig(process.env)); }
export function POST(request: Request) { return handleBridgeRequest(request, bridge, readBridgeConfig(process.env)); }
