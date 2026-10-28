import { handleDialogueRequest, readDialogueConfig } from "../../../server/dialogue-provider";
import { connection } from "next/server";

export async function GET(request: Request) {
  // Read deployment configuration at request time with Cache Components enabled.
  await connection();
  const env = process.env;
  return handleDialogueRequest(request, readDialogueConfig(env), undefined, undefined, { env });
}
export function POST(request: Request) {
  const env = process.env;
  return handleDialogueRequest(request, readDialogueConfig(env), undefined, undefined, { env });
}
