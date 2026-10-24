import type { ApplianceId } from "./appliances";
import type { DemoScenario } from "./demo";
import { formatDemoHour } from "./demo";
import { parseHouseholdIntent } from "./conversation";
import { planningFingerprint } from "./household";
import { optimizeHousehold, type HouseholdPlan, type OptimizationMode, type SchedulingRequest } from "./scheduling";
import { getSimulationStats, type SimulationStats } from "./simulation";
import { getDemoAcStats } from "./demo-activity";

export type DemoCommandProposal = {
  id: string;
  fingerprint: string;
  plan: HouseholdPlan;
  requests: SchedulingRequest[];
  mode: OptimizationMode;
};
export type DemoCommandSession = {
  version: 1;
  contextFingerprint: string;
  /** Approved settings. A pending preview has its own parameters until explicit approval. */
  requests: SchedulingRequest[];
  mode: OptimizationMode;
  pending: DemoCommandProposal | null;
  approved: DemoCommandProposal | null;
  executionHour: number;
  status: "idle" | "running" | "paused" | "completed";
  nextProposalId: number;
};
export type DemoCommandResult = { session: DemoCommandSession; reply: string };
const START_HOUR = 18;
const STORAGE_LIMIT = 100_000;
const modes: readonly OptimizationMode[] = ["cost", "carbon", "balanced"];
const names = { evie: "Evie", bubbles: "Bubbles", chill: "Chill" };

/** Canonical data, not a security signature. All stored parameters are still validated and recomputed. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function demoCommandContextFingerprint(scenario: DemoScenario): string {
  return canonical([scenario.profile, scenario.requests, scenario.energyProfile, scenario.weather, scenario.acActivity]);
}

function fingerprint(context: string, requests: SchedulingRequest[], mode: OptimizationMode): string {
  return canonical([context, planningFingerprint({ requests, mode, sharedPowerLimitKw: null })]);
}

function proposal(scenario: DemoScenario, requests: SchedulingRequest[], mode: OptimizationMode, id: string): DemoCommandProposal {
  const safe = structuredClone(requests);
  return { id, requests: safe, mode, fingerprint: fingerprint(demoCommandContextFingerprint(scenario), safe, mode),
    plan: optimizeHousehold(safe, scenario.energyProfile, mode) };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function wholeHour(value: unknown, max = 48): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

/** Copy only adjustable scheduling fields; fixture identity, power, energy and baseline cannot be rewritten. */
function validateRequests(value: unknown, scenario: DemoScenario): SchedulingRequest[] | null {
  if (!Array.isArray(value) || value.length !== scenario.requests.length || value.length > 2) return null;
  const result: SchedulingRequest[] = [];
  for (const original of scenario.requests) {
    const matches = value.filter(row => record(row) && record(row.appliance) && row.appliance.id === original.appliance.id);
    if (matches.length !== 1) return null;
    const row = matches[0] as Record<string, unknown>;
    if (!record(row.appliance) || !record(row.appliance.constraints) || !record(row.startWindow) || row.baselineStartHour !== original.baselineStartHour) return null;
    const constraints = row.appliance.constraints;
    const deadlineKey = original.appliance.kind === "ev" ? "readyByHour" : "finishByHour";
    const deadline = constraints[deadlineKey];
    if (!wholeHour(deadline) || !wholeHour(row.startWindow.earliestHour, 47) || !wholeHour(row.startWindow.latestHour, 47) || row.startWindow.earliestHour < START_HOUR) return null;
    const copy = structuredClone(original);
    if (copy.appliance.kind === "ev") copy.appliance.constraints.readyByHour = deadline;
    else copy.appliance.constraints.finishByHour = deadline;
    // Other appliance fields and constraints must match the scenario exactly; this also rejects energy injection.
    if (canonical(copy.appliance) !== canonical(row.appliance)) return null;
    copy.startWindow = { earliestHour: row.startWindow.earliestHour, latestHour: row.startWindow.latestHour };
    result.push(copy);
  }
  return result;
}

