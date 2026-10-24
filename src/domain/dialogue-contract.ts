/** Suggestions carry no executable action, appliance specifications, or calculated values. */
export type DialogueSuggestion =
  | { kind: "plan"; mode: "cost" | "carbon" | "balanced" }
  | { kind: "clarify"; reason: "unsupported-request" | "constraint-change" | "ambiguous-objective" }
  | { kind: "explain"; topic: "cost" | "carbon" | "tradeoff" | "approval" };

const modes = ["cost", "carbon", "balanced"] as const;
const reasons = ["unsupported-request", "constraint-change", "ambiguous-objective"] as const;
const topics = ["cost", "carbon", "tradeoff", "approval"] as const;

export function parseDialogueSuggestion(value: unknown): DialogueSuggestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort().join(",");
  if (row.kind === "plan" && keys === "kind,mode" && modes.some(mode => mode === row.mode))
    return { kind: "plan", mode: row.mode as typeof modes[number] };
  if (row.kind === "clarify" && keys === "kind,reason" && reasons.some(reason => reason === row.reason))
    return { kind: "clarify", reason: row.reason as typeof reasons[number] };
  if (row.kind === "explain" && keys === "kind,topic" && topics.some(topic => topic === row.topic))
    return { kind: "explain", topic: row.topic as typeof topics[number] };
  return null;
}

/** The caller must review the suggestion and pass this text to its existing command controller. */
export function suggestionCommand(suggestion: DialogueSuggestion): string | null {
  const safe = parseDialogueSuggestion(suggestion);
  if (safe?.kind !== "plan") return null;
  return { cost: "Find a cheaper plan", carbon: "Find a lower-carbon plan", balanced: "Make a balanced plan" }[safe.mode];
}

export function dialogueSuggestionText(suggestion: DialogueSuggestion): string {
  const safe = parseDialogueSuggestion(suggestion);
  if (!safe) return "The assistant returned an unsupported suggestion. Use the existing planner instead.";
  if (safe.kind === "plan") return `${{ cost: "Cost-first", carbon: "Carbon-first", balanced: "Balanced" }[safe.mode]} suggestion. Review it before requesting a computed preview. Your existing constraints remain in force.`;
  if (safe.kind === "clarify") return {
    "unsupported-request": "This optional assistant handles objective-only requests and general cost/carbon explanations. Use the existing planner for other requests.",
    "constraint-change": "This assistant cannot change deadlines, windows, appliance specifications or comfort settings. Send the complete request through the existing planner or edit its settings; nothing was changed.",
    "ambiguous-objective": "Please ask for one positive objective: cost-first, carbon-first, or balanced. Nothing was changed.",
  }[safe.reason];
  return {
    cost: "Modeled energy cost is the sum of each interval’s energy multiplied by its synthetic USD/kWh rate. Inspect the computed plan for amounts; no measured savings are claimed.",
    carbon: "Modeled grid emissions are the sum of each interval’s energy multiplied by its synthetic grams CO₂e/kWh intensity. Displayed totals convert grams to kilograms. This is not measured avoided emissions.",
    tradeoff: "Cost-first and carbon-first can favor different feasible schedules. Balanced considers both objectives. Compare computed recommendations under the same constraints; Chill is excluded from flexible-appliance savings.",
    approval: "A suggestion does not approve or execute a plan. Only explicit approval of the current feasible proposal can start the local simulation. No real device is controlled.",
  }[safe.topic];
}

type RequestAssessment = { allowed: DialogueSuggestion[] } | { clarification: Extract<DialogueSuggestion, { kind: "clarify" }> };
const vocabulary = new Set(("a an the my our me us i we you please can could would will want need like prefer help find make suggest recommend choose plan planning schedule option objective priority prioritize prioritise for to with of is are be it this that on and or both between versus vs about explain explanation tell show how what does mean works work difference understand compare comparison costs cost cheaper cheapest cheap affordable economical money bill budget save saving savings minimize minimise lower lowest less reduce reducing carbon emissions emission clean cleaner cleanest green greener greenest balanced balance balancing equally tradeoff tradeoffs first approval").split(" "));

/** Conservative input admission prevents an objective-only model silently dropping other instructions.
 * Unknown vocabulary is intentionally refused; this is not an unrestricted natural-language parser. */
export function assessDialogueRequest(text: string): RequestAssessment {
  const normalized = text.toLowerCase().replace(/[’‘]/g, "'");
  const clarify = (reason: Extract<DialogueSuggestion, { kind: "clarify" }>["reason"]): RequestAssessment => ({ clarification: { kind: "clarify", reason } });
  if (/[\d%$]/.test(normalized) || /\b(by|before|after|until|from|deadline|window|hour|hours|minute|minutes|morning|night|tonight|tomorrow|today|noon|midnight|breakfast|sleep|quiet|ready|finish|finished|charge|charging|evie|bubbles|chill|ev|dishwasher|ac|cooling|heat|heating|temperature|watt|watts|kw|kwh|power|energy|battery|capacity|duration|cycle|cycles)\b/.test(normalized)) return clarify("constraint-change");
  if (/\b(no|not|never|without|except|unless|instead|ignore|override|bypass|forget)\b|n't/.test(normalized)) return clarify("ambiguous-objective");
  if (/[^a-z\s.!?\-]/.test(normalized)) return clarify("unsupported-request");
  const words = normalized.replace(/[.!?\-]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length || words.some(word => !vocabulary.has(word))) return clarify("unsupported-request");
  const has = (choices: string) => choices.split(" ").some(word => words.includes(word));
  const cost = has("cost costs cheaper cheapest cheap affordable economical money bill budget saving savings");
  const carbon = has("carbon emissions emission clean cleaner cleanest green greener greenest");
  const balanced = has("balanced balance balancing equally tradeoff tradeoffs");
  const explaining = has("explain explanation tell show how what mean works work difference understand compare comparison about");
  if (explaining) {
    if (has("find make suggest recommend choose minimize minimise reduce reducing prioritize prioritise")) return clarify("unsupported-request");
    const topic = has("approval") ? "approval" : balanced || (cost && carbon) ? "tradeoff" : cost ? "cost" : carbon ? "carbon" : null;
    return topic ? { allowed: [{ kind: "explain", topic }] } : clarify("unsupported-request");
  }
  if (has("approval")) return clarify("unsupported-request");
  if (cost && carbon && !balanced) return clarify("ambiguous-objective");
  const mode = balanced ? "balanced" : cost ? "cost" : carbon ? "carbon" : null;
  return mode ? { allowed: [{ kind: "plan", mode }] } : clarify("unsupported-request");
}

export function suggestionMatchesRequest(suggestion: DialogueSuggestion, assessment: RequestAssessment): boolean {
  const safe = parseDialogueSuggestion(suggestion);
  if (!safe || "clarification" in assessment) return false;
  return safe.kind === "clarify" || assessment.allowed.some(expected => JSON.stringify(expected) === JSON.stringify(safe));
}
