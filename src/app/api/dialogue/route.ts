import { handleDialogueRequest, readDialogueConfig } from "../../../server/dialogue-provider";
import { connection } from "next/server";

export async function GET(request: Request) {
  // Read deployment configuration at request time with Cache Components enabled.
  await connection();
  return handleDialogueRequest(request, readDialogueConfig(process.env));
}
export function POST(request: Request) { return handleDialogueRequest(request, readDialogueConfig(process.env)); }
