import { handleBridgeRequest, IMessageBridge, readBridgeConfig } from "@/server/imessage-bridge";

// One Node process only. Never use this ephemeral demo mailbox as a multi-instance production queue.
const bridge = new IMessageBridge();
export function GET(request: Request) { return handleBridgeRequest(request, bridge, readBridgeConfig(process.env)); }
export function POST(request: Request) { return handleBridgeRequest(request, bridge, readBridgeConfig(process.env)); }
