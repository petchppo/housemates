import { connection } from "next/server";
import { handleCharacterDialogueRequest } from "../../../server/character-dialogue";
import { readDialogueConfig } from "../../../server/dialogue-provider";

export async function GET(request: Request) {
  await connection();
  return handleCharacterDialogueRequest(request, readDialogueConfig(process.env));
}
export function POST(request: Request) {
  return handleCharacterDialogueRequest(request, readDialogueConfig(process.env));
}
