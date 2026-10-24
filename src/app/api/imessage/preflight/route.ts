import { handleBlueBubblesPreflight } from "@/server/bluebubbles-preflight";
import { connection } from "next/server";

export async function GET(request: Request) {
  // Configuration must reflect the running server, not a build-time prerender.
  await connection();
  return handleBlueBubblesPreflight(request, process.env);
}

export function POST(request: Request) {
  return handleBlueBubblesPreflight(request, process.env);
}
