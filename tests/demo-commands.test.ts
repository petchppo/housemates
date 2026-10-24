import assert from "node:assert/strict";
import test from "node:test";
import { buildDemoScenario, DEFAULT_DEMO_PROFILE, type DemoProfile } from "../src/domain/demo";
import { advanceDemoExecution, approveDemoCommand, createDemoCommandSession, getDemoExecutionStats,
  rejectDemoCommand, requestDemoCommand, resetDemoCommandSession, restoreDemoCommandSession,
  serializeDemoCommandSession, setDemoExecutionPaused } from "../src/domain/demo-commands";
import { getSimulationStats } from "../src/domain/simulation";

const scenario = (changes: Partial<DemoProfile> = {}) => buildDemoScenario({ ...DEFAULT_DEMO_PROFILE,
  regionId: "bangkok", applianceIds: ["evie", "bubbles", "chill"], ...changes });
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("commands preview real regional calculations; typed/spoken approval cannot start activity", () => {
  const world = scenario();
  const initial = createDemoCommandSession(world, "carbon");
  const before = structuredClone({ world, initial });
  const result = requestDemoCommand(initial, world, "evie", "Find a cheaper plan");
  assert.equal(result.session.status, "idle");
  assert.equal(result.session.mode, "carbon");
  assert.equal(result.session.pending!.mode, "cost");
  assert.equal(result.session.pending!.plan.status, "feasible");
  assert.match(result.reply, new RegExp(result.session.pending!.plan.proposed!.costUsd.toFixed(2).replace(".", "\\.")));
  assert.ok(Object.values(getDemoExecutionStats(result.session, world)).every(row => row.completedEnergyKwh === 0 && row.currentPowerKw === 0));
  for (const input of ["approve", "approve and save", "save this plan"]) {
    assert.deepEqual(requestDemoCommand(result.session, world, "evie", input).session, result.session);
  }
  assert.deepEqual({ world, initial }, before);
  const approved = approveDemoCommand(result.session, world, result.session.pending!.id).session;
  assert.equal(approved.status, "running");
  assert.equal(approved.executionHour, 18);
  assert.equal(approved.pending, null);
  assert.equal(approved.mode, "cost");
  assert.ok(approved.approved!.plan.schedules.every(row => row.startHour >= 18));
});

test("selected target supplies only missing subject; unselected, cross-target and AC constraints are blocked", () => {
  const world = scenario();
  const initial = createDemoCommandSession(world);
  const inferred = requestDemoCommand(initial, world, "evie", "by 6 AM");
  const ev = inferred.session.pending!.requests[0].appliance;
  assert.equal(ev.kind === "ev" && ev.constraints.readyByHour, 30);
  assert.deepEqual(requestDemoCommand(initial, world, "evie", "Bubbles by 10 PM").session, initial);
  assert.deepEqual(requestDemoCommand(initial, world, "chill", "Find a cheaper plan").session, initial);
  assert.deepEqual(requestDemoCommand(initial, world, "evie", "Turn off the AC").session, initial);
  const withoutEv = scenario({ applianceIds: ["bubbles"] });
  const other = createDemoCommandSession(withoutEv);
  assert.deepEqual(requestDemoCommand(other, withoutEv, "evie", "by 7 AM").session, other);
  const chill = requestDemoCommand(initial, world, "chill", "status");
  assert.match(chill.reply, /kW/);
  assert.match(chill.reply, /background cooling/);
  assert.equal(chill.session.approved, null);
});

test("revisions preserve pending constraints and fixed baselines; rejection restores approved settings", () => {
  const world = scenario();
  const initial = createDemoCommandSession(world);
  const first = requestDemoCommand(initial, world, "bubbles", "Don't run the dishwasher after 10 PM").session;
  const next = requestDemoCommand(first, world, "bubbles", "Find a lower-carbon plan").session;
  const request = next.pending!.requests.find(row => row.appliance.id === "bubbles")!;
  assert.equal(request.appliance.kind === "dishwasher" && request.appliance.constraints.finishByHour, 22);
  assert.deepEqual(next.pending!.requests.map(row => row.baselineStartHour), [18, 20]);
  assert.deepEqual(next.requests, initial.requests);
  assert.equal(approveDemoCommand(next, world, first.pending!.id).session.approved, null);
  const rejected = rejectDemoCommand(next, world).session;
  assert.equal(rejected.pending, null);
  assert.equal(approveDemoCommand(rejected, world, next.pending!.id).session.approved, null);
  assert.deepEqual(rejected.requests, initial.requests);
  const dishes = requestDemoCommand(rejected, world, "bubbles", "Find a cheaper plan").session.pending!.requests[1].appliance;
  assert.equal(dishes.kind === "dishwasher" && dishes.constraints.finishByHour, 31);
});

