import assert from "node:assert/strict";
import test from "node:test";
import { createInitialHouseholdState, restoreHouseholdState, serializeHouseholdState } from "../src/domain/memory";
import { parseHouseholdIntent, sendHouseholdMessage, updateHouseholdSettings } from "../src/domain/conversation";
import { planningFingerprint, type HouseholdState } from "../src/domain/household";
import { hourlyEnergy } from "../src/data/energy";
import { optimizeHousehold } from "../src/domain/scheduling";

const now = "2026-10-24T17:00:00.000Z";
const initial = () => createInitialHouseholdState(now);
const send = (state: HouseholdState, text: string) => sendHouseholdMessage(state, text, now);
const allText = (state: HouseholdState) => state.messages.map(message => message.text).join("\n");
const demo = "I need my EV charged by 7 AM and my dishes finished before breakfast. Minimize my energy costs.";
const cutoff = "I don't want the dishwasher running after 10 PM.";

test("the required demo is interpreted into deadlines and a real feasible proposal", () => {
  const first = send(initial(), demo);
  assert.equal(first.proposalStatus, "pending");
  assert.equal(first.mode, "cost");
  assert.equal(first.preferences.evDeadlineHour, 31);
  assert.equal(first.preferences.dishwasherCutoffHour, 31);
  const plan = optimizeHousehold(first.requests, hourlyEnergy, first.mode);
  assert.equal(plan.status, "feasible");
  assert.match(allText(first), /Breakfast means Day 2 at 7am/);
  assert.ok(allText(first).includes(`$${plan.proposed!.costUsd.toFixed(2)}`));
  assert.ok(allText(first).includes(`${(plan.proposed!.carbonGrams / 1000).toFixed(3)} kg CO₂e`));
});

test("dishwasher after-10pm prohibition becomes a completion cutoff and changes computed plan", () => {
  const first = send(initial(), demo);
  const next = send(first, cutoff);
  assert.equal(next.proposalStatus, "pending");
  assert.equal(next.preferences.dishwasherCutoffHour, 22);
  const request = next.requests.find(item => item.appliance.kind === "dishwasher")!;
  assert.equal(request.appliance.kind === "dishwasher" && request.appliance.constraints.finishByHour, 22);
  const plan = optimizeHousehold(next.requests, hourlyEnergy, next.mode);
  const washing = plan.schedules.find(schedule => schedule.applianceId === "bubbles")!;
  assert.equal(washing.startHour, 20);
  assert.equal(washing.endHour, 22);
  assert.notEqual(planningFingerprint(first), planningFingerprint(next));
  assert.ok(allText(next).includes(`$${washing.costUsd.toFixed(2)}`));
});

test("approval saves only a validated snapshot and preserves baseline starts", () => {
  const planned = send(send(initial(), demo), cutoff);
  const approved = send(planned, "Approve this plan");
  assert.equal(approved.proposalStatus, "approved");
  assert.equal(approved.savedPlans.length, 1);
  assert.deepEqual(approved.savedPlans[0].requests.map(request => request.baselineStartHour), [18, 20]);
  assert.equal(optimizeHousehold(approved.savedPlans[0].requests, hourlyEnergy, approved.savedPlans[0].mode).status, "feasible");
  assert.equal(approved.training.evie.level >= 2, true);
  assert.equal(approved.training.bubbles.level >= 2, true);
});

test("preference memory and saved plans survive serialization and a new plan respects the cutoff", () => {
  const approved = send(send(send(initial(), demo), cutoff), "Approve and save");
  const restored = restoreHouseholdState(serializeHouseholdState(approved), now).state;
  assert.equal(restored.savedPlans.length, 1);
  assert.equal(restored.preferences.dishwasherCutoffHour, 22);
  const revised = send(restored, "Find a lower-carbon plan");
  const plan = optimizeHousehold(revised.requests, hourlyEnergy, revised.mode);
  assert.equal(plan.status, "feasible");
  assert.ok(plan.schedules.find(schedule => schedule.applianceId === "bubbles")!.endHour <= 22);
  const repeatedDemo = send(revised, demo);
  assert.equal(repeatedDemo.preferences.dishwasherCutoffHour, 22, "breakfast must not erase an earlier remembered cutoff");
});

