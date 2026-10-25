import type { ApplianceId } from "./appliances";

const replies = {
  evie: {
    greeting: "Hey! Evie here, with plenty of road-trip enthusiasm. What’s on your mind?",
    laughter: "Hehe, road-trip energy! Glad we’re having fun.",
    thanks: "You’re welcome! Happy to be your planning buddy.",
  },
  bubbles: {
    greeting: "Hey there! Bubbles here, bringing a little sparkle to the conversation.",
    laughter: "Hehe, a little bubbly banter never hurts!",
    thanks: "You’re welcome! Always happy to chat, dish duty or otherwise.",
  },
  chill: {
    greeting: "Hello! Chill here. What’s on your mind?",
    laughter: "Heh, I appreciate a relaxed sense of humor.",
    thanks: "You’re welcome. Glad to keep the conversation easygoing.",
  },
} satisfies Record<ApplianceId, Record<"greeting" | "laughter" | "thanks", string>>;

/** Authored local small talk, never an intent parser or evidence of a device action.
 * Only a complete allowlisted phrase plus ordinary trailing punctuation qualifies.
 * Any additional words, quantities, commands or character prefixes stay with the planner. */
export function casualFallback(character: ApplianceId, text: string): string | null {
  if ((character !== "evie" && character !== "bubbles" && character !== "chill") || typeof text !== "string" || text.length > 64) return null;
  const match = /^(lol|lmao|haha|hi|hello|hey|thanks|thank[ \t]+you)[ \t]*[.!?,…]*$/i.exec(text.trim());
  if (!match) return null;
  const phrase = match[1].toLowerCase();
  const kind = phrase === "lol" || phrase === "lmao" || phrase === "haha" ? "laughter"
    : phrase === "thanks" || phrase.startsWith("thank") ? "thanks" : "greeting";
  return replies[character][kind];
}
