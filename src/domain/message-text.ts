import type { ApplianceId } from "./appliances";
import { APPLIMON_CATALOG } from "./applimon-catalog";

type RoutedMessage = { kind: "message"; applianceId: ApplianceId; text: string } | { kind: "ignore"; reason: "unsupported-address" | "empty-address" };
const catalogueNames = APPLIMON_CATALOG.map(item => item.name).join("|");
const addressed = new RegExp(`^(${catalogueNames})\\s*[:,]\\s*([\\s\\S]*)$`, "i");
const greeted = new RegExp(`^(hey|hi|hello)\\s+(${catalogueNames})(?:\\s*[:,]\\s*|\\s+|(?=[.!?]+$)|$)([\\s\\S]*)$`, "i");
const isCore = (id: string): id is ApplianceId => id === "evie" || id === "bubbles" || id === "chill";

/** Routing only: an explicit address can select a character, never a command or approval.
 * Ordinary prose (including colons and mentions elsewhere) stays exactly as supplied. */
export function routeMessageText(text: string, activeAppliance: ApplianceId): RoutedMessage {
  const clean = text.trim();
  const direct = addressed.exec(clean), greeting = direct ? null : greeted.exec(clean);
  if (!direct && !greeting) return { kind: "message", applianceId: activeAppliance, text };
  const name = (direct?.[1] ?? greeting![2]).toLowerCase();
  const id = APPLIMON_CATALOG.find(item => item.name.toLowerCase() === name)!.id;
  if (!isCore(id)) return { kind: "ignore", reason: "unsupported-address" };
  // A greeting alone is still a conversational message; a bare routing prefix is not.
  const remainder = (direct?.[2] ?? greeting![3]).trim();
  const body = greeting && /^[.!?]+$/.test(remainder) ? `${greeting[1]}${remainder}` : remainder || (greeting ? greeting[1] : "");
  return body ? { kind: "message", applianceId: id, text: body } : { kind: "ignore", reason: "empty-address" };
}

const speaker = (id: ApplianceId, source: "openai" | "local") => {
  const name = APPLIMON_CATALOG.find(item => item.id === id)!.name;
  return source === "local" ? `${name} · local reply (simulation)` : name;
};

/** Preserve the exact authored/model body. Delivery labels never imply a plan was approved. */
export function formatPhoneReply(id: ApplianceId, source: "openai" | "local", text: string): string {
  return `${text}\n\n— ${speaker(id, source)}`;
}
export function formatWebsiteTurn(id: ApplianceId, source: "openai" | "local", userText: string, text: string): string {
  return `You (website): ${userText}\n\n${speaker(id, source)}: ${text}`;
}