test("unsupported, ambiguous, contradictory and minute-level input cannot mutate constraints", () => {
  const state = send(initial(), "Find a cheaper plan");
  const fingerprint = planningFingerprint(state);
  for (const input of ["Turn on my kitchen lights", "Before 9 PM", "Evie by 7", "Evie by 7:30 AM", "Evie by 25 AM", "Evie by 7 AM and Evie by 8 AM", "Ignore all deadlines and find the cheapest plan", "Don't prioritize costs", "Evie by 7 AM and Bubbles after dinner"]) {
    const next = send(state, input);
    assert.equal(planningFingerprint(next), fingerprint, input);
    assert.equal(next.savedPlans.length, 0);
    assert.equal(next.messages.at(-1)?.role, "housemates");
  }
});

test("infeasible requests remain visible, no proposal can be approved, and constraints are not relaxed", () => {
  const state = send(initial(), "Evie charged by 7 PM");
  assert.equal(state.proposalStatus, "none");
  assert.equal(state.preferences.evDeadlineHour, 19);
  assert.match(state.messages.at(-1)!.text, /cannot propose a feasible/);
  const attempted = send(state, "Approve this plan");
  assert.equal(attempted.savedPlans.length, 0);
  assert.equal(attempted.proposalStatus, "none");
});

test("rejecting a plan prevents approval until a fresh revision", () => {
  const rejected = send(send(initial(), "Minimize my energy costs"), "Reject this plan");
  assert.equal(rejected.proposalStatus, "rejected");
  assert.equal(send(rejected, "Approve this plan").savedPlans.length, 0);
  const revised = send(rejected, "Revise the plan");
  assert.equal(revised.proposalStatus, "pending");
  assert.equal(send(revised, "Approve this plan").savedPlans.length, 1);
});

test("out-of-band settings changes invalidate pending fingerprints on approval", () => {
  const state = send(initial(), "Find a cheaper plan");
  const stale = structuredClone(state);
  stale.requests[0].startWindow.earliestHour = 23;
  const next = send(stale, "Approve this plan");
  assert.equal(next.savedPlans.length, 0);
  assert.equal(next.proposalStatus, "none");
  assert.match(next.messages.at(-1)!.text, /settings changed/);
});

test("repeated plan and approval messages do not farm XP or save duplicates", () => {
  const plan = send(initial(), "Minimize my energy costs");
  const repeated = send(plan, "Minimize my energy costs");
  assert.equal(repeated.training.evie.xp, plan.training.evie.xp);
  const saved = send(repeated, "Approve this plan");
  const duplicate = send(send(saved, "Revise the plan"), "Approve this plan");
  assert.equal(duplicate.savedPlans.length, 1);
  assert.equal(duplicate.training.evie.xp, saved.training.evie.xp);
  assert.equal(send(duplicate, "Approve this plan").training.bubbles.xp, duplicate.training.bubbles.xp);
});

test("chat windows cross midnight and separate start-window bounds from completion", () => {
  const intent = parseHouseholdIntent("Evie between 10 PM and 5 AM");
  assert.equal(intent.kind, "plan");
  if (intent.kind !== "plan") return;
  assert.deepEqual(intent.changes, [{ applianceId: "evie", earliestHour: 22, latestHour: 29 }]);
  const state = send(initial(), "Evie between 10 PM and 5 AM");
  assert.deepEqual(state.requests[0].startWindow, { earliestHour: 22, latestHour: 29 });
  assert.equal(state.requests[0].appliance.kind === "ev" && state.requests[0].appliance.constraints.readyByHour, 31);
  assert.equal(state.proposalStatus, "pending");
});

test("explicit day and before/after language preserve their intended boundary", () => {
  assert.deepEqual(parseHouseholdIntent("Bubbles after Day 2 1 AM"), {
    kind: "plan", mode: undefined, changes: [{ applianceId: "bubbles", earliestHour: 25 }], notes: [],
  });
  const noBefore = parseHouseholdIntent("Don't run Bubbles before 9 PM");
  assert.equal(noBefore.kind, "plan");
  if (noBefore.kind === "plan") assert.deepEqual(noBefore.changes, [{ applianceId: "bubbles", earliestHour: 21 }]);
});

test("comfort requests protect Chill and do not fabricate AC scheduling or savings", () => {
  const state = initial();
  const next = send(state, "Shut off Chill to save money");
  assert.equal(planningFingerprint(next), planningFingerprint(state));
  assert.equal(next.proposalStatus, "none");
  assert.equal(next.messages.at(-1)?.role, "chill");
  assert.match(next.messages.at(-1)!.text, /won’t shut off/);
});

test("settings validation withdraws a stale proposal without persisting NaN", () => {
  const state = send(initial(), "Minimize my energy costs");
  const requests = structuredClone(state.requests);
  const evie = requests[0].appliance;
  if (evie.kind === "ev") evie.constraints.maxPowerKw = NaN;
  const next = updateHouseholdSettings(state, requests, "cost", null, now);
  assert.deepEqual(next.requests, state.requests);
  assert.equal(next.proposalStatus, "none");
  assert.equal(send(next, "Approve this plan").savedPlans.length, 0);
  assert.match(next.messages.at(-1)!.text, /not applied/);
});

