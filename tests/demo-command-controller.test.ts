import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as commands from "../src/domain/demo-commands";
import { buildDemoScenario, DEFAULT_DEMO_PROFILE, type DemoScenario } from "../src/domain/demo";
import type { OptimizationMode } from "../src/domain/scheduling";
import type { useDemoCommands } from "../src/components/use-demo-commands";

type Controller = ReturnType<typeof useDemoCommands>;
const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/use-demo-commands.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const makeWorld = () => buildDemoScenario({ ...DEFAULT_DEMO_PROFILE, regionId: "bangkok", applianceIds: ["evie", "bubbles", "chill"] });

/** Execute the actual hook with real domain functions; only React/browser scheduling and storage are doubles. */
function harness(options: { initial?: string | null; readFail?: boolean; writeFail?: boolean; removeFail?: boolean } = {}) {
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  const memos: { deps: unknown[]; value: unknown }[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  const pending: (() => void)[] = [], microtasks: (() => void)[] = [];
  const timers = new Map<number, () => void>(), listeners = new Map<string, () => void>();
  let stateIndex = 0, refIndex = 0, memoIndex = 0, effectIndex = 0, timerId = 0;
  let writes = 0, reads = 0, removals = 0, intervalStarts = 0, dirty = false;
  let stored = options.initial ?? null, world = makeWorld(), mode: OptimizationMode = "cost";
  const changed = (deps: unknown[], old?: unknown[]) => !old || deps.length !== old.length || deps.some((value, index) => !Object.is(value, old[index]));
  const react = {
    useState(initial: unknown) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value: unknown) => {
        const next = typeof value === "function" ? value(states[index]) : value;
        if (!Object.is(next, states[index])) { states[index] = next; dirty = true; }
      }];
    },
    useRef(initial: unknown) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
    useMemo(factory: () => unknown, deps: unknown[]) { const index = memoIndex++; if (changed(deps, memos[index]?.deps)) memos[index] = { deps, value: factory() }; return memos[index].value; },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = effectIndex++, old = effects[index];
      if (changed(deps, old?.deps)) pending.push(() => { old?.cleanup?.(); effects[index] = { deps, cleanup: effect() || undefined }; });
    },
  };
  const document = { hidden: false, addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name) };
  const storage = {
    getItem(key: string) { assert.equal(key, "housemates-demo-execution-v1"); reads++; if (options.readFail) throw Error("blocked"); return stored; },
    setItem(key: string, value: string) { assert.equal(key, "housemates-demo-execution-v1"); if (options.writeFail) throw Error("blocked"); stored = value; writes++; },
    removeItem(key: string) { assert.equal(key, "housemates-demo-execution-v1"); if (options.removeFail) throw Error("blocked"); stored = null; removals++; },
  };
  const testModule = { exports: {} };
  runInNewContext(source, { module: testModule, exports: testModule.exports, document, localStorage: storage,
    queueMicrotask: (fn: () => void) => microtasks.push(fn),
    window: { setInterval: (fn: () => void, delay: number) => { assert.equal(delay, 500); intervalStarts++; timers.set(++timerId, fn); return timerId; },
      clearInterval: (id: number) => timers.delete(id) },
    require: (name: string) => { if (name === "react") return react; if (name === "@/domain/demo-commands") return commands; throw Error(name); },
  });
  const hook = (testModule.exports as { useDemoCommands: typeof useDemoCommands }).useDemoCommands;
  function render() {
    let result: Controller;
    let pass = 0;
    do {
      assert.ok(++pass < 20, "Hook did not settle after browser/React tasks");
      dirty = false; stateIndex = refIndex = memoIndex = effectIndex = 0;
      result = hook(world, mode);
      pending.splice(0).forEach(fn => fn());
      microtasks.splice(0).forEach(fn => fn());
    } while (dirty || pending.length || microtasks.length);
    return result!;
  }
  function tick() { const fn = timers.values().next().value; assert.ok(fn, "Expected one execution timer"); fn(); return render(); }
  return { render, tick, timers, listeners, document, world: () => world, stored: () => stored,
    writes: () => writes, reads: () => reads, removals: () => removals, intervalStarts: () => intervalStarts,
    props: (next: DemoScenario, objective = mode) => { world = next; mode = objective; },
    unmount: () => effects.forEach(effect => effect.cleanup?.()) };
}

function approve(h: ReturnType<typeof harness>) {
  let view = h.render();
  view.send("evie", "Find a cheaper plan", "text"); view = h.render();
  assert.ok(view.session.pending);
  view.approve(view.session.pending.id);
  return h.render();
}