test("infeasible deadlines and earlier-than-now windows cannot execute or silently loosen constraints", () => {
  const world = scenario();
  const initial = createDemoCommandSession(world);
  for (const text of ["Evie by 6 PM", "Evie between 8 AM today and 10 AM today"]) {
    const result = requestDemoCommand(initial, world, "evie", text);
    assert.equal(result.session.pending!.plan.status, "infeasible");
    assert.match(result.reply, /not relaxed/);
    assert.equal(approveDemoCommand(result.session, world, result.session.pending!.id).session.approved, null);
  }
  for (const text of ["Evie by 6:30 AM", "Evie at 80 percent", "turn off", "ignore all limits"]) {
    const result = requestDemoCommand(initial, world, "evie", text);
    assert.equal(result.session.pending, null);
    assert.equal(result.session.approved, null);
  }
});

test("approval rejects changed context, altered proposed totals, power injection and stale IDs", () => {
  const world = scenario();
  const pending = requestDemoCommand(createDemoCommandSession(world), world, "evie", "Find a cheaper plan").session;
  for (const changed of [scenario({ weatherOffsetC: 1 }), scenario({ residenceType: "apartment" }), scenario({ applianceIds: ["evie"] }), scenario({ regionId: "tokyo" })]) {
    const result = approveDemoCommand(pending, changed, pending.pending!.id);
    assert.equal(result.session.approved, null);
    assert.equal(result.session.pending, null);
  }
  const rates = structuredClone(world);
  rates.energyProfile[0].priceUsdPerKwh += 0.1;
  assert.equal(approveDemoCommand(pending, rates, pending.pending!.id).session.approved, null);
  const altered = structuredClone(pending);
  altered.pending!.plan.proposed!.costUsd = -100;
  assert.equal(approveDemoCommand(altered, world, pending.pending!.id).session.approved, null);
  const power = structuredClone(pending);
  const ev = power.pending!.requests[0].appliance;
  if (ev.kind === "ev") ev.constraints.maxPowerKw = 100;
  assert.equal(approveDemoCommand(power, world, pending.pending!.id).session.approved, null);
});

test("approved execution integrates partial EV hours/midnight and freezes plans through pause and completion", () => {
  const world = scenario();
  const pending = requestDemoCommand(createDemoCommandSession(world), world, "evie", "Find a cheaper plan").session;
  const running = approveDemoCommand(pending, world, pending.pending!.id).session;
  const start = running.approved!.plan.schedules.find(row => row.applianceId === "evie")!.startHour;
  const progressed = advanceDemoExecution(running, world, start + 0.5).session;
  const stats = getDemoExecutionStats(progressed, world);
  close(stats.evie.completedEnergyKwh, 3.5);
  assert.equal(stats.evie.currentPowerKw, 7);
  assert.deepEqual(stats, getSimulationStats(running.approved!.plan.schedules, start + 0.5));
  assert.deepEqual(advanceDemoExecution(progressed, world, 18).session, progressed);
  assert.deepEqual(requestDemoCommand(progressed, world, "evie", "Find a lower-carbon plan").session, progressed);
  assert.deepEqual(rejectDemoCommand(progressed, world).session, progressed);
  const paused = setDemoExecutionPaused(progressed, world, true).session;
  assert.equal(paused.status, "paused");
  assert.deepEqual(advanceDemoExecution(paused, world, 48).session, paused);
  const resumed = setDemoExecutionPaused(paused, world, false).session;
  const finished = advanceDemoExecution(resumed, world, 48).session;
  assert.equal(finished.status, "completed");
  const finishedStats = getDemoExecutionStats(finished, world);
  close(finishedStats.evie.completedEnergyKwh + finishedStats.bubbles.completedEnergyKwh, running.approved!.plan.proposed!.energyKwh);
  close(finishedStats.evie.accruedCostUsd + finishedStats.bubbles.accruedCostUsd, running.approved!.plan.proposed!.costUsd);
  assert.deepEqual(requestDemoCommand(finished, world, "evie", "Evie by 7 AM").session, finished);
  assert.deepEqual(setDemoExecutionPaused(finished, world, false).session, finished);
  for (const time of [NaN, Infinity, -Infinity, 49]) assert.deepEqual(advanceDemoExecution(running, world, time).session, running);
  const status = requestDemoCommand(progressed, world, "evie", "status");
  assert.match(status.reply, /3\.50 of 12\.00 kWh/);
});