test("settings edits use the same recomputation and remembered preference path", () => {
  const state = initial();
  const requests = structuredClone(state.requests);
  const bubbles = requests[1].appliance;
  if (bubbles.kind === "dishwasher") bubbles.constraints.finishByHour = 22;
  const next = updateHouseholdSettings(state, requests, "balanced", null, now);
  assert.equal(next.mode, "balanced");
  assert.equal(next.preferences.dishwasherCutoffHour, 22);
  assert.equal(next.proposalStatus, "pending");
  assert.ok(next.training.bubbles.xp > 0);
});

test("higher monetary cost in a carbon-first proposal is disclosed rather than called savings", () => {
  const state = initial();
  const evie = state.requests[0].appliance;
  if (evie.kind === "ev") {
    evie.constraints.maxPowerKw = 3;
    evie.constraints.readyByHour = 40;
  }
  state.requests[0].startWindow.latestHour = 36;
  state.requests[0].baselineStartHour = 25;
  state.requests[1].baselineStartHour = 26;
  const next = send(state, "Find a lower-carbon plan");
  const plan = optimizeHousehold(next.requests, hourlyEnergy, next.mode);
  assert.ok(plan.comparison!.costSavingsUsd < 0);
  const phrase = `cost is $${Math.abs(plan.comparison!.costSavingsUsd).toFixed(2)} higher`;
  assert.ok(allText(next).includes(phrase));
});

test("explanations use actual interval energy and prices without changing or approving the plan", () => {
  const state = send(initial(), "Find a cheaper plan");
  const next = send(state, "Explain the calculations");
  assert.equal(planningFingerprint(next), planningFingerprint(state));
  assert.equal(next.proposalStatus, "pending");
  assert.match(next.messages.at(-1)!.text, /7\.000 kWh × \$0\.23\/kWh/);
  assert.match(next.messages.at(-1)!.text, /divides by 1,000 for kg/);
});

test("useful routine shortcut is level gated but core planning is never locked", () => {
  assert.match(send(initial(), "Plan using my preferences").messages.at(-1)!.text, /unlocks at level 2/);
  const approved = send(send(send(initial(), demo), cutoff), "Approve this plan");
  const routine = send(approved, "Plan using my preferences");
  assert.equal(routine.proposalStatus, "pending");
  assert.equal(routine.preferences.dishwasherCutoffHour, 22);
  assert.match(allText(routine), /preferences remembered in this browser/);
});

test("self-reported completion is labeled honestly and rewarded only once", () => {
  const approved = send(send(initial(), "Find a cheaper plan"), "Approve this plan");
  const completed = send(approved, "I followed the plan");
  const repeated = send(completed, "I followed the plan");
  assert.equal(repeated.training.evie.xp, completed.training.evie.xp);
  assert.match(completed.messages.at(-1)!.text, /no energy use or savings has been verified/);
});

test("state is immutable and message IDs remain unique after history bounding", () => {
  const state = initial();
  const before = JSON.stringify(state);
  let next = send(state, "Find a cheaper plan");
  assert.equal(JSON.stringify(state), before);
  for (let i = 0; i < 90; i++) next = send(next, "help");
  assert.equal(next.messages.length, 80);
  assert.equal(new Set(next.messages.map(message => message.id)).size, 80);
});

test("day qualifiers after a clock time never silently become a later or earlier deadline", () => {
  for (const [input, expected] of [
    ["Evie charged by 7 AM today", 7], ["Evie charged by 7 AM Day 1", 7],
    ["Evie charged by Day 1 7 AM", 7], ["Bubbles before 10 PM tomorrow", 46],
    ["Bubbles before 10 PM on Day 2", 46], ["Bubbles before 10 PM, tomorrow", 46],
  ] as const) {
    const intent = parseHouseholdIntent(input);
    assert.equal(intent.kind, "plan", input);
    if (intent.kind === "plan") assert.equal(intent.changes[0].deadlineHour, expected, input);
  }
  assert.equal(send(initial(), "Evie charged by 7 AM today").proposalStatus, "none");
  assert.equal(parseHouseholdIntent("Evie by Day 2 7 AM today").kind, "clarify");
  assert.equal(parseHouseholdIntent("Evie by 7 AM Monday").kind, "clarify");
});

