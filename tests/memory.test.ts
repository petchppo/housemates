import assert from "node:assert/strict";
import test from "node:test";
import { planningFingerprint, type HouseholdState } from "../src/domain/household";
import { createInitialHouseholdState, awardTraining, unlockedSkills, restoreHouseholdState, serializeHouseholdState, STORAGE_KEY } from "../src/domain/memory";
import { optimizeHousehold } from "../src/domain/scheduling";
import { hourlyEnergy } from "../src/data/energy";

const now = "2026-10-24T17:00:00.000Z";
const later = "2026-10-24T17:05:00.000Z";
function savedState(): HouseholdState {
  let state = createInitialHouseholdState(now);
  state.requests = state.requests.map(request => request.appliance.kind === "dishwasher"
    ? { ...request, appliance: { ...request.appliance, constraints: { ...request.appliance.constraints, finishByHour: 22 } } }
    : request);
  state.preferences.dishwasherCutoffHour = 22;
  state.messages.push({ id: "user-cutoff", role: "user", text: "I don't want the dishwasher running after 10 PM.", at: now });
  state = awardTraining(state, ["bubbles"], "preference:cutoff:22", "Learned your 10pm cutoff", now);
  state = awardTraining(state, ["evie", "bubbles"], "saved:evening-routine", "Saved a feasible household plan", now);
  state.savedPlans = [{ id: "saved-one", createdAt: now, requests: structuredClone(state.requests), mode: state.mode, sharedPowerLimitKw: state.sharedPowerLimitKw }];
  state.proposalStatus = "approved";
  state.proposalFingerprint = planningFingerprint(state);
  return state;
}

function mutateSerialized(mutate: (value: Record<string, unknown>) => void): string {
  const value = JSON.parse(serializeHouseholdState(savedState()));
  mutate(value);
  return JSON.stringify(value);
}

test("initial state is local, independent, and has all three characters without a proposal", () => {
  const first = createInitialHouseholdState(now), second = createInitialHouseholdState(now);
  assert.equal(STORAGE_KEY, "housemates.household.v1");
  assert.equal(first.requests.length, 2);
  assert.deepEqual(first.messages.map(message => message.role), ["housemates", "evie", "bubbles", "chill"]);
  assert.equal(first.proposalStatus, "none");
  first.preferences.dishwasherCutoffHour = 22;
  first.requests[0].startWindow.earliestHour = 25;
  assert.equal(second.preferences.dishwasherCutoffHour, null);
  assert.equal(second.requests[0].startWindow.earliestHour, 18);
});

test("unique meaningful rewards produce a real routine skill without gating the optimizer", () => {
  const original = createInitialHouseholdState(now);
  assert.equal(optimizeHousehold(original.requests, hourlyEnergy).status, "feasible");
  assert.deepEqual(unlockedSkills(original.training.bubbles, "bubbles"), []);
  let state = awardTraining(original, ["bubbles", "bubbles"], "explore:carbon", "Compared carbon plans", now);
  assert.equal(state.training.bubbles.xp, 25);
  assert.equal(original.training.bubbles.xp, 0);
  state = awardTraining(state, ["bubbles"], "teach:cutoff:22", "Learned cutoff", later);
  assert.equal(state.training.bubbles.level, 2);
  assert.equal(state.training.bubbles.xp, 50);
  assert.ok(unlockedSkills(state.training.bubbles, "bubbles").some(skill => skill.id === "routine"));
});

test("repeat actions do not farm XP, including after save and restore", () => {
  const state = savedState();
  const repeated = awardTraining(state, ["bubbles"], "preference:cutoff:22", "Learned your 10pm cutoff", later);
  assert.equal(repeated, state);
  const restored = restoreHouseholdState(serializeHouseholdState(state), later).state;
  assert.equal(awardTraining(restored, ["bubbles"], "preference:cutoff:22", "Repeated preference", later).training.bubbles.xp, 50);
});

test("preferences, settings, messages, training and feasible saved approval survive roundtrip", () => {
  const state = savedState();
  const result = restoreHouseholdState(serializeHouseholdState(state), later);
  assert.equal(result.notice, null);
  assert.equal(result.state.preferences.dishwasherCutoffHour, 22);
  const bubbles = result.state.requests.find(request => request.appliance.kind === "dishwasher")!;
  assert.equal(bubbles.appliance.kind === "dishwasher" && bubbles.appliance.constraints.finishByHour, 22);
  assert.equal(result.state.savedPlans.length, 1);
  assert.equal(result.state.messages.at(-1)?.text, state.messages.at(-1)?.text);
  assert.equal(result.state.training.bubbles.xp, 50);
  assert.equal(result.state.training.bubbles.level, 2);
  assert.equal(result.state.proposalStatus, "approved");
  const plan = optimizeHousehold(result.state.requests, hourlyEnergy);
  assert.equal(plan.status, "feasible");
  assert.ok(plan.schedules.find(schedule => schedule.applianceId === "bubbles")!.endHour <= 22);
});

