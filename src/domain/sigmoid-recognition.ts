import type { RecognitionMatch } from "./appliance-recognition";

/** Frozen before this adapter's author inspected SigLIP outputs; uncalibrated prototype heuristic. */
export const SIGLIP_RAW_TOP_FLOOR = .01;

/** SigLIP emits independent sigmoid scores. Convert odds to conditional relative weights.
 * Raw strength is retained: normalization alone can amplify an extremely weak match.
 * Exact ones share the saturated mass; exact zeros contribute no mass; all zeros fail closed.
 */
export function normalizeSigmoidMatches(raw: unknown, labels: readonly string[]): {
  matches: RecognitionMatch[];
  rawMatches: RecognitionMatch[];
  rawTopScore: number;
  meetsRawMatchFloor: boolean;
  scoreKind: "relative-odds";
} {
  if (labels.length < 2 || labels.some(label => typeof label !== "string" || !label.trim()) || new Set(labels).size !== labels.length) {
    throw new Error("Candidate labels must be unique non-empty strings.");
  }
  if (!Array.isArray(raw) || raw.length !== labels.length) throw new Error("The recognizer returned incomplete sigmoid matches.");
  const expected = new Set(labels), seen = new Set<string>();
  const rawMatches: RecognitionMatch[] = raw.map(row => {
    if (!row || typeof row !== "object" || typeof row.label !== "string" || !expected.has(row.label) || seen.has(row.label) ||
      typeof row.score !== "number" || !Number.isFinite(row.score) || row.score < 0 || row.score > 1) {
      throw new Error("The recognizer returned invalid sigmoid matches.");
    }
    seen.add(row.label);
    return { label: row.label, score: row.score };
  }).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const rawTopScore = rawMatches[0].score;
  if (rawTopScore === 0) throw new Error("The recognizer returned only zero sigmoid matches.");
  const ones = rawMatches.filter(row => row.score === 1).length;
  let matches: RecognitionMatch[];
  if (ones) matches = rawMatches.map(row => ({ label: row.label, score: row.score === 1 ? 1 / ones : 0 }));
  else {
    const logs = rawMatches.map(row => row.score === 0 ? -Infinity : Math.log(row.score) - Math.log1p(-row.score));
    const weights = logs.map(value => Math.exp(value - logs[0]));
    const total = weights.reduce((sum, value) => sum + value, 0);
    matches = rawMatches.map((row, index) => ({ label: row.label, score: weights[index] / total }));
  }
  return { matches, rawMatches, rawTopScore, meetsRawMatchFloor: rawTopScore >= SIGLIP_RAW_TOP_FLOOR, scoreKind: "relative-odds" };
}
