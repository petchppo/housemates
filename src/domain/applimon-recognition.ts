import { interpretCandidateMatches, type CandidateSuggestion } from "./appliance-recognition";
import type { ApplimonId } from "./applimon-catalog";
import { validateApplianceImageEvidence } from "./appliance-image-evidence";
import { normalizeSigmoidMatches } from "./sigmoid-recognition";

export const APPLIMON_MODEL = "Xenova/siglip-base-patch16-224";
export const APPLIMON_MODEL_REVISION = "4649052661e53c7000355844105f8a1792088239";
export const APPLIMON_HYPOTHESIS_TEMPLATE = "This is a photo of {}.";
/** Pinned q8 ONNX bytes; tokenizer and browser runtime are additional downloads. */
export const APPLIMON_MODEL_BYTES = 210_977_441;

export const APPLIMON_RECOGNITION_CANDIDATES:readonly {label:string;applianceId:ApplimonId|null;vehiclePhoto?:boolean}[]=[
  {label:"an electric car or an electric vehicle charging station",applianceId:"evie"},
  {label:"a kitchen dishwasher appliance for washing dishes",applianceId:"bubbles"},
  {label:"an air conditioning unit for cooling a room",applianceId:"chill"},
  {label:"a clothes washing machine for washing laundry",applianceId:"spin"},
  {label:"a clothes tumble dryer for drying laundry",applianceId:"tumble"},
  {label:"an electric water heater tank for domestic hot water",applianceId:"ember"},
  {label:"a household dehumidifier appliance with a water collection tank",applianceId:"misty"},
  {label:"a round robot vacuum cleaner for cleaning floors",applianceId:"rover"},
  {label:"a refrigerator or fridge with shelves for storing food and drinks",applianceId:"frost"},
  {label:"an electric desk fan or standing fan with spinning blades",applianceId:"breeze"},
  {label:"a cooking oven or microwave",applianceId:null},
  {label:"a small countertop kitchen appliance",applianceId:null},
  {label:"a portable space heater",applianceId:null},
  {label:"a room interior or piece of furniture",applianceId:null},
  {label:"a person",applianceId:null},
  {label:"a pet or animal",applianceId:null},
  // Frozen model-comparison wording retained for reproducibility. Both vehicle aliases
  // lead only to conditional setup: neither score establishes the actual powertrain.
  {label:"a gasoline car, motorcycle or other non-electric vehicle",applianceId:"evie",vehiclePhoto:true},
  {label:"a landscape or outdoor scene",applianceId:null},
  {label:"a document, drawing, or electronic screen",applianceId:null},
];

export type ApplimonSuggestion=CandidateSuggestion<ApplimonId> & {
  reviewRequired: true;
  requiresEvConfirmation: boolean;
  reviewNotes: string[];
  alternatives: ApplimonId[];
  recoveryReason: "none" | "unsupported" | "uncertain" | "low-detail";
};
export function interpretApplimonMatches(raw:unknown):ApplimonSuggestion {
  let result = interpretCandidateMatches(raw,APPLIMON_RECOGNITION_CANDIDATES);
  const primary = APPLIMON_RECOGNITION_CANDIDATES.find(candidate => candidate.label === result.matches[0]?.label);
  const primaryId = primary?.applianceId;
  const family: ApplimonId[] | null = primary?.vehiclePhoto ? ["evie"] : primaryId === "spin" || primaryId === "tumble" ? ["spin", "tumble"] :
    primaryId === "ember" || primaryId === "misty" ? ["ember", "misty"] : null;
  if (family) result = { ...result, status: "uncertain", applianceId: null,
    reason: family[0] === "evie" ? "Vehicle found. Is this an EV or plug-in hybrid you charge? Choose Evie only if it is. No electric powertrain was identified." : family[0] === "spin" ? "Washers and dryers can look alike. Choose which appliance this actually is before reviewing its cycle energy. Neither category is confirmed yet." :
      "Water heaters, dehumidifiers and some unsupported appliances can look alike. Choose only a category that actually matches your appliance; otherwise use manual selection. No heating or humidity role was verified." };
  const alternatives = result.matches.flatMap(match => {
    const id = APPLIMON_RECOGNITION_CANDIDATES.find(candidate => candidate.label === match.label)?.applianceId;
    return id && match.score >= .1 ? [id] : [];
  });
  const requiresEvConfirmation = primaryId === "evie";
  return { ...result, reviewRequired: true, requiresEvConfirmation, alternatives: result.status === "uncertain" ? family ?? [...new Set(alternatives)] : [],
    recoveryReason: result.status === "suggested" ? "none" : result.status,
    reviewNotes: requiresEvConfirmation ? ["Confirm that this is an EV or plug-in hybrid charging setup. A photo cannot verify the powertrain, charger limit, battery capacity or energy needed."] : [],
    ...(requiresEvConfirmation && !primary?.vehiclePhoto ? { reason: "A vehicle or charging setup may be visible. Continue only if you confirm an EV or plug-in hybrid charging setup, then review actual charging power and required energy. Visual scores do not verify fuel type, specifications or connectivity." } : {}) };
}