test("null storage starts normally, malformed and unsupported storage recover with explanation", () => {
  assert.equal(restoreHouseholdState(null, now).notice, null);
  for (const raw of ["{", "null", "[]", "{}", '{"version":2}', "x".repeat(300_001)]) {
    const result = restoreHouseholdState(raw, now);
    assert.ok(result.notice);
    assert.equal(result.state.proposalStatus, "none");
    assert.equal(result.state.savedPlans.length, 0);
  }
});

test("bad enums and nonfinite/null numeric settings cannot become active stored state", () => {
  const invalid = [
    mutateSerialized(value => { value.mode = "imaginary"; }),
    mutateSerialized(value => { value.sharedPowerLimitKw = -1; }),
    mutateSerialized(value => { value.proposalStatus = "executed-on-real-device"; }),
    mutateSerialized(value => { (value.requests as HouseholdState["requests"])[0].appliance.constraints = { energyNeededKwh: NaN, maxPowerKw: 7, availableFromHour: 18, readyByHour: 31 }; }),
  ];
  for (const raw of invalid) {
    const restored = restoreHouseholdState(raw, now);
    assert.ok(restored.notice);
    assert.equal(restored.state.savedPlans.length, 0);
    assert.equal(restored.state.mode, "cost");
  }
});

test("requests require exactly one Evie and Bubbles, and canonical identities", () => {
  const duplicate = mutateSerialized(value => { const requests = value.requests as HouseholdState["requests"]; requests[1] = requests[0]; });
  assert.ok(restoreHouseholdState(duplicate, now).notice);
  const identity = mutateSerialized(value => { const requests = value.requests as HouseholdState["requests"]; requests[0].appliance.name = "Connected real Tesla"; });
  const restored = restoreHouseholdState(identity, now).state;
  assert.equal(restored.requests[0].appliance.name, "Evie");
  assert.equal(restored.requests[0].appliance.simulated, true);
});

test("remembered cutoff tightens inconsistent snapshots and invalidates stale approval", () => {
  const inconsistent = mutateSerialized(value => {
    const requests = value.requests as HouseholdState["requests"];
    if (requests[1].appliance.kind === "dishwasher") requests[1].appliance.constraints.finishByHour = 31;
    value.proposalFingerprint = JSON.stringify([requests, value.mode, value.sharedPowerLimitKw]);
  });
  const result = restoreHouseholdState(inconsistent, now);
  const bubbles = result.state.requests[1].appliance;
  assert.equal(bubbles.kind === "dishwasher" && bubbles.constraints.finishByHour, 22);
  assert.equal(result.state.proposalStatus, "none");
  assert.ok(result.notice);
});

test("infeasible settings remain editable while impossible saved plans are discarded", () => {
  const raw = mutateSerialized(value => {
    const requests = value.requests as HouseholdState["requests"];
    if (requests[0].appliance.kind === "ev") requests[0].appliance.constraints.readyByHour = 19;
    const saved = value.savedPlans as HouseholdState["savedPlans"];
    saved[0].requests = structuredClone(requests);
  });
  const result = restoreHouseholdState(raw, now);
  assert.equal(result.state.savedPlans.length, 0);
  assert.equal(result.state.requests[0].appliance.kind === "ev" && result.state.requests[0].appliance.constraints.readyByHour, 19);
  assert.equal(result.state.proposalStatus, "none");
  assert.ok(result.notice?.includes("removed"));
});

test("stale pending proposals and approved proposals without a matching saved plan are downgraded", () => {
  const stale = mutateSerialized(value => { value.proposalFingerprint = "outdated"; value.proposalStatus = "pending"; });
  assert.equal(restoreHouseholdState(stale, now).state.proposalStatus, "none");
  const unsaved = mutateSerialized(value => { value.savedPlans = []; });
  assert.equal(restoreHouseholdState(unsaved, now).state.proposalStatus, "none");
});

