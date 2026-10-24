import type { ApplianceId } from "./appliances";
import { defaultSchedulingRequests } from "../data/scheduling";
import { hourlyEnergy } from "../data/energy";
import { getSchedulingOptions, optimizeHousehold, type OptimizationMode, type SchedulingRequest } from "./scheduling";
import { planningFingerprint, type ChatMessage, type HouseholdState, type SavedPlan,
  type TrainingProgress } from "./household";

export const STORAGE_KEY = "housemates.household.v1";
const MAX_STORAGE_CHARS = 300_000;
const MAX_MESSAGES = 80;
const MAX_SAVED_PLANS = 12;
const MAX_REWARDS = 256;
const MAX_HISTORY = 40;
const ids: ApplianceId[] = ["evie", "bubbles", "chill"];
const levels = [0, 50, 100, 175];
const levelFor = (xp: number) => levels.filter(threshold => xp >= threshold).length;
const blankProgress = (): TrainingProgress => ({ xp: 0, level: 1, history: [], rewardedKeys: [] });

export function createInitialHouseholdState(now: string): HouseholdState {
  return {
    version: 1,
    requests: structuredClone([...defaultSchedulingRequests]),
    mode: "cost",
    sharedPowerLimitKw: null,
    preferences: { dishwasherCutoffHour: null, evDeadlineHour: null },
    messages: [
      { id: "welcome-system", role: "housemates", at: now,
        text: "Welcome home. Our appliance activity and energy rates are simulated; our planning calculations are real code. Tell us your deadline, ask for a cheaper or lower-carbon plan, then inspect and save a feasible proposal." },
      { id: "welcome-evie", role: "evie", at: now,
        text: "Evie reporting for the morning commute! I need 12 kWh and a clear deadline. Let’s find a charging window that works." },
      { id: "welcome-bubbles", role: "bubbles", at: now,
        text: "Bubbles here. Give me two uninterrupted hours and I’ll plan the washing around your household. Teach me your preferred cutoff!" },
      { id: "welcome-chill", role: "chill", at: now,
        text: "I’m Chill, your comfort advocate. My AC operation stays protected and outside this optimizer. We won’t claim AC savings or change physical devices." },
    ],
    savedPlans: [],
    training: { evie: blankProgress(), bubbles: blankProgress(), chill: blankProgress() },
    proposalStatus: "none",
    proposalFingerprint: null,
  };
}