test("actual command controller has no timer or stored transcript before approval; stable props do not reset previews", () => {
  const h = harness();
  let view = h.render();
  assert.equal(view.ready, true); assert.equal(h.writes(), 0); assert.equal(h.timers.size, 0);
  const reply = view.send("evie", "Find a cheaper plan", "voice"); view = h.render();
  assert.equal(reply, view.messages.at(-1)!.text, "Messaging adapters return the exact computed browser reply");
  const id = view.session.pending!.id;
  assert.equal(view.session.status, "idle"); assert.equal(view.messages.at(-2)!.source, "voice");
  for (let i = 0; i < 5; i++) view = h.render();
  assert.equal(view.session.pending!.id, id); assert.equal(h.reads(), 1); assert.equal(h.writes(), 0);
  view.send("evie", "approve", "voice"); view = h.render();
  assert.equal(view.session.status, "idle"); assert.equal(h.timers.size, 0);
  view.approve(id); view = h.render();
  assert.equal(view.session.status, "running"); assert.equal(h.timers.size, 1); assert.equal(h.intervalStarts(), 1);
  assert.equal(h.writes(), 1);
  const snapshot = JSON.parse(h.stored()!);
  assert.equal(snapshot.messages, undefined); assert.equal(snapshot.audio, undefined); assert.equal(snapshot.pending, undefined);
  assert.equal(h.stored()!.includes("Find a cheaper plan"), false);
  h.render(); h.render(); assert.equal(h.intervalStarts(), 1); assert.equal(h.reads(), 1);
  h.unmount(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test("actual execution timer advances monotonically, finishes once and cleans up without timer recreation per tick", () => {
  const h = harness(); let view = approve(h);
  const initialHour = view.session.executionHour;
  view = h.tick(); assert.ok(view.session.executionHour > initialHour);
  let ticks = 0;
  while (view.session.status === "running") { assert.ok(++ticks < 320); view = h.tick(); }
  assert.equal(view.session.status, "completed");
  assert.equal(h.timers.size, 0); assert.equal(h.intervalStarts(), 1);
  const finished = view.messages.filter(message => message.text.startsWith("The approved simulated sessions are complete."));
  assert.equal(finished.length, 1);
  for (const id of ["evie", "bubbles"] as const) {
    assert.equal(view.messages.filter(message => message.role === id && message.text.startsWith("My simulated task is complete:")).length, 1);
  }
  view.finishSimulation(); const again = h.render();
  assert.equal(again.messages.length, view.messages.length);
  assert.equal(again.session.executionHour, view.session.executionHour);
  h.unmount();
});

test("pause/resume and tab hiding stop the timer; foregrounding alone never resumes execution", () => {
  const h = harness(); let view = approve(h);
  view = h.tick(); const time = view.session.executionHour;
  view.pause(true); view = h.render();
  assert.equal(view.session.status, "paused"); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
  view.pause(false); view = h.render();
  assert.equal(view.session.status, "running"); assert.equal(h.timers.size, 1);
  h.document.hidden = true; h.listeners.get("visibilitychange")?.(); view = h.render();
  assert.equal(view.session.status, "paused"); assert.equal(view.session.executionHour, time);
  assert.equal(h.timers.size, 0);
  h.document.hidden = false; h.listeners.get("visibilitychange")?.(); view = h.render();
  assert.equal(view.session.status, "paused"); assert.equal(h.timers.size, 0);
  view.pause(false); h.render(); assert.equal(h.timers.size, 1);
  h.unmount(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test("approved refresh restores paused computed state and clears transcripts; explicit finish produces one completion", () => {
  const first = harness(); approve(first); const progressed = first.tick(); const stored = first.stored(); first.unmount();
  const h = harness({ initial: stored }); let view = h.render();
  assert.equal(view.session.status, "paused"); assert.equal(view.session.executionHour, progressed.session.executionHour);
  assert.equal(view.messages.length, 1); assert.equal(h.timers.size, 0); assert.equal(h.writes(), 0);
  assert.match(view.storageNotice, /paused/);
  view.finishSimulation(); view = h.render();
  assert.equal(view.session.status, "completed"); assert.equal(h.timers.size, 0);
  assert.equal(view.session.executionHour, Math.max(...view.session.approved!.plan.schedules.map(row => row.endHour)));
  const count = view.messages.length; view.finishSimulation(); view = h.render(); assert.equal(view.messages.length, count);
  h.unmount();
});

test("new-day reset erases the approved snapshot, cancels timers and prevents old approval IDs from matching", () => {
  const h = harness(); let view = approve(h); const oldId = view.session.approved!.id;
  view.reset(); view = h.render();
  assert.equal(view.session.approved, null); assert.equal(view.session.executionHour, 18);
  assert.equal(h.stored(), null); assert.equal(h.removals(), 1); assert.equal(h.timers.size, 0);
  view.send("evie", "Find a cheaper plan", "text"); view = h.render();
  assert.notEqual(view.session.pending!.id, oldId);
  view.approve(oldId); view = h.render(); assert.equal(view.session.approved, null); assert.equal(h.timers.size, 0);
  h.unmount();
});

test("blocked persistence keeps simulation usable and never claims a successful save or removal", () => {
  const h = harness({ writeFail: true, removeFail: true }); let view = approve(h);
  assert.equal(view.session.status, "running"); assert.match(view.storageNotice, /could not save/); assert.equal(h.writes(), 0);
  view = h.tick(); assert.ok(view.session.executionHour > 18);
  view.reset(); view = h.render(); assert.equal(view.session.approved, null); assert.match(view.storageNotice, /may return after refresh/);
  h.unmount();
  const blocked = harness({ readFail: true }); assert.equal(blocked.render().ready, true);
  assert.match(blocked.render().storageNotice, /unavailable/); blocked.unmount();
});

test("context changes discard mismatched saved approval and stale old-context approval callbacks cannot execute", () => {
  const h = harness();
  let view = h.render(); view.send("evie", "Find a cheaper plan", "text"); view = h.render();
  const oldId = view.session.pending!.id, oldApprove = view.approve;
  const changed = buildDemoScenario({ ...DEFAULT_DEMO_PROFILE, regionId: "tokyo", applianceIds: ["evie", "bubbles", "chill"] });
  h.props(changed); view = h.render();
  assert.equal(view.session.pending, null); assert.equal(view.session.approved, null);
  view.send("evie", "Find a cheaper plan", "text"); view = h.render();
  oldApprove(oldId); view = h.render();
  assert.equal(view.session.approved, null); assert.equal(h.timers.size, 0);
  view.approve(view.session.pending!.id); view = h.render(); assert.equal(view.session.status, "running");
  h.props(makeWorld()); view = h.render();
  assert.equal(view.session.approved, null); assert.equal(view.session.status, "idle"); assert.equal(h.timers.size, 0);
  h.unmount();
});