test("serialized numeric result injections are ignored and original inputs are recalculated", () => {
  const raw = mutateSerialized(value => {
    value.costSavingsUsd = 1_000_000;
    (value.savedPlans as Record<string, unknown>[])[0].proposed = { costUsd: -1_000_000 };
  });
  const restored = restoreHouseholdState(raw, now).state;
  const serialized = serializeHouseholdState(restored);
  assert.equal(serialized.includes("1000000"), false);
  assert.equal("proposed" in restored.savedPlans[0], false);
  assert.ok(optimizeHousehold(restored.savedPlans[0].requests, hourlyEnergy).proposed!.costUsd > 0);
});

test("restored progress derives XP and level from unique bounded events, never serialized counters", () => {
  const raw = mutateSerialized(value => {
    const training = value.training as HouseholdState["training"];
    training.bubbles.xp = 999_999;
    training.bubbles.level = 999;
    training.bubbles.rewardedKeys.push(training.bubbles.rewardedKeys[0]);
  });
  const result = restoreHouseholdState(raw, now);
  assert.equal(result.state.training.bubbles.xp, 50);
  assert.equal(result.state.training.bubbles.level, 2);
});

test("training history is bounded without forgetting reward deduplication", () => {
  let state = createInitialHouseholdState(now);
  for (let i = 0; i < 45; i++) state = awardTraining(state, ["evie"], `meaningful:${i}`, `Lesson ${i}`, now);
  assert.equal(state.training.evie.history.length, 40);
  assert.equal(state.training.evie.rewardedKeys.length, 45);
  assert.equal(awardTraining(state, ["evie"], "meaningful:0", "Repeated old action", later).training.evie.xp, 1125);
  assert.ok(serializeHouseholdState(state).length < 300_000);
});

test("unsafe histories and unknown message roles fail safely, prototype keys are never merged", () => {
  const invalid = mutateSerialized(value => { (value.messages as Record<string, unknown>[])[0].role = "admin"; });
  assert.ok(restoreHouseholdState(invalid, now).notice);
  const malicious = serializeHouseholdState(savedState()).replace('"version":1', '"version":1,"__proto__":{"polluted":true}');
  const restored = restoreHouseholdState(malicious, now);
  assert.equal(Object.prototype.hasOwnProperty.call(restored.state, "__proto__"), false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("pending proposals survive canonical object reordering but not changed planning inputs", () => {
  const state = savedState();
  state.proposalStatus = "pending";
  const reordered = JSON.parse(serializeHouseholdState(state)) as HouseholdState;
  reordered.requests = reordered.requests.map(request => ({ baselineStartHour: request.baselineStartHour,
    startWindow: { latestHour: request.startWindow.latestHour, earliestHour: request.startWindow.earliestHour },
    appliance: request.appliance }));
  const valid = restoreHouseholdState(JSON.stringify(reordered), now);
  assert.equal(valid.state.proposalStatus, "pending");
  assert.equal(valid.state.proposalFingerprint, planningFingerprint(state));
  reordered.requests[0].startWindow.earliestHour = 25;
  const revised = restoreHouseholdState(JSON.stringify(reordered), now);
  assert.equal(revised.state.proposalStatus, "none");
  assert.ok(revised.notice);
});

test("progress reaches its bounded cap without allowing forgotten rewards to farm XP", () => {
  let state = createInitialHouseholdState(now);
  for (let index = 0; index < 260; index++)
    state = awardTraining(state, ["evie"], `event:${index}`, "Meaningful learning activity", now);
  assert.equal(state.training.evie.rewardedKeys.length, 256);
  assert.equal(state.training.evie.xp, 6400);
  assert.equal(state.training.evie.level, 4);
  assert.equal(awardTraining(state, ["evie"], "new-event", "Another event", later), state);
});

test("long legitimate histories serialize within the load limit and retain the newest context", () => {
  let state = createInitialHouseholdState(now);
  for (let index = 0; index < 256; index++)
    state = awardTraining(state, ["evie", "bubbles", "chill"], `unique:${index}`, "Learning about household energy. ".repeat(10), now);
  state.messages = Array.from({ length: 80 }, (_, index) => ({ id: `message:${index}`, role: "user", at: now, text: `Message ${index} ` + "x".repeat(2990) }));
  const serialized = serializeHouseholdState(state);
  assert.ok(serialized.length <= 300_000);
  const restored = restoreHouseholdState(serialized, now);
  assert.equal(restored.notice, null);
  assert.equal(restored.state.messages.at(-1)?.id, "message:79");
  assert.equal(restored.state.training.evie.xp, 6400);
});
