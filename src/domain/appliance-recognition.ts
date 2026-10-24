import type { ApplianceId } from "./appliances";

export const RECOGNITION_MODEL = "Xenova/clip-vit-base-patch32";
export const RECOGNITION_REVISION = "d15189d7028b43f1d3e65039190477f6af591c2a";
/** Verified model_quantized.onnx size; runtime/tokenizer downloads are additional. */
export const RECOGNITION_MODEL_BYTES = 153_695_702;
// Concrete descriptions distinguish overlapping categories (e.g. a dishwasher is
// also a kitchen appliance). These are generic classes, not fixture-specific clues.
export const RECOGNITION_CANDIDATES: readonly { label: string; applianceId: ApplianceId | null }[] = [
  { label: "an electric vehicle charging station with a charging cable", applianceId: "evie" },
  { label: "a kitchen dishwasher appliance for washing dishes", applianceId: "bubbles" },
  { label: "an air conditioning unit for cooling a room", applianceId: "chill" },
  { label: "a clothes washing machine or tumble dryer for laundry", applianceId: null },
  { label: "a refrigerator for keeping food cold", applianceId: null },
  { label: "a cooking oven or microwave", applianceId: null },
  { label: "a small countertop kitchen appliance", applianceId: null },
  { label: "a portable fan or space heater", applianceId: null },
  { label: "a room interior or piece of furniture", applianceId: null },
  { label: "a person", applianceId: null },
  { label: "a pet or animal", applianceId: null },
  { label: "a car or other vehicle", applianceId: null },
  { label: "a landscape or outdoor scene", applianceId: null },
  { label: "a document, drawing, or electronic screen", applianceId: null },
];

export type RecognitionMatch = { label: string; score: number };
export type CandidateSuggestion<Id extends string> = {
  status: "suggested" | "uncertain" | "unsupported";
  applianceId: Id | null;
  matches: RecognitionMatch[];
  reason: string;
};

export type ApplianceSuggestion = CandidateSuggestion<ApplianceId>;

/** Heuristic abstention, not calibrated confidence. Always require user confirmation. */
export function interpretCandidateMatches<Id extends string>(raw: unknown, candidates: readonly {label:string;applianceId:Id|null}[]): CandidateSuggestion<Id> {
  if (!Array.isArray(raw) || raw.length !== candidates.length) {
    throw new Error("The recognizer returned incomplete candidate matches.");
  }
  const known = new Map(candidates.map(candidate => [candidate.label, candidate.applianceId]));
  const seen = new Set<string>();
  const matches: RecognitionMatch[] = raw.map(item => {
    if (!item || typeof item !== "object" || typeof item.label !== "string" ||
      !known.has(item.label) || seen.has(item.label) || typeof item.score !== "number" ||
      !Number.isFinite(item.score) || item.score < 0 || item.score > 1) {
      throw new Error("The recognizer returned invalid candidate matches.");
    }
    seen.add(item.label);
    return { label: item.label, score: item.score };
  }).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  if (Math.abs(matches.reduce((sum, item) => sum + item.score, 0) - 1) > .02) {
    throw new Error("The recognizer returned inconsistent relative scores.");
  }
  const top = matches[0];
  const applianceId = known.get(top.label) ?? null;
  if (!applianceId) return { status: "unsupported", applianceId: null, matches: matches.slice(0, 3), reason: "This photo matches something outside the supported appliance types. Choose manually or try a clearer appliance photo." };
  if (top.score < .4 || top.score - matches[1].score < .15) return { status: "uncertain", applianceId: null, matches: matches.slice(0, 3), reason: "The candidate matches are too close or weak for a suggestion. Choose the appliance yourself or try a clearer photo." };
  return { status: "suggested", applianceId, matches: matches.slice(0, 3), reason: "This is a visual suggestion only. Check the photo and confirm the appliance yourself. No model, wattage, or charging power was identified." };
}


export function interpretApplianceMatches(raw: unknown): ApplianceSuggestion {
  return interpretCandidateMatches(raw, RECOGNITION_CANDIDATES);
}