/** Separate content comparison: CLIP can strongly match appliance words on a blank page. */
export const APPLIMON_PHOTO_CANDIDATES: readonly {label: string; applianceId: "appliance-photo" | null}[] = [
  {label: "a photograph or realistic product image of a household appliance", applianceId: "appliance-photo"},
  {label: "a page with only printed words or text", applianceId: null},
  {label: "a cartoon or drawing of an appliance", applianceId: null},
  {label: "a screenshot of a website or application", applianceId: null},
  {label: "a blank empty image", applianceId: null},
  {label: "a photograph of an animal, person or outdoor scene", applianceId: null},
];

/** Category suggestions require review; image style is advisory, never an authenticity veto. */
export function interpretApplimonPhoto(categoryMatches: unknown, photoMatches: unknown, imageEvidence: unknown): ApplimonSuggestion {
  const category = interpretApplimonMatches(categoryMatches);
  const content = interpretCandidateMatches(photoMatches, APPLIMON_PHOTO_CANDIDATES);
  const evidence = validateApplianceImageEvidence(imageEvidence);
  if (!evidence) throw new Error("The recognizer returned invalid image pixel evidence.");
  // Frozen prototype quality limits: no per-category, color, brand or fixture-specific exceptions.
  const nearlyUniform = evidence.dominantColorFraction >= .995 && evidence.colorEntropyBits <= .08;
  const veryLowDetail = evidence.dominantColorFraction >= .94 && evidence.colorEntropyBits <= .75;
  const textScore = content.matches.find(match => match.label === "a page with only printed words or text")?.score ?? 0;
  const flatTextEvidence = textScore >= .35 && evidence.dominantColorFraction >= .85 && evidence.colorEntropyBits <= 1.25;
  if (nearlyUniform || veryLowDetail || flatTextEvidence) return {
    ...category,
    status: nearlyUniform ? "unsupported" : "uncertain",
    applianceId: null,
    requiresEvConfirmation: false,
    alternatives: [],
    recoveryReason: "low-detail",
    reason: flatTextEvidence ? "This looks like a low-detail text image. Use an appliance photo for category matching, or read its label separately when reviewing specifications. You can always choose manually." : "This image contains very little visual detail or is nearly uniform. Move closer to the appliance or choose its category manually. No identity was verified.",
    reviewNotes: ["Low-detail image evidence cannot establish an appliance category. This is not a fake-image or authenticity detector."],
  };
  return { ...category, reviewNotes: [...category.reviewNotes,
    ...(content.status !== "suggested" ? ["Product styling, drawings or scene backgrounds can confuse the image-style check. Inspect the suggested category and confirm it yourself; image style does not prove authenticity."] : [])] };
}

/** Catalog-only SigLIP entry point. Historical CLIP scores must use interpretApplimonPhoto.
 * Relative odds and the raw floor are uncalibrated review heuristics, never certainty.
 */
export function interpretSiglipApplimonPhoto(categoryMatches: unknown, photoMatches: unknown, imageEvidence: unknown): ApplimonSuggestion {
  const category = normalizeSigmoidMatches(categoryMatches, APPLIMON_RECOGNITION_CANDIDATES.map(row => row.label));
  const content = normalizeSigmoidMatches(photoMatches, APPLIMON_PHOTO_CANDIDATES.map(row => row.label));
  const result = interpretApplimonPhoto(category.matches, content.matches, imageEvidence);
  if (result.recoveryReason === "low-detail" || result.recoveryReason === "unsupported") return result;
  const subjectContradiction = content.meetsRawMatchFloor &&
    content.matches[0].label === "a photograph of an animal, person or outdoor scene" &&
    content.matches[0].score >= .4 && content.matches[0].score - content.matches[1].score >= .15;
  if (subjectContradiction) {
    const alternatives = result.applianceId ? [result.applianceId] : result.alternatives;
    return { ...result, status: "uncertain", applianceId: null, recoveryReason: "uncertain", alternatives,
      reason: "The main subject may be an animal, person or outdoor scene. If an appliance is visible, choose its actual category yourself; no appliance was confirmed.",
      reviewNotes: [...result.reviewNotes, "Scene and category comparisons disagree. A caption, background or illustration can mislead the model; manual subject review is required."] };
  }
  if (!category.meetsRawMatchFloor) return {
    ...result, status: "uncertain", applianceId: null, recoveryReason: "uncertain",
    alternatives: result.applianceId ? [result.applianceId] : result.alternatives,
    reason: result.requiresEvConfirmation ? result.reason : "The raw visual match is weak even though one category ranks highest. Choose the actual appliance yourself or try a clearer photo.",
    reviewNotes: [...result.reviewNotes, "Low raw match strength: relative category weights are not a calibrated probability of identity."],
  };
  return result;
}