function validatedProposal(value: unknown, scenario: DemoScenario, requireFeasible: boolean): DemoCommandProposal | null {
  if (!record(value) || typeof value.id !== "string" || !/^demo-proposal-[1-9]\d{0,8}$/.test(value.id) || !modes.includes(value.mode as OptimizationMode)) return null;
  const requests = validateRequests(value.requests, scenario);
  if (!requests?.length) return null;
  const fresh = proposal(scenario, requests, value.mode as OptimizationMode, value.id);
  if (value.fingerprint !== fresh.fingerprint || canonical(value.plan) !== canonical(fresh.plan) || (requireFeasible && fresh.plan.status !== "feasible")) return null;
  return fresh;
}

function current(session: DemoCommandSession, scenario: DemoScenario): boolean {
  if (!session || session.version !== 1 || session.contextFingerprint !== demoCommandContextFingerprint(scenario) ||
      !modes.includes(session.mode) || !Number.isSafeInteger(session.nextProposalId) || session.nextProposalId < 1 || session.nextProposalId > 999_999_999 ||
      !Number.isFinite(session.executionHour) || session.executionHour < START_HOUR || session.executionHour > 48 ||
      !validateRequests(session.requests, scenario) || !["idle", "running", "paused", "completed"].includes(session.status)) return false;
  if (!session.approved) return session.status === "idle" && session.executionHour === START_HOUR &&
    (!session.pending || !!validatedProposal(session.pending, scenario, false));
  const approved = validatedProposal(session.approved, scenario, true);
  if (!approved || session.pending || session.status === "idle" || session.mode !== approved.mode ||
      canonical(session.requests) !== canonical(approved.requests)) return false;
  const complete = approved.plan.schedules.every(row => session.executionHour >= row.endHour);
  return complete ? session.status === "completed" : session.status === "running" || session.status === "paused";
}

function invalidated(scenario: DemoScenario, previous: DemoCommandSession): DemoCommandResult {
  const fresh = createDemoCommandSession(scenario);
  // A late click from the old region must not match the first proposal in the new region.
  const nextProposalId = Number.isSafeInteger(previous?.nextProposalId) && previous.nextProposalId >= 1 && previous.nextProposalId < 999_999_999
    ? previous.nextProposalId : 999_999_999;
  return { session: { ...fresh, nextProposalId }, reply: "This home's settings or saved command state changed. The previous approval is no longer valid. Review a new proposal before starting a simulation." };
}

export function createDemoCommandSession(scenario: DemoScenario, mode: OptimizationMode = scenario.profile.planningMode ?? "cost"): DemoCommandSession {
  if (!modes.includes(mode)) throw new RangeError("Invalid command planning objective.");
  const requests = structuredClone(scenario.requests);
  requests.forEach(row => { row.startWindow.earliestHour = Math.max(START_HOUR, row.startWindow.earliestHour); });
  return { version: 1, contextFingerprint: demoCommandContextFingerprint(scenario), requests,
    mode, pending: null, approved: null,
    executionHour: START_HOUR, status: "idle", nextProposalId: 1 };
}

/** Explicit new-day action keeps proposal IDs increasing so an old approval button cannot match a new preview. */
export function resetDemoCommandSession(session: DemoCommandSession, scenario: DemoScenario): DemoCommandSession {
  const fresh = createDemoCommandSession(scenario, modes.includes(session.mode) ? session.mode : undefined);
  return { ...fresh, nextProposalId: Number.isSafeInteger(session.nextProposalId) && session.nextProposalId >= 1 && session.nextProposalId < 999_999_999
    ? session.nextProposalId : 999_999_999 };
}

