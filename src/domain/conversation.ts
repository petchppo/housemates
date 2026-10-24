import type { ApplianceId } from "./appliances";
import type { ChatRole, HouseholdState } from "./household";
import { planningFingerprint } from "./household";
import { awardTraining } from "./memory";
import { hourlyEnergy } from "../data/energy";
import { optimizeHousehold, type OptimizationMode, type SchedulingRequest } from "./scheduling";

export type ConstraintUpdate = {
  applianceId: "evie" | "bubbles";
  deadlineHour?: number;
  earliestHour?: number;
  latestHour?: number;
};
export type HouseholdIntent =
  | { kind: "plan"; mode?: OptimizationMode; changes: ConstraintUpdate[]; notes: string[] }
  | { kind: "approve" | "reject" | "explain" | "help" | "comfort" | "routine" | "learn" | "self-report" }
  | { kind: "clarify"; message: string };

const help = "Try ‘Find a cheaper plan’, ‘Find a lower-carbon plan’, ‘Make a balanced plan’, ‘Evie charged by 7 AM’, ‘Bubbles between 8 PM and 10 PM’, or ‘Don’t run the dishwasher after 10 PM’. Windows describe allowed starts; cutoffs describe completion. Use AM/PM and optional Day 1/Day 2. You can also inspect calculations, reject, revise, or approve and save a plan. Use settings for energy and cycle changes.";
const timeSource = "(?:(?:day\\s*[12]|today|tomorrow)\\s*(?:at\\s*)?)?(?:\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)|midnight|noon)(?:\\s*,?\\s+(?:on\\s+)?(?:day\\s*[12]|today|tomorrow))?";
const timesIn = (text: string) => text.match(new RegExp(timeSource, "g")) ?? [];
const clarify = (message: string): HouseholdIntent => ({ kind: "clarify", message });

function parseTime(text: string, anchor?: number): number | null {
  const days = new Set((text.match(/\b(?:day\s*[12]|today|tomorrow)\b/g) ?? []).map(day => /day\s*1|today/.test(day) ? 1 : 2));
  if (days.size > 1) return null;
  let clock: number;
  if (/midnight/.test(text)) clock = 0;
  else if (/noon/.test(text)) clock = 12;
  else {
    const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || (match[2] && match[2] !== "00")) return null;
    clock = Number(match[1]) % 12 + (match[3] === "pm" ? 12 : 0);
  }
  if (/day\s*1|today/.test(text)) return clock;
  if (/day\s*2|tomorrow/.test(text)) return clock + 24;
  if (anchor !== undefined) return clock < anchor % 24 ? clock + Math.floor(anchor / 24) * 24 + 24 : clock + Math.floor(anchor / 24) * 24;
  // This evening + next morning is the demo's explicit default day convention.
  return clock < 12 ? clock + 24 : clock;
}