/** Compact caller fingerprints so long scheduling inputs do not fill local storage. */
function rewardToken(key: string): string {
  let first = 2166136261, second = 5381;
  for (let i = 0; i < key.length; i++) {
    first = Math.imul(first ^ key.charCodeAt(i), 16777619);
    second = Math.imul(second, 33) ^ key.charCodeAt(i);
  }
  return `event:${key.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

/** Award only once per meaningful event and appliance, even after history truncation. */
export function awardTraining(state: HouseholdState, applianceIds: ApplianceId[], key: string,
  reason: string, now: string): HouseholdState {
  if (!key.trim() || !reason.trim()) return state;
  const token = rewardToken(key);
  let changed = false;
  const training = { ...state.training };
  for (const id of new Set(applianceIds)) {
    const progress = training[id];
    if (!progress || progress.rewardedKeys.includes(token) || progress.rewardedKeys.length >= MAX_REWARDS) continue;
    const rewardedKeys = [...progress.rewardedKeys, token];
    const xp = rewardedKeys.length * 25;
    training[id] = { xp, level: levelFor(xp), rewardedKeys,
      history: [...progress.history, { id: token, at: now, reason: reason.slice(0, 240), xp: 25 }].slice(-MAX_HISTORY) };
    changed = true;
  }
  return changed ? { ...state, training } : state;
}

export function unlockedSkills(progress: TrainingProgress, id: ApplianceId): { id: string; name: string; description: string }[] {
  const skills: { id: string; name: string; description: string }[] = [];
  const level = levelFor(progress.xp);
  if (level >= 2) skills.push({ id: "routine", name: "Remembered routine",
    description: id === "chill" ? "A shortcut to review the household’s protected comfort assumptions."
      : "Request a new feasible plan using your remembered deadlines and preferred operating windows with one click." });
  if (level >= 3) skills.push({ id: "tradeoffs", name: "Tradeoff explorer",
    description: "A personalized shortcut to compare your routine’s cost-first and carbon-first alternatives." });
  if (level >= 4) skills.push({ id: "coordinator", name: "Household coordinator",
    description: "Review your saved household routine and the constraints shared by flexible appliances." });
  return skills;
}

/** Persist input snapshots and local context only; cached energy totals are never stored. */
export function serializeHouseholdState(state: HouseholdState): string {
  const snapshot = {
    version: 1,
    requests: state.requests,
    mode: state.mode,
    sharedPowerLimitKw: state.sharedPowerLimitKw,
    preferences: state.preferences,
    messages: state.messages.slice(-MAX_MESSAGES).map(({ id, role, text, at }) => ({ id, role, text: text.slice(0, 3000), at })),
    savedPlans: state.savedPlans.slice(-MAX_SAVED_PLANS).map(({ id, createdAt, requests, mode, sharedPowerLimitKw }) =>
      ({ id, createdAt, requests, mode, sharedPowerLimitKw })),
    training: state.training,
    proposalStatus: state.proposalStatus,
    proposalFingerprint: state.proposalFingerprint,
  };
  let raw = JSON.stringify(snapshot);
  // Keep the latest context if long legitimate conversations approach the load bound.
  while (raw.length > MAX_STORAGE_CHARS && snapshot.messages.length > 4) {
    snapshot.messages.shift();
    raw = JSON.stringify(snapshot);
  }
  while (raw.length > MAX_STORAGE_CHARS && snapshot.savedPlans.length > 1) {
    snapshot.savedPlans.shift();
    raw = JSON.stringify(snapshot);
  }
  if (raw.length > MAX_STORAGE_CHARS) throw new Error("Household memory exceeds the local demo storage limit.");
  return raw;
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const hour = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 48;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const modeValue = (value: unknown): value is OptimizationMode => value === "cost" || value === "carbon" || value === "balanced";
const shortText = (value: unknown, max = 160): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const timestamp = (value: unknown): value is string => shortText(value, 40) && Number.isFinite(Date.parse(value));
const limitValue = (value: unknown): value is number | null => value === null || positive(value);
const nullableHour = (value: unknown): value is number | null => value === null || hour(value);

function readRequests(value: unknown): SchedulingRequest[] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const result: SchedulingRequest[] = [];
  for (const base of defaultSchedulingRequests) {
    const matches = value.filter(item => record(item) && record(item.appliance) && item.appliance.id === base.appliance.id);
    if (matches.length !== 1) return null;
    const input: unknown = matches[0];
    if (!record(input) || !record(input.appliance) || !record(input.appliance.constraints) ||
      input.appliance.kind !== base.appliance.kind || input.appliance.simulated !== true ||
      !record(input.startWindow) || !hour(input.startWindow.earliestHour) || !hour(input.startWindow.latestHour) ||
      !hour(input.baselineStartHour)) return null;
    const c = input.appliance.constraints;
    const common = { startWindow: { earliestHour: input.startWindow.earliestHour, latestHour: input.startWindow.latestHour },
      baselineStartHour: input.baselineStartHour };
    let request: SchedulingRequest;
    if (base.appliance.kind === "ev") {
      if (!positive(c.energyNeededKwh) || !positive(c.maxPowerKw) || !hour(c.availableFromHour) || !hour(c.readyByHour)) return null;
      request = { ...common, appliance: { ...base.appliance, constraints: {
        energyNeededKwh: c.energyNeededKwh, maxPowerKw: c.maxPowerKw,
        availableFromHour: c.availableFromHour, readyByHour: c.readyByHour } } };
    } else {
      if (!positive(c.cycleHours) || !Number.isInteger(c.cycleHours) || c.cycleHours > 48 ||
        !positive(c.cycleEnergyKwh) || !hour(c.earliestStartHour) || !hour(c.finishByHour) || c.interruptible !== false) return null;
      let profile: number[] | undefined;
      if (c.cycleProfileKwh !== undefined) {
        if (!Array.isArray(c.cycleProfileKwh) || c.cycleProfileKwh.length !== c.cycleHours ||
          !c.cycleProfileKwh.every(entry => typeof entry === "number" && Number.isFinite(entry) && entry >= 0)) return null;
        profile = [...c.cycleProfileKwh];
        if (Math.abs(profile.reduce((sum, entry) => sum + entry, 0) - c.cycleEnergyKwh) > 1e-8) return null;
      }
      request = { ...common, appliance: { ...base.appliance, constraints: {
        cycleHours: c.cycleHours, cycleEnergyKwh: c.cycleEnergyKwh,
        earliestStartHour: c.earliestStartHour, finishByHour: c.finishByHour, interruptible: false,
        ...(profile ? { cycleProfileKwh: profile } : {}) } } };
    }
    if (getSchedulingOptions(request, hourlyEnergy).status === "invalid-input") return null;
    result.push(request);
  }
  return result;
}

function readMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length > 400) return null;
  const result: ChatMessage[] = [];
  for (const message of value.slice(-MAX_MESSAGES)) {
    if (!record(message) || !shortText(message.id) || !shortText(message.text, 3000) || !timestamp(message.at) ||
      !["user", "housemates", ...ids].includes(String(message.role))) return null;
    if (result.some(existing => existing.id === message.id)) continue;
    result.push({ id: message.id, role: message.role as ChatMessage["role"], text: message.text, at: message.at });
  }
  return result;
}

function readProgress(value: unknown): TrainingProgress | null {
  if (!record(value) || !Array.isArray(value.rewardedKeys) || value.rewardedKeys.length > MAX_REWARDS ||
    !value.rewardedKeys.every(key => typeof key === "string" && /^event:\d+:[a-f0-9]+:[a-f0-9]+$/.test(key) && key.length <= 80) ||
    !Array.isArray(value.history) || value.history.length > MAX_HISTORY) return null;
  const rewardedKeys = [...new Set(value.rewardedKeys as string[])];
  const history: TrainingProgress["history"] = [];
  for (const event of value.history) {
    if (!record(event) || !shortText(event.id, 80) || !rewardedKeys.includes(event.id) || !timestamp(event.at) ||
      !shortText(event.reason, 240) || event.xp !== 25) return null;
    if (!history.some(existing => existing.id === event.id)) history.push({ id: event.id, at: event.at, reason: event.reason, xp: 25 });
  }
  const xp = rewardedKeys.length * 25;
  // Do not trust serialized XP or level counters; derive them from bounded unique events.
  return { xp, level: levelFor(xp), history, rewardedKeys };
}

function readSavedPlan(value: unknown): SavedPlan | null {
  if (!record(value) || !shortText(value.id) || !timestamp(value.createdAt) || !modeValue(value.mode) || !limitValue(value.sharedPowerLimitKw)) return null;
  const requests = readRequests(value.requests);
  if (!requests || optimizeHousehold(requests, hourlyEnergy, value.mode, value.sharedPowerLimitKw ?? undefined).status !== "feasible") return null;
  return { id: value.id, createdAt: value.createdAt, requests, mode: value.mode, sharedPowerLimitKw: value.sharedPowerLimitKw };
}

/** Local storage is untrusted. Return safe defaults instead of partially merging malformed objects. */
export function restoreHouseholdState(raw: string | null, now: string): { state: HouseholdState; notice: string | null } {
  const reset = (notice: string) => ({ state: createInitialHouseholdState(now), notice });
  if (raw === null) return { state: createInitialHouseholdState(now), notice: null };
  if (raw.length > MAX_STORAGE_CHARS) return reset("Stored demo data was too large to load safely. A fresh household was started.");
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1 || !modeValue(value.mode) || !limitValue(value.sharedPowerLimitKw) ||
      !record(value.preferences) || !nullableHour(value.preferences.dishwasherCutoffHour) || !nullableHour(value.preferences.evDeadlineHour) ||
      !record(value.training) || !Array.isArray(value.savedPlans) || value.savedPlans.length > 100 ||
      !["none", "pending", "rejected", "approved"].includes(String(value.proposalStatus)))
      return reset("Stored demo data was invalid or from an unsupported version. A fresh household was started.");
    const requests = readRequests(value.requests);
    const messages = readMessages(value.messages);
    const training = { evie: readProgress(value.training.evie), bubbles: readProgress(value.training.bubbles), chill: readProgress(value.training.chill) };
    if (!requests || !messages || !training.evie || !training.bubbles || !training.chill)
      return reset("Stored household settings or history could not be validated. A fresh household was started.");
    const preferences = { dishwasherCutoffHour: value.preferences.dishwasherCutoffHour, evDeadlineHour: value.preferences.evDeadlineHour };
    // A remembered cutoff can tighten an older request snapshot, never silently relax it.
    for (const request of requests) {
      if (request.appliance.kind === "dishwasher" && preferences.dishwasherCutoffHour !== null)
        request.appliance.constraints.finishByHour = Math.min(request.appliance.constraints.finishByHour, preferences.dishwasherCutoffHour);
      if (request.appliance.kind === "ev" && preferences.evDeadlineHour !== null)
        request.appliance.constraints.readyByHour = Math.min(request.appliance.constraints.readyByHour, preferences.evDeadlineHour);
    }
    let discarded = 0;
    const savedPlans: SavedPlan[] = [];
    for (const candidate of value.savedPlans.slice(-MAX_SAVED_PLANS)) {
      const saved = readSavedPlan(candidate);
      if (saved && !savedPlans.some(existing => existing.id === saved.id)) savedPlans.push(saved);
      else discarded++;
    }
    const state: HouseholdState = { version: 1, requests, messages, preferences,
      training: { evie: training.evie, bubbles: training.bubbles, chill: training.chill },
      mode: value.mode, sharedPowerLimitKw: value.sharedPowerLimitKw, savedPlans,
      proposalStatus: value.proposalStatus as HouseholdState["proposalStatus"], proposalFingerprint: null };
    const currentFingerprint = planningFingerprint(state);
    const plan = optimizeHousehold(requests, hourlyEnergy, state.mode, state.sharedPowerLimitKw ?? undefined);
    const hasValidProposal = value.proposalFingerprint === currentFingerprint && plan.status === "feasible";
    const matchingSavedPlan = savedPlans.some(saved => planningFingerprint(saved) === currentFingerprint);
    const invalidApproval = state.proposalStatus === "approved" && !matchingSavedPlan;
    let stale = false;
    if (state.proposalStatus === "pending" || state.proposalStatus === "approved") {
      if (!hasValidProposal || invalidApproval) { state.proposalStatus = "none"; stale = true; }
      else state.proposalFingerprint = currentFingerprint;
    }
    const notices = [discarded ? "Some saved plans could not be validated and were removed." : "",
      stale ? "The previous proposal no longer matches a feasible saved state. Request a new plan before approving." : ""].filter(Boolean);
    return { state, notice: notices.length ? notices.join(" ") : null };
  } catch {
    return reset("Stored demo data could not be read. A fresh household was started.");
  }
}