function describePlan(candidate: DemoCommandProposal, approved = false): string {
  const plan = candidate.plan;
  if (plan.status !== "feasible" || !plan.proposed) return `No feasible proposal: ${plan.issues.join(" ")} Your constraints were not relaxed. Change a deadline or window to try again.`;
  const sessions = plan.schedules.map(row => `${names[row.applianceId]}: ${formatDemoHour(row.startHour)} to ${formatDemoHour(row.endHour)}, ${row.energyKwh.toFixed(2)} kWh`).join("; ");
  const diff = (amount: number, units: string) => Math.abs(amount) < 1e-8 ? "unchanged" : `${Math.abs(amount).toFixed(3)} ${units} ${amount > 0 ? "lower" : "higher"}`;
  return `${candidate.mode === "balanced" ? "Balanced" : `${candidate.mode}-first`} ${approved ? "approved simulation" : "preview"}. ${sessions}. Total $${plan.proposed.costUsd.toFixed(2)} USD and ${(plan.proposed.carbonGrams / 1000).toFixed(3)} kg modeled grid CO₂e.` +
    (plan.comparison ? ` Versus the fixed original routine: cost ${diff(plan.comparison.costSavingsUsd, "USD")}; carbon ${diff(plan.comparison.carbonReductionGrams / 1000, "kg CO₂e")}.` : "") +
    (!plan.baselineFeasible ? " The fixed original routine violates the current constraints and remains only the comparison reference." : "") +
    (approved ? " This is the approved simulation, not device control. Its plan remains fixed until explicit reset." : " This is a simulation preview, not device control. Use the approval button to start; speech or typed approval cannot start it.");
}