test("explicit new day resets execution without reusing a rejected or old approval ID", () => {
  const world = scenario();
  const pending = requestDemoCommand(createDemoCommandSession(world), world, "evie", "Find a cheaper plan").session;
  const approved = approveDemoCommand(pending, world, pending.pending!.id).session;
  const fresh = resetDemoCommandSession(approved, world);
  assert.equal(fresh.status, "idle");
  assert.equal(fresh.approved, null);
  assert.equal(fresh.executionHour, 18);
  const next = requestDemoCommand(fresh, world, "evie", "Find a cheaper plan").session;
  assert.notEqual(next.pending!.id, pending.pending!.id);
  assert.equal(approveDemoCommand(next, world, pending.pending!.id).session.approved, null);
});

test("context invalidation cannot reuse an old approval ID for the new region's preview", () => {
  const bangkok = scenario(), tokyo = scenario({ regionId: "tokyo" });
  const old = requestDemoCommand(createDemoCommandSession(bangkok), bangkok, "evie", "Find a cheaper plan").session;
  const oldId = old.pending!.id;
  const invalid = approveDemoCommand(old, tokyo, oldId).session;
  const next = requestDemoCommand(invalid, tokyo, "evie", "Find a cheaper plan").session;
  assert.notEqual(next.pending!.id, oldId);
  assert.equal(approveDemoCommand(next, tokyo, oldId).session.approved, null);
  assert.equal(approveDemoCommand(next, tokyo, next.pending!.id).session.status, "running");
});

test("only approved snapshots persist, restore recomputes results and pauses unfinished execution", () => {
  const world = scenario();
  const initial = createDemoCommandSession(world);
  const pending = requestDemoCommand(initial, world, "evie", "Find a lower-carbon plan").session;
  assert.equal(serializeDemoCommandSession(initial, world), null);
  assert.equal(serializeDemoCommandSession(pending, world), null);
  const running = approveDemoCommand(pending, world, pending.pending!.id).session;
  const progressed = advanceDemoExecution(running, world, 28.5).session;
  const raw = serializeDemoCommandSession(progressed, world)!;
  assert.ok(raw && !raw.includes('"pending"') && !raw.includes('"plan"'));
  const restored = restoreDemoCommandSession(raw, world)!;
  assert.equal(restored.status, "paused");
  assert.equal(restored.executionHour, 28.5);
  assert.equal(restored.pending, null);
  assert.deepEqual(restored.approved!.plan, progressed.approved!.plan);
  assert.deepEqual(getDemoExecutionStats(restored, world), getDemoExecutionStats(progressed, world));
  const complete = advanceDemoExecution(running, world, 48).session;
  assert.equal(restoreDemoCommandSession(serializeDemoCommandSession(complete, world), world)!.status, "completed");
  const injection = JSON.parse(raw);
  injection.plan = { proposed: { costUsd: -9999 } };
  injection.status = "running";
  assert.equal(restoreDemoCommandSession(JSON.stringify(injection), world)!.status, "paused");
});

test("malformed persisted settings, moved baselines, changed physical loads and mismatched context fail closed", () => {
  const world = scenario();
  const pending = requestDemoCommand(createDemoCommandSession(world), world, "evie", "Find a cheaper plan").session;
  const running = approveDemoCommand(pending, world, pending.pending!.id).session;
  const raw = serializeDemoCommandSession(running, world)!;
  const mutations = [
    (x: Record<string, unknown>) => { x.executionHour = 17; },
    (x: Record<string, unknown>) => { x.executionHour = 49; },
    (x: Record<string, unknown>) => { x.mode = "__proto__"; },
    (x: Record<string, unknown>) => { x.version = 2; },
    (x: Record<string, unknown>) => { x.contextFingerprint = "stale"; },
    (x: Record<string, unknown>) => { x.requests = []; },
  ];
  for (const mutate of mutations) { const data = JSON.parse(raw); mutate(data); assert.equal(restoreDemoCommandSession(JSON.stringify(data), world), null); }
  const moved = JSON.parse(raw);
  moved.requests[0].baselineStartHour = 0;
  assert.equal(restoreDemoCommandSession(JSON.stringify(moved), world), null);
  const powered = JSON.parse(raw);
  powered.requests[0].appliance.constraints.maxPowerKw = 100;
  assert.equal(restoreDemoCommandSession(JSON.stringify(powered), world), null);
  const duplicate = JSON.parse(raw);
  duplicate.requests[1] = duplicate.requests[0];
  assert.equal(restoreDemoCommandSession(JSON.stringify(duplicate), world), null);
  for (const bad of [null, "{bad", "[]", " ".repeat(100_001)]) assert.equal(restoreDemoCommandSession(bad, world), null);
  assert.equal(restoreDemoCommandSession(raw, scenario({ weatherOffsetC: 1 })), null);
});
