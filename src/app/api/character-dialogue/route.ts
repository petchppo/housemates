import { connection } from "next/server";
import { handleCharacterDialogueRequest } from "../../../server/character-dialogue";
import { readDialogueConfig } from "../../../server/dialogue-provider";

export async function GET(request: Request) {
  await connection();
  const env = process.env;
  return handleCharacterDialogueRequest(request, readDialogueConfig(env), undefined, undefined, { env });
}
export function POST(request: Request) {
  const env = process.env;
  return handleCharacterDialogueRequest(request, readDialogueConfig(env), undefined, undefined, { env });
}