/** Deterministic text/voice transcript interpretation. No natural-language input can authorize execution. */
export function requestDemoCommand(session: DemoCommandSession, scenario: DemoScenario, applianceId: ApplianceId, input: string): DemoCommandResult {
  if (!current(session, scenario)) return invalidated(scenario, session);
  if (!scenario.profile.applianceIds.includes(applianceId)) return { session, reply: "That appliance is not selected for this home. Edit your team to add it." };
  if (typeof input !== "string" || !input.trim() || input.length > 1200) return { session, reply: "Enter a planning request of 1–1,200 characters." };
  const text = input.trim();
  if (/^(?:status|progress|what(?:'s| is) (?:my |the )?status)[?.!]?$/i.test(text)) {
    if (applianceId === "chill") {
      const ac = getDemoAcStats(scenario.acActivity, session.executionHour);
      return { session, reply: `Chill's fixed illustrative cooling trace at ${formatDemoHour(session.executionHour)}: ${ac.currentPowerKw.toFixed(2)} kW, ${ac.completedEnergyKwh.toFixed(2)} kWh, $${ac.accruedCostUsd.toFixed(2)} and ${(ac.accruedCarbonGrams / 1000).toFixed(3)} kg modeled CO₂e accrued since Day 1 midnight. This is background cooling, not controlled or optimized AC.` };
    }
    const stats = getDemoExecutionStats(session, scenario);
    const readings = Object.values(stats).filter(row => row.applianceId === applianceId);
    return { session, reply: session.approved ? `Simulation ${session.status} at ${formatDemoHour(session.executionHour)}. ${readings.map(row => `${names[row.applianceId]} ${row.status}: ${row.completedEnergyKwh.toFixed(2)} of ${row.totalEnergyKwh.toFixed(2)} kWh, ${row.currentPowerKw.toFixed(2)} kW now, $${row.accruedCostUsd.toFixed(2)} and ${(row.accruedCarbonGrams / 1000).toFixed(3)} kg modeled CO₂e accrued`).join("; ")}. No real device is controlled.` : "No plan is approved. Preview a plan and use its approval button to start simulated activity." };
  }
  if (applianceId === "chill") return { session, reply: "Chill shows a fixed illustrative cooling trace. AC cannot be scheduled or controlled through commands; no AC optimization or savings are claimed." };
  let intent = parseHouseholdIntent(text);
  // A selected appliance supplies the subject only; named requests retain their explicit subject.
  if (!/\b(evie|ev|charger|car|bubbles|dishwasher|dishes|chill|ac|air condition(?:er|ing)|cooling|heating)\b/i.test(text) && intent.kind === "clarify") {
    intent = parseHouseholdIntent(`${names[applianceId]} ${text}`);
  }
  if (intent.kind === "approve") return { session, reply: "Review the current proposal and press its approval button. Spoken or typed approval never starts execution." };
  if (intent.kind === "comfort") return { session, reply: "Chill remains protected. AC commands are unsupported; its illustrative cooling trace stays fixed in every plan." };
  if (intent.kind === "reject") return rejectDemoCommand(session, scenario);
  if (intent.kind === "help" || intent.kind === "learn") return { session, reply: `Try “${names[applianceId]} by 7 AM”, “Find a cheaper plan”, “Find a lower-carbon plan”, or a whole-hour AM/PM start window. Commands create a preview; only the approval button starts simulated execution. Cost and modeled carbon are separate objectives.` };
  if (intent.kind === "explain") {
    const preview = session.pending ?? session.approved;
    return { session, reply: preview ? `${describePlan(preview, !!session.approved)} Each interval costs kWh × regional USD/kWh; modeled carbon is kWh × regional g CO₂e/kWh, divided by 1,000 for kg. AC is excluded.` : "No command plan exists yet. Ask for a plan to inspect its calculated intervals." };
  }
  if (session.approved) return { session, reply: "This simulated day's approved plan is fixed, including completed or active work. Pause/resume with the controls, or explicitly reset to a new day before planning again." };
  if (intent.kind === "clarify") return { session, reply: intent.message };
  if (intent.kind !== "plan") return { session, reply: "Use a planning objective or a whole-hour deadline/window. Routine rewards and self-reported completion are not commands in this demo." };
  if (intent.changes.some(change => change.applianceId !== applianceId)) return { session, reply: `This conversation targets ${names[applianceId]}. Select the other appliance before changing its constraints.` };
  const requests = structuredClone(session.pending?.requests ?? session.requests);
  for (const change of intent.changes) {
    const row = requests.find(item => item.appliance.id === change.applianceId);
    if (!row) return { session, reply: "That flexible appliance is not on the selected team." };
    if (change.earliestHour !== undefined) row.startWindow.earliestHour = Math.max(START_HOUR, change.earliestHour);
    if (change.latestHour !== undefined) row.startWindow.latestHour = change.latestHour;
    if (change.deadlineHour !== undefined) {
      if (row.appliance.kind === "ev") row.appliance.constraints.readyByHour = change.deadlineHour;
      else row.appliance.constraints.finishByHour = intent.notes.some(note => note.startsWith("Breakfast means"))
        ? Math.min(row.appliance.constraints.finishByHour, change.deadlineHour) : change.deadlineHour;
    }
  }
  if (session.nextProposalId >= 999_999_999) return { session, reply: "Reset the demo day before creating more proposals." };
  const candidate = proposal(scenario, requests, intent.mode ?? session.pending?.mode ?? session.mode, `demo-proposal-${session.nextProposalId}`);
  const notes = [...intent.notes, ...(intent.changes.some(change => change.earliestHour !== undefined && change.earliestHour < START_HOUR)
    ? ["This simulated day begins at 18:00; earlier starts are unavailable and the original physical availability still applies."] : [])];
  return { session: { ...session, pending: candidate, nextProposalId: session.nextProposalId + 1 }, reply: `${describePlan(candidate)}${notes.length ? ` ${notes.join(" ")}` : ""}` };
}

export function approveDemoCommand(session: DemoCommandSession, scenario: DemoScenario, proposalId: string): DemoCommandResult {
  if (!current(session, scenario)) return invalidated(scenario, session);
  if (session.approved) return { session, reply: "This day already has an approved execution. Reset explicitly before approving a new day." };
  if (!session.pending || session.pending.id !== proposalId) return { session, reply: "That proposal is no longer current. Review the newest preview before approving." };
  const approved = validatedProposal(session.pending, scenario, true);
  if (!approved) return { session: { ...session, pending: null }, reply: "This proposal is infeasible or changed since calculation. Request a fresh preview; nothing was started." };
  return { session: { ...session, requests: structuredClone(approved.requests), mode: approved.mode, pending: null, approved,
    executionHour: START_HOUR, status: "running" }, reply: `Approved for simulated execution starting at ${formatDemoHour(START_HOUR)}. Queued appliances begin at their computed schedule times. No real device is controlled.` };
}

export function rejectDemoCommand(session: DemoCommandSession, scenario: DemoScenario): DemoCommandResult {
  if (!current(session, scenario)) return invalidated(scenario, session);
  if (session.approved) return { session, reply: "Rejection cannot undo already approved simulated work. Pause it or explicitly reset the demo day." };
  return { session: { ...session, pending: null }, reply: "Preview rejected. No execution started and approved settings are unchanged." };
}

export function advanceDemoExecution(session: DemoCommandSession, scenario: DemoScenario, toHour: number): DemoCommandResult {
  if (!current(session, scenario)) return invalidated(scenario, session);
  if (!Number.isFinite(toHour) || toHour < session.executionHour || toHour > 48) return { session, reply: "Execution time must move forward within the 18–48 hour simulation. Use explicit reset to start a new day." };
  if (!session.approved || session.status !== "running") return { session, reply: "Execution advances only after explicit approval while the simulation is running." };
  const stats = getSimulationStats(session.approved.plan.schedules, toHour);
  const complete = session.approved.plan.schedules.every(row => stats[row.applianceId].status === "complete");
  return { session: { ...session, executionHour: toHour, status: complete ? "completed" : "running" },
    reply: complete ? "The approved simulated sessions are complete. Accrued energy, cost and modeled carbon come from their interval ledgers; no device activity was measured." : `Simulation advanced to ${formatDemoHour(toHour)}.` };
}

export function setDemoExecutionPaused(session: DemoCommandSession, scenario: DemoScenario, paused: boolean): DemoCommandResult {
  if (!current(session, scenario)) return invalidated(scenario, session);
  if (!session.approved || session.status === "completed" || typeof paused !== "boolean") return { session, reply: "Only an approved unfinished simulation can be paused or resumed." };
  return { session: { ...session, status: paused ? "paused" : "running" }, reply: paused ? "Simulation paused. The approved schedule is unchanged." : "Simulation resumed from its saved time." };
}

export function getDemoExecutionStats(session: DemoCommandSession, scenario: DemoScenario): SimulationStats {
  return current(session, scenario) && session.approved ? getSimulationStats(session.approved.plan.schedules, session.executionHour) : getSimulationStats([], START_HOUR);
}

/** Only an approved parameter snapshot is persisted. No transcript, pending approval, cached totals or auto-run flag. */
export function serializeDemoCommandSession(session: DemoCommandSession, scenario: DemoScenario): string | null {
  if (!current(session, scenario) || !session.approved) return null;
  const raw = JSON.stringify({ version: 1, contextFingerprint: session.contextFingerprint, requests: session.approved.requests,
    mode: session.approved.mode, executionHour: session.executionHour });
  return raw.length <= STORAGE_LIMIT ? raw : null;
}

export function restoreDemoCommandSession(raw: string | null, scenario: DemoScenario): DemoCommandSession | null {
  if (typeof raw !== "string" || raw.length > STORAGE_LIMIT) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!record(data) || data.version !== 1 || data.contextFingerprint !== demoCommandContextFingerprint(scenario) ||
        !modes.includes(data.mode as OptimizationMode) || typeof data.executionHour !== "number" || !Number.isFinite(data.executionHour) ||
        data.executionHour < START_HOUR || data.executionHour > 48) return null;
    const requests = validateRequests(data.requests, scenario);
    if (!requests?.length) return null;
    const approved = proposal(scenario, requests, data.mode as OptimizationMode, "demo-proposal-1");
    if (approved.plan.status !== "feasible") return null;
    const completed = approved.plan.schedules.every(row => data.executionHour as number >= row.endHour);
    return { ...createDemoCommandSession(scenario), requests, mode: approved.mode, approved, executionHour: data.executionHour,
      status: completed ? "completed" : "paused", nextProposalId: 2 };
  } catch { return null; }
}