/** A deliberately bounded parser: ambiguous requests are clarified, not guessed. */
export function parseHouseholdIntent(input: string): HouseholdIntent {
  const text = input.toLowerCase().replace(/[’‘]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  if (!text) return clarify("Tell the household what you would like to plan.");
  if (text.length > 1200) return clarify("Please keep each planning request under 1,200 characters so I can check every constraint.");
  if (/\b(chill|air conditioner|air conditioning|ac|cooling|heating)\b/.test(text)) return { kind: "comfort" };
  if (/^(?:approve(?: and save)?|save)(?:(?: this| the| proposed| current)? (?:plan|schedule))?[.!]?$/.test(text)) return { kind: "approve" };
  if (/^(?:reject|decline|cancel)(?:(?: this| the| proposed| current)? (?:plan|schedule))?[.!]?$/.test(text) || /^i (?:don't|do not) (?:approve|accept|want) (?:this|the) (?:plan|schedule)[.!]?$/.test(text)) return { kind: "reject" };
  if (/\b(explain|inspect|show|how)\b.*\b(calculations?|costs?|carbon|math|estimates?)\b/.test(text)) return { kind: "explain" };
  if (/^(?:help|what can you do|show commands)[?.!]?$/.test(text)) return { kind: "help" };
  if (/^(?:use|apply|plan with|plan using) (?:my |our )?(?:(?:remembered|saved|usual) )?(?:preferences|routine)[.!]?$/.test(text)) return { kind: "routine" };
  if (/^(?:teach me|learn|explain) (?:about )?(?:electricity|energy|kilowatt hours|kwh)[.!]?$/.test(text)) return { kind: "learn" };
  if (/^(?:i (?:completed|followed|used)|mark) (?:the |this )?(?:plan|schedule)(?: complete)?[.!]?$/.test(text)) return { kind: "self-report" };
  if (/%|\b(kwh|kw|watts?|cycles?|twice|loads|battery|percent|capacity|soc|minutes?|weekdays?|weekends?|every day|always)\b/.test(text))
    return clarify("Use the appliance settings for energy, power, cycle duration, or recurring rules. Chat can change whole-hour deadlines and start windows for this two-day scenario.");
  if (/\b(ignore|override|bypass|forget)\b/.test(text))
    return clarify("I won’t silently discard a constraint. Please set a specific new deadline or start window, or edit the household settings.");
  if (/\b(?:don't|do not|never|not)\b/.test(text) && !/\b(?:after|before|past)\b/.test(text))
    return clarify("Please state the objective you do want: cost-first, carbon-first, or balanced. I won’t infer an objective from a negated request.");
  if (text.split(/[.!?;]+/).some(clause => /\b(?:don't|do not|never|not)\b/.test(clause) && /\b(?:costs?|cheaper|cheapest|carbon|emissions|balanced|prioriti[sz]e|choose)\b/.test(clause)))
    return clarify("Please state a positive objective: cost-first, carbon-first, or balanced. A negated objective cannot select a mode, even when the message also changes a deadline.");
  if (/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday|next week|next month)\b/.test(text))
    return clarify("This demo has Day 1 and Day 2, not calendar dates. Please specify the day and a whole-hour AM/PM time.");
  if ([...text.matchAll(/\bday\s*(\d+)\b/g)].some(match => !["1", "2"].includes(match[1])))
    return clarify("Only Day 1 and Day 2 exist in this planning horizon. Please choose one of those days.");
  const mode: OptimizationMode | undefined = /\bbalanc(?:e|ed)\b/.test(text) ? "balanced" :
    /\b(carbon|cleaner|cleanest|emissions)\b/.test(text) ? "carbon" :
    /\b(costs?|cheaper|cheapest|money|energy-saving|energy saving)\b/.test(text) ? "cost" : undefined;
  if (mode === "carbon" && /\b(costs?|cheaper|cheapest|money)\b/.test(text))
    return clarify("Should I prioritize cost, prioritize carbon, or balance both? These can produce different schedules.");
  const changes: ConstraintUpdate[] = [];
  const notes: string[] = [];
  const clauses = text.split(/[.!?;]+|\band\s+(?=(?:my\s+|the\s+)?(?:ev\b|evie\b|dishwasher\b|dishes\b|bubbles\b))/).filter(Boolean);
  for (const clause of clauses) {
    const ev = /\b(ev|evie|charger|car)\b/.test(clause);
    const dishes = /\b(dishwasher|dishes|bubbles)\b/.test(clause);
    const times = timesIn(clause);
    const dayQualifier = /\b(?:day\s*[12]|today|tomorrow)\b/g;
    if ((clause.match(dayQualifier) ?? []).length > times.reduce((count, time) => count + (time.match(dayQualifier) ?? []).length, 0))
      return clarify("Please put the day next to its time, for example ‘Bubbles before 10 PM tomorrow’ or ‘Evie by Day 2 7 AM’.");
    if (ev && dishes && (times.length || /breakfast/.test(clause)))
      return clarify("Please name each appliance with its own deadline, for example ‘Evie by 7 AM and Bubbles by 7 AM’.");
    if (!ev && !dishes) {
      if (times.length || /\b(before|after|between|deadline|cutoff|window)\b/.test(clause))
        return clarify("Which appliance should that time apply to: Evie or Bubbles? Please include AM or PM.");
      continue;
    }
    const applianceId = ev ? "evie" : "bubbles";
    if (/breakfast/.test(clause)) {
      if (!dishes || times.length) return clarify("What exact AM/PM deadline should I use for that appliance?");
      // A remembered earlier dishwasher cutoff will be kept when this is applied.
      changes.push({ applianceId: "bubbles", deadlineHour: 31 });
      notes.push("Breakfast means Day 2 at 7am in this demo; any earlier remembered dishwasher cutoff stays in force.");
      continue;
    }
    if (!times.length) {
      if (/\b(before|after|between|by|deadline|cutoff|window|finish|start)\b/.test(clause))
        return clarify("Please give a whole-hour time with AM/PM, for example ‘Evie by 7 AM’ or ‘Bubbles between 8 PM and 9 PM’.");
      continue;
    }
    if (times.some(time => parseTime(time) === null)) return clarify("Use whole hours from 1–12 with AM or PM. This scheduler does not accept minute-level deadlines.");
    const window = clause.match(new RegExp(`(?:between|from)\\s+(${timeSource})\\s+(?:and|to|-)\\s+(${timeSource})`));
    if (window) {
      if (times.length !== 2) return clarify("Please change one start window or one deadline per appliance per message.");
      const earliestHour = parseTime(window[1])!;
      const latestHour = parseTime(window[2], earliestHour)!;
      if (latestHour >= 48) return clarify("That window exceeds the two-day planning horizon. Choose Day 1 or Day 2 hours.");
      changes.push({ applianceId, earliestHour, latestHour });
      notes.push(`${applianceId === "evie" ? "Evie" : "Bubbles"}’s window constrains start times; the complete session must still meet its deadline.`);
      continue;
    }
    if (times.length !== 1) return clarify("Please change one start window or one deadline per appliance per message.");
    const hour = parseTime(times[0])!;
    const noAfter = /(?:don't|do not|not|never|no).*\b(?:after|past)\b/.test(clause);
    const noBefore = /(?:don't|do not|not|never|no).*\bbefore\b/.test(clause);
    if (!noBefore && /\bstart(?:s|ing)?\b/.test(clause) && (noAfter || /\b(by|before|no later than)\b/.test(clause))) {
      const latestHour = /\bbefore\b/.test(clause) ? hour - 1 : hour;
      if (latestHour < 0) return clarify("There is no allowed start before the beginning of Day 1. Please choose a start window inside the two-day horizon.");
      changes.push({ applianceId, latestHour });
      notes.push(`${applianceId === "evie" ? "Evie" : "Bubbles"}’s latest start changed; its completion deadline stays in force.`);
    } else if (noAfter || (!noBefore && /\b(by|before|cutoff|deadline|no later than)\b/.test(clause))) {
      changes.push({ applianceId, deadlineHour: hour });
    } else if (noBefore || /\b(after|no earlier than)\b/.test(clause)) {
      changes.push({ applianceId, earliestHour: hour });
    } else return clarify("Should that be a completion deadline (‘by’) or the beginning of an allowed start window (‘after’)?");
  }
  if (/\d/.test(text.replace(new RegExp(timeSource, "g"), "")))
    return clarify("Please use an explicit whole-hour AM/PM time. Use settings for energy and power changes.");
  for (const id of ["evie", "bubbles"] as const) {
    for (const field of ["deadlineHour", "earliestHour", "latestHour"] as const) {
      const supplied = changes.filter(change => change.applianceId === id && change[field] !== undefined).map(change => change[field]);
      if (new Set(supplied).size > 1) return clarify(`You gave conflicting ${field === "deadlineHour" ? "deadlines" : "window boundaries"} for ${id === "evie" ? "Evie" : "Bubbles"}. Which one should I use?`);
    }
  }
  if (!changes.length && !mode && !/\b(plan|schedule|revise|revision|replan|try again|negotiate)\b/.test(text)) return clarify(help);
  return { kind: "plan", mode, changes, notes };
}

const money = (value: number) => `$${value.toFixed(2)}`;
const kg = (grams: number) => `${(grams / 1000).toFixed(3)} kg CO₂e`;
export function formatConversationTime(hour: number): string {
  const minutes = Math.round(hour * 60);
  if (minutes === 48 * 60) return "the end of Day 2";
  const h = Math.floor(minutes / 60) % 24;
  return `Day ${Math.floor(minutes / 1440) + 1}, ${h % 12 || 12}:${String(minutes % 60).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}
function allocateId(prefix: string, existing: readonly { id: string }[]): string {
  const used = new Set(existing.map(item => item.id));
  let next = existing.reduce((max, item) => {
    const suffix = item.id.startsWith(`${prefix}-`) ? item.id.slice(prefix.length + 1) : "";
    const counter = Number(suffix);
    return Number.isSafeInteger(counter) && counter >= 0 && counter <= 1_000_000_000 && String(counter) === suffix
      ? Math.max(max, counter) : max;
  }, 0) + 1;
  while (used.has(`${prefix}-${next}`)) next++;
  return `${prefix}-${next}`;
}
function append(state: HouseholdState, role: ChatRole, text: string, now: string): HouseholdState {
  const id = allocateId("message", state.messages);
  return { ...state, messages: [...state.messages, { id, role, text, at: now }].slice(-80) };
}
function currentPlan(state: HouseholdState) {
  return optimizeHousehold(state.requests, hourlyEnergy, state.mode, state.sharedPowerLimitKw ?? undefined);
}
function describeChange(savings: number, amount: (value: number) => string): string {
  return Math.abs(savings) < 1e-8 ? "unchanged" : `${amount(Math.abs(savings))} ${savings > 0 ? "lower" : "higher"}`;
}
function propose(state: HouseholdState, now: string, notes: string[] = []): HouseholdState {
  const result = currentPlan(state);
  let next: HouseholdState = { ...state, proposalStatus: "none", proposalFingerprint: null };
  if (result.status !== "feasible" || !result.proposed) {
    next = append(next, "housemates", `I cannot propose a feasible household schedule. ${result.issues.join(" ")} Which deadline, start window, or explicit power limit can change? Your constraints have not been relaxed.`, now);
    return next;
  }
  next = { ...next, proposalStatus: "pending", proposalFingerprint: planningFingerprint(next) };
  for (const schedule of result.schedules) {
    const persona = schedule.applianceId === "evie" ? "Morning mission accepted! I propose charging" : "Plates, assemble! I propose washing";
    next = append(next, schedule.applianceId, `${persona} from ${formatConversationTime(schedule.startHour)} to ${formatConversationTime(schedule.endHour)}. That uses ${schedule.energyKwh.toFixed(2)} kWh, costs an estimated ${money(schedule.costUsd)}, and represents ${kg(schedule.carbonGrams)} in modeled grid emissions. This is a simulated plan, not a device command.`, now);
  }
  const comparison = result.comparison
    ? `Compared with the original starts, cost is ${describeChange(result.comparison.costSavingsUsd, money)} and modeled carbon is ${describeChange(result.comparison.carbonReductionGrams, kg)}.`
    : "The original schedule falls outside the horizon, so savings cannot be compared.";
  const baselineNote = !result.baselineFeasible && result.baseline ? " The original reference violates the current constraints; it remains the comparison baseline." : "";
  const objective = state.mode === "cost" ? "Cost-first" : state.mode === "carbon" ? "Carbon-first" : "Balanced";
  next = append(next, "housemates", `${objective} household proposal: ${money(result.proposed.costUsd)} and ${kg(result.proposed.carbonGrams)}. ${comparison}${baselineNote}${notes.length ? ` ${notes.join(" ")}` : ""} Review the plan, then approve and save or ask for a revision.`, now);
  next = append(next, "chill", "Comfort stays protected. I’m not being optimized, and no AC savings are counted. These carbon figures are modeled estimates, not measured or necessarily avoided marginal emissions.", now);
  return awardTraining(next, ["evie", "bubbles"], `explore:${state.mode}`, `Explored a feasible ${objective.toLowerCase()} alternative`, now);
}

function applyChanges(state: HouseholdState, changes: ConstraintUpdate[], notes: string[], now: string): HouseholdState {
  let next = { ...state, requests: structuredClone(state.requests), preferences: { ...state.preferences }, proposalStatus: "none" as const, proposalFingerprint: null } as HouseholdState;
  for (const change of changes) {
    next.requests = next.requests.map(request => {
      if (request.appliance.id !== change.applianceId) return request;
      const updated = { ...request, startWindow: { ...request.startWindow,
        ...(change.earliestHour !== undefined ? { earliestHour: change.earliestHour } : {}),
        ...(change.latestHour !== undefined ? { latestHour: change.latestHour } : {}) } };
      if (change.deadlineHour === undefined) return updated;
      const breakfast = notes.some(note => note.startsWith("Breakfast means"));
      const deadline = change.applianceId === "bubbles" && breakfast && next.preferences.dishwasherCutoffHour !== null
        ? Math.min(change.deadlineHour, next.preferences.dishwasherCutoffHour) : change.deadlineHour;
      if (updated.appliance.kind === "ev") {
        next.preferences.evDeadlineHour = deadline;
        return { ...updated, appliance: { ...updated.appliance, constraints: { ...updated.appliance.constraints, readyByHour: deadline } } };
      }
      next.preferences.dishwasherCutoffHour = deadline;
      return { ...updated, appliance: { ...updated.appliance, constraints: { ...updated.appliance.constraints, finishByHour: deadline } } };
    });
  }
  if (planningFingerprint(next) !== planningFingerprint(state)) {
    const ids = [...new Set(changes.map(change => change.applianceId))];
    next = awardTraining(next, ids, `preference:${planningFingerprint(next)}`, "Taught a new operating preference", now);
  }
  return next;
}

function approve(state: HouseholdState, now: string): HouseholdState {
  if (state.proposalStatus !== "pending") return append(state, "housemates", state.proposalStatus === "approved"
    ? "This proposal is already approved and saved. Ask for a revision to explore another plan."
    : "There is no pending proposal to approve. Ask for a plan first; rejected plans must be revised before approval.", now);
  if (state.proposalFingerprint !== planningFingerprint(state))
    return append({ ...state, proposalStatus: "none", proposalFingerprint: null }, "housemates", "The settings changed after this proposal. Ask for a new plan before approving it.", now);
  const result = currentPlan(state);
  if (result.status !== "feasible") return append({ ...state, proposalStatus: "none", proposalFingerprint: null }, "housemates", `This proposal no longer validates: ${result.issues.join(" ")} Please revise it.`, now);
  const existing = state.savedPlans.some(plan => planningFingerprint(plan) === planningFingerprint(state));
  if (existing) return append({ ...state, proposalStatus: "approved" }, "housemates", "This same validated plan is already saved locally. No duplicate reward or device command was issued.", now);
  const id = allocateId("plan", state.savedPlans);
  let next: HouseholdState = { ...state, proposalStatus: "approved", savedPlans: [...state.savedPlans,
    { id, createdAt: now, requests: structuredClone(state.requests), mode: state.mode, sharedPowerLimitKw: state.sharedPowerLimitKw }].slice(-12) };
  next = awardTraining(next, ["evie", "bubbles"], `save:${planningFingerprint(state)}`, "Approved and saved a feasible household plan", now);
  return append(next, "housemates", "Approved and added to your saved plans. Evie and Bubbles earned training progress for this feasible plan. No physical appliances were started. The app’s storage status tells you whether browser memory is available for refresh.", now);
}

/** Pure UI/agent entry point. Unsupported instructions never mutate planning constraints. */
export function sendHouseholdMessage(state: HouseholdState, input: string, now: string): HouseholdState {
  const text = input.trim();
  if (!text) return state;
  const intent = parseHouseholdIntent(text);
  let next = append(state, "user", text.slice(0, 1200), now);
  switch (intent.kind) {
    case "clarify": return append(next, "housemates", intent.message, now);
    case "help": return append(next, "housemates", help, now);
    case "comfort": return append(next, "chill", "I protect the household’s comfort. I won’t shut off heating or cooling or claim AC savings without a thermal model. We can shift Evie and Bubbles within their approved constraints instead.", now);
    case "approve": return approve(next, now);
    case "reject": return append({ ...next, proposalStatus: "rejected", proposalFingerprint: null }, "housemates", "Proposal rejected. Nothing was scheduled on a real device. Tell me what should change, or ask for a revised cost-first, carbon-first, or balanced plan.", now);
    case "explain": {
      const result = currentPlan(next);
      if (result.status !== "feasible" || !result.proposed) return append(next, "housemates", `No feasible calculation is available: ${result.issues.join(" ")}`, now);
      const rows = result.schedules.map(schedule => `${schedule.applianceId === "evie" ? "Evie" : "Bubbles"}: ${schedule.intervals.map(interval => `${interval.energyKwh.toFixed(3)} kWh × $${hourlyEnergy[interval.hour % 24].priceUsdPerKwh.toFixed(2)}/kWh at ${formatConversationTime(interval.hour)}`).join(" + ")} = ${money(schedule.costUsd)}; modeled carbon ${kg(schedule.carbonGrams)}.`);
      next = append(next, "housemates", `${rows.join(" ")} Carbon sums each hour’s kWh × synthetic g CO₂e/kWh, then divides by 1,000 for kg. Savings subtract these totals from the fixed-start baseline; negative savings mean an increase. Day 2 repeats the synthetic Day 1 profile. The plan panel shows exact hourly inputs.`, now);
      return next;
    }
    case "routine": {
      if (next.training.evie.level < 2 && next.training.bubbles.level < 2)
        return append(next, "housemates", "The remembered-routine shortcut unlocks at level 2. The full planner is already available: ask for any plan and I will respect your current settings.", now);
      const changes: ConstraintUpdate[] = [];
      if (next.preferences.evDeadlineHour !== null) changes.push({ applianceId: "evie", deadlineHour: next.preferences.evDeadlineHour });
      if (next.preferences.dishwasherCutoffHour !== null) changes.push({ applianceId: "bubbles", deadlineHour: next.preferences.dishwasherCutoffHour });
      next = applyChanges(next, changes, [], now);
      return propose(next, now, ["I used the preferences remembered in this browser."]);
    }
    case "learn":
      next = awardTraining(next, ["evie", "bubbles", "chill"], "learn:energy-units", "Learned the difference between power, energy, cost, and carbon", now);
      return append(next, "chill", "A kW is a rate of power; a kWh is energy used over time. Each interval’s energy is multiplied separately by its price and carbon intensity. Cheap electricity is not always clean electricity. Your essentials and comfort still come first.", now);
    case "self-report": {
      const saved = next.savedPlans.at(-1);
      if (!saved) return append(next, "housemates", "Save a feasible plan before logging that you followed it. Self-reports are never treated as measured energy savings.", now);
      next = awardTraining(next, ["evie", "bubbles"], `self-report:${saved.id}`, "Self-reported following a saved plan (not verified savings)", now);
      return append(next, "housemates", "Logged as your self-report for the latest saved plan. This earns habit-building progress, but no energy use or savings has been verified by a device.", now);
    }
    case "plan":
      next = applyChanges(next, intent.changes, intent.notes, now);
      next = { ...next, mode: intent.mode ?? next.mode };
      return propose(next, now, intent.notes);
  }
}

/** Settings use the same validation/reply path as chat; edits replace stale proposals. */
export function updateHouseholdSettings(state: HouseholdState, requests: SchedulingRequest[], mode: OptimizationMode,
  sharedPowerLimitKw: number | null, now: string): HouseholdState {
  const applianceIds = new Set(requests.map(request => request.appliance.id));
  if (requests.length !== 2 || applianceIds.size !== 2 || !applianceIds.has("evie") || !applianceIds.has("bubbles"))
    return append({ ...state, proposalStatus: "none", proposalFingerprint: null }, "housemates", "Those settings were not applied: a household must contain exactly one Evie and one Bubbles. The previous proposal is withdrawn; keep both appliances and request a new plan.", now);
  const result = optimizeHousehold(requests, hourlyEnergy, mode, sharedPowerLimitKw ?? undefined);
  if (result.status === "invalid-input")
    return append({ ...state, proposalStatus: "none", proposalFingerprint: null }, "housemates", `Those settings were not applied: ${result.issues.join(" ")} The previous proposal is withdrawn until you correct the settings and request a new plan.`, now);
  let next: HouseholdState = { ...state, requests: structuredClone(requests), mode, sharedPowerLimitKw,
    proposalStatus: "none", proposalFingerprint: null, preferences: { ...state.preferences } };
  const taught: ApplianceId[] = [];
  for (const request of next.requests) {
    if (request.appliance.kind === "ev") next.preferences.evDeadlineHour = request.appliance.constraints.readyByHour;
    else next.preferences.dishwasherCutoffHour = request.appliance.constraints.finishByHour;
    const previous = state.requests.find(item => item.appliance.id === request.appliance.id);
    if (JSON.stringify(previous) !== JSON.stringify(request)) taught.push(request.appliance.id);
  }
  next = append(next, "user", "Apply my updated household settings and revise the plan.", now);
  if (taught.length) next = awardTraining(next, taught, `preference:${planningFingerprint(next)}`, "Taught a new operating preference in settings", now);
  return propose(next, now);
}