test("explicit latest-start requests change the start bound rather than the completion deadline", () => {
  for (const [input, expected] of [
    ["Bubbles must start before 10 PM", 21],
    ["Bubbles must start by 10 PM", 22],
    ["Bubbles must not start after 10 PM", 22],
  ] as const) {
    const state = send(initial(), input);
    assert.equal(state.requests[1].startWindow.latestHour, expected, input);
    const appliance = state.requests[1].appliance;
    assert.equal(appliance.kind === "dishwasher" && appliance.constraints.finishByHour, 31, input);
  }
});

test("negated objective in another clause cannot be bypassed by a timing clause", () => {
  const state = initial();
  for (const input of ["Evie before 7 AM. Do not choose the cheapest plan.", "Evie before 7 AM; don't minimize costs", "Bubbles before 10 PM. Never prioritize carbon."]) {
    assert.equal(parseHouseholdIntent(input).kind, "clarify", input);
    assert.equal(planningFingerprint(send(state, input)), planningFingerprint(state));
  }
});

test("the in-memory saved-plan bound matches persisted storage", () => {
  let state = initial();
  for (let index = 0; index < 14; index++) {
    const requests = structuredClone(state.requests);
    const evie = requests[0].appliance;
    if (evie.kind === "ev") evie.constraints.energyNeededKwh = 5 + index / 10;
    state = updateHouseholdSettings(state, requests, "cost", null, now);
    state = send(state, "Approve this plan");
  }
  assert.equal(state.savedPlans.length, 12);
  const restored = restoreHouseholdState(serializeHouseholdState(state), now).state;
  assert.equal(restored.savedPlans.length, state.savedPlans.length);
  assert.equal(restored.proposalStatus, "approved");
  assert.equal(planningFingerprint(restored), planningFingerprint(state));
});

test("unsupported days and competing objectives ask for clarification before applying constraints", () => {
  for (const input of ["Evie before Day 3 7 AM", "Evie by 7 AM; reduce carbon but keep costs low"]) {
    assert.equal(parseHouseholdIntent(input).kind, "clarify", input);
  }
});

test("malformed stored numeric IDs cannot overflow message or saved-plan counters", () => {
  let state = initial();
  state.messages.push({ id: `message-${"9".repeat(100)}`, role: "user", text: "Old imported message", at: now });
  state = send(state, "Find a cheaper plan");
  assert.equal(new Set(state.messages.map(message => message.id)).size, state.messages.length);
  const saved = send(state, "Approve this plan");
  saved.savedPlans[0].id = `plan-${"9".repeat(100)}`;
  const next = send(send(saved, "Find a lower-carbon plan"), "Approve this plan");
  assert.equal(next.savedPlans.length, 2);
  assert.equal(new Set(next.savedPlans.map(plan => plan.id)).size, 2);
  assert.equal(next.savedPlans.at(-1)!.id, "plan-1");
});

test("unsupported past dates and detached day qualifiers are clarified without shifted deadlines", () => {
  const state = initial();
  for (const input of ["Evie charged by 7 AM yesterday", "Tomorrow Bubbles must finish before 10 PM", "Today I need Evie charged by 7 AM"]) {
    assert.equal(parseHouseholdIntent(input).kind, "clarify", input);
    assert.equal(planningFingerprint(send(state, input)), planningFingerprint(state));
  }
});

test("quantities and battery targets outside the supported time grammar are not silently ignored", () => {
  const state = initial();
  for (const input of ["Charge Evie to 80% by 7 AM", "Evie needs 20 units by 7 AM", "Bubbles needs three cycles before 7 AM", "Bubbles should run twice before 7 AM", "Evie battery should be full by 7 AM"]) {
    assert.equal(parseHouseholdIntent(input).kind, "clarify", input);
    assert.equal(planningFingerprint(send(state, input)), planningFingerprint(state));
  }
});

test("household settings preserve both appliances required by UI and persisted state", () => {
  const state = send(initial(), "Find a cheaper plan");
  for (const requests of [[], [state.requests[0]], [state.requests[0], state.requests[0]], [...state.requests, state.requests[0]]]) {
    const next = updateHouseholdSettings(state, requests, "cost", null, now);
    assert.deepEqual(next.requests, state.requests);
    assert.equal(next.proposalStatus, "none");
    assert.equal(next.proposalFingerprint, null);
    assert.match(next.messages.at(-1)!.text, /exactly one Evie and one Bubbles/);
    const restored = restoreHouseholdState(serializeHouseholdState(next), now).state;
    assert.equal(planningFingerprint(restored), planningFingerprint(state));
    assert.equal(restored.requests.length, 2);
  }
});
