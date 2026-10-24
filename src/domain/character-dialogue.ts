import { APPLIMON_IDS, type ApplimonId } from "./applimon-catalog";

export type CharacterDialogueTurn = { role: "user" | "assistant"; text: string };
export type CharacterDialogueRequest = {
  character: ApplimonId;
  text: string;
  plannerReply: string;
  history: CharacterDialogueTurn[];
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

/** No extra context fields: callers must not attach profiles, photos, audio, keys or saved memory. */
export function parseCharacterDialogueRequest(raw: unknown): CharacterDialogueRequest | null {
  if (!record(raw) || Object.keys(raw).sort().join(",") !== "character,history,plannerReply,text" ||
      !APPLIMON_IDS.includes(raw.character as ApplimonId) || !boundedText(raw.text, 1200) ||
      !boundedText(raw.plannerReply, 6000) || !Array.isArray(raw.history) || raw.history.length > 6) return null;
  const history: CharacterDialogueTurn[] = [];
  for (const item of raw.history) {
    if (!record(item) || Object.keys(item).sort().join(",") !== "role,text" ||
        (item.role !== "user" && item.role !== "assistant") || !boundedText(item.text, 600)) return null;
    history.push({ role: item.role, text: item.text });
  }
  return { character: raw.character as ApplimonId, text: raw.text, plannerReply: raw.plannerReply, history };
}

const quantities = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|half|quarter|dozen|couple|few|several|twice|double|triple|percent|percentage|noon|midnight|o'clock|am|pm)\b/i;
const completedActions = /\b(?:started|stopped|activated|deactivated|approved|executed|completed|connected|disconnected|controlled|scheduled|finished|unlocked|turned|switched|changed|saved|ran|charged|washed|dried|cooled|heated|begun|began|confirmed)\b/i;
const actuation = /\b(?:start(?:s|ing)?|stop(?:s|ping)?|run(?:s|ning)?|charg(?:e|es|ing)|wash(?:es|ing)?|dr(?:y|ies|ying)|cool(?:s|ing)?|heat(?:s|ing)?|approv(?:e|es|ing)|execut(?:e|es|ing)|activat(?:e|es|ing)|deactivat(?:e|es|ing)|control(?:s|ling)?|schedul(?:e|es|ing)|switch(?:es|ing)?|turn(?:s|ing)?|set(?:s|ting)?|chang(?:e|es|ing)|finish(?:es|ing)?|complet(?:e|es|ing)|connect(?:s|ing)?|disconnect(?:s|ing)?|unlock(?:s|ing)?)\b/i;

export type CharacterReplyRejectionReason = "format" | "quantity" | "sentence-count" | "privacy-or-certainty" | "action-claim" | "device-state";
export type CharacterReplyAssessment = { reply: string; reason: null } | { reply: null; reason: CharacterReplyRejectionReason };

/** Remove only the directly negated verb, never a whole sentence or quoted span. This lets
 * ordinary refusals pass while later affirmative claims still face the same checks. */
function withoutDirectDenials(text: string): string {
  const past = "(?:started|stopped|activated|deactivated|approved|executed|completed|connected|disconnected|controlled|scheduled|finished|unlocked|turned|switched|changed|saved|ran|charged|washed|dried|cooled|heated|begun|began|confirmed)";
  const action = "(?:start|stop|run|charge|wash|dry|cool|heat|approve|execute|activate|deactivate|control|schedule|switch|turn|set|change|finish|complete|connect|disconnect|unlock|unplug|disable|shut|power)";
  return text
    .replace(new RegExp("\\b(?:cannot|can't|won't|will not|do not|don't|must not|mustn't|should not|shouldn't|unable to|never)\\s+" + action + "\\b", "gi"), "decline")
    .replace(new RegExp("\\b(?:have not|haven't|has not|hasn't|had not|hadn't)\\s+(?:been\\s+)?" + past + "\\b", "gi"), "declined")
    .replace(new RegExp("\\b(?:is not|isn't|are not|aren't|was not|wasn't|were not|weren't|not yet|never been)\\s+" + past + "\\b", "gi"), "unconfirmed");
}

/** Conservative runtime guard, not a semantic proof. Rejected prose is replaced by the caller's
 * deterministic planner fallback; model text never becomes a planner command or authority.
 * Reasons are application-owned labels safe to log; rejected text is never retained here. */
export function assessCharacterReply(raw: unknown): CharacterReplyAssessment {
  const reject = (reason: CharacterReplyRejectionReason): CharacterReplyAssessment => ({ reply: null, reason });
  if (!boundedText(raw, 600)) return reject("format");
  const text = raw.trim().normalize("NFKC");
  if (!boundedText(text, 600) || !/\p{L}/u.test(text) || /[<>`{}\[\]\\]/u.test(text) ||
      /https?:|www\.|data:|\bsk-[a-z0-9_-]+/i.test(text)) return reject("format");
  if (/\p{N}|[$€£¥₹₩₽¢%]/u.test(text)) return reject("quantity");
  const comparable = text.replace(/[’‘]/g, "'");
  // Ordinary first-person prose and an explicit review-order transition are not measurements.
  const quantityText = comparable.replace(/\bI am\b/gi, "I feel")
    .replace(/(^|[.!?]\s*)First,\s+(?=(?:please\s+)?(?:review|check|read|consider|compare|look)\b)/gi, "$1");
  if (quantities.test(quantityText)) return reject("quantity");
  const sentences = comparable.split(/[.!?]+|\n+/).filter(part => part.trim());
  if (!sentences.length || sentences.length > 3) return reject("sentence-count");
  if (/\b(?:guarantee[ds]?|telemetry|verified|measured|password|credential|credentials|secret|token|photo|audio|recording)\b|\b(?:actual|real) savings\b|\bapi[- ]?key\b/i.test(comparable)) return reject("privacy-or-certainty");
  // Do not interpret rhetorical/double negation as a simple refusal.
  if (/\b(?:not\s+(?:unable|unwilling|true|false|never)|cannot deny|can't deny|(?:false|untrue|incorrect|wrong)\s+(?:that|to say))\b/i.test(comparable)) return reject("action-claim");
  const claims = withoutDirectDenials(comparable);
  if (completedActions.test(claims)) return reject("action-claim");
  if (/\b(?:unplug|disable|disconnect|deactivate)\b|\b(?:shut|switch|turn|power)\s+(?:it\s+|the\s+\w+\s+)?(?:off|down|on|up)\b/i.test(claims)) return reject("action-claim");
  if (/\b(?:battery|charge|vehicle|charger)\b.{0,60}\b(?:full|empty|ready|complete|reached|charged)\b/i.test(claims) ||
      /\b(?:room|home|water|food|fridge|refrigerator|dishes|laundry|floor)\b.{0,40}\b(?:is|are|has|have|stays|remain|reached)\b.{0,40}\b(?:cool|warm|hot|cold|safe|dry|clean|full|empty|ready)\b/i.test(claims)) return reject("device-state");
  if (/\b(?:is|are|am|now|already|currently|i'm|we're|it's)\s+(?:now\s+|already\s+|currently\s+)?(?:starting|stopping|running|charging|washing|drying|cooling|heating|on|off)\b/i.test(claims) || /\b(?:done|all set)\s*(?:[!.—-]|$)|\blocked in\b/i.test(claims)) return reject("device-state");
  for (const clause of claims.split(/[.!?,;]|\n+|\b(?:but|however|although|yet|and|because|while|then)\b/i)) {
    const personalVoice = /\b(?:i|we)(?:'d|\s+would)?\s+(?:love|like|enjoy|prefer)\b/i.test(clause);
    const planningHelp = /\bhelp\b.{0,45}\b(?:plan|think|consider|compare|understand|review|explore|discuss|decide)\b/i.test(clause);
    const singleSpeaker = (clause.match(/\b(?:i|we)(?:\b|')/gi) ?? []).length === 1;
    // A possessive system noun is not an assertion that the speaker is operating it.
    const actionClause = clause.replace(/\b(?:your|the)\s+(?:cooling|heating|charging)\b/gi, "system");
    if (/\b(?:i|we)(?:\b|')/i.test(clause) && actuation.test(actionClause) &&
        !((personalVoice || planningHelp) && singleSpeaker)) return reject("action-claim");
  }
  return { reply: text, reason: null };
}

export function parseCharacterReply(raw: unknown, onReject?: (reason: CharacterReplyRejectionReason) => void): string | null {
  const assessment = assessCharacterReply(raw);
  if (assessment.reason !== null) onReject?.(assessment.reason);
  return assessment.reply;
}
