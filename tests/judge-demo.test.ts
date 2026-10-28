import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as demo from "../src/domain/demo";
import * as commands from "../src/domain/demo-commands";
import * as contract from "../src/domain/dialogue-contract";
import * as tradeoffs from "../src/domain/plan-tradeoffs";
import * as optimization from "../src/domain/household-optimization";
import * as catalog from "../src/domain/applimon-catalog";

type Element = { type: unknown; props: Record<string, unknown> };
type ChartProps = { comparison: tradeoffs.PlanTradeoffs; onPropose: (mode: "cost" | "carbon" | "balanced") => void; disabled: boolean };
const jsx = (type: unknown, props: Element["props"]): Element => ({ type, props });
const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/judge-demo.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join(" ");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
function harness(publicDemo = false) {
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  const memos: { deps: unknown[]; value: unknown }[] = [], effects: { deps: unknown[]; cleanup?: () => void }[] = [], pending: (() => void)[] = [];
  const timers = new Map<number, () => void>();
  const assistantRequests: string[] = [];
  const requests: { url: string; init: RequestInit; resolve: (response: Response) => void; reject: (error: Error) => void }[] = [];
  let si = 0, ri = 0, mi = 0, ei = 0, writes = 0, timerId = 0, tree: Element;
  const assistant: { suggestion: contract.DialogueSuggestion | null; message: string; loading: boolean; request: (value: string) => Promise<void>; clear: () => void } = {
    suggestion: null, message: "", loading: false, request: async (value: string) => { assistantRequests.push(value); }, clear: () => { assistant.suggestion = null; assistant.message = ""; },
  };
  const react = {
    useState(initial: unknown) { const i = si++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], (value: unknown) => { states[i] = typeof value === "function" ? value(states[i]) : value; writes++; }]; },
    useRef(initial: unknown) { const i = ri++; return refs[i] ?? (refs[i] = { current: initial }); },
    useMemo(fn: () => unknown, deps: unknown[]) { const i = mi++, old = memos[i]; if (!old || deps.some((dep, j) => dep !== old.deps[j])) memos[i] = { deps, value: fn() }; return memos[i].value; },
    useEffect(fn: () => void | (() => void), deps: unknown[]) { const i = ei++, old = effects[i]; if (!old || deps.some((dep, j) => dep !== old.deps[j])) pending.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() || undefined }; }); },
  };
  const modules: Record<string, unknown> = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": "link",
    "@/domain/demo": demo, "@/domain/demo-commands": commands, "@/domain/dialogue-contract": contract, "@/domain/plan-tradeoffs": tradeoffs,
    "@/domain/household-optimization": optimization, "@/domain/applimon-catalog": catalog,
    "./household-optimizer": { HouseholdOptimizer: "optimizer" },
    "./cost-carbon-tradeoff": { CostCarbonTradeoff: "chart" }, "./pixel-appliance": { PixelAppliance: "portrait" },
    "./use-judge-dialogue": { useJudgeDialogue: () => assistant },
  };
  const storage = { getItem() { throw Error("Judge must not read household storage"); }, setItem() { throw Error("Judge must not write household storage"); }, removeItem() { throw Error("Judge must not clear household storage"); } };
  const fixtureModule = { exports: {} };
  runInNewContext(source, { module: fixtureModule, exports: fixtureModule.exports, AbortController,
    localStorage: storage, window: { localStorage: storage },
    setTimeout: (fn: () => void) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
    fetch: (url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => requests.push({ url, init, resolve, reject })),
    require: (name: string) => { if (name.endsWith(".css")) return {}; if (name in modules) return modules[name]; throw Error(name); },
  });
  const Component = (fixtureModule.exports as { JudgeDemo: (props: { publicDemo: boolean }) => Element }).JudgeDemo;
  function render() { si = ri = mi = ei = 0; tree = Component({ publicDemo }); pending.splice(0).forEach(fn => fn()); }
  function button(label: string) { const value = nodes(tree).find(node => node.type === "button" && text(node) === label); assert.ok(value, `Missing button: ${label}`); return value; }
  function click(label: string) { const node = button(label); assert.notEqual(node.props.disabled, true); (node.props.onClick as () => void)(); render(); }
  function graph() { const chart = nodes(tree).find(node => node.type === "chart"); assert.ok(chart); return chart.props as unknown as ChartProps; }
  async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); render(); }
  render();
  return { render, click, button, graph, requests, timers, writes: () => writes, text: () => text(tree), elements: () => nodes(tree), assistant, assistantRequests, settle,
    askAI() { const ask = nodes(tree).find(node => node.type === "button" && /Ask optional/.test(text(node))); assert.ok(ask); assert.notEqual(ask.props.disabled, true); (ask.props.onClick as () => void)(); render(); },
    submit(value: string) { const input = nodes(tree).find(node => node.type === "textarea")!; (input.props.onChange as (event: unknown) => void)({ target: { value } }); render(); const form = nodes(tree).find(node => node.type === "form")!; (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); render(); },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
    fireTimers() { const fns = [...timers.values()]; timers.clear(); fns.forEach(fn => fn()); render(); },
  };
}

test("judge graph recommendations preserve a negotiated dishwasher cutoff without approval", () => {
  const h = harness(); assert.equal(h.requests.length, 0);
  h.click("Try: dishes finished by 10 PM");
  for (const row of h.graph().comparison.recommendations) {
    assert.equal(row.plan.status, "feasible");
    const dishwasher = row.plan.schedules.find(schedule => schedule.applianceId === "bubbles");
    assert.ok(dishwasher); assert.ok(dishwasher.endHour <= 22, "Every objective must retain the negotiated completion cutoff");
  }
  h.graph().onPropose("carbon"); h.render();
  assert.match(h.text(), /State:\s+idle/); assert.equal(h.button("Advance simulation 1 hour").props.disabled, true);
  assert.equal(h.button("Approve current proposal").props.disabled, false); h.unmount();
});

test("ten-appliance lab is opt-in and weather changes only its isolated planning snapshot", () => {
  const h = harness();
  const preview = () => h.elements().find(node => node.type === "optimizer")!.props as {
    active: boolean; context: optimization.CoordinatedContext;
  };
  assert.equal(preview().active, false);
  assert.equal(preview().context.inventory.length, 10);
  const original = preview().context;
  h.click("Optimize demo household");
  assert.equal(preview().active, true);
  const weather = h.elements().find(node => node.props.id === "judge-thermal-case")!;
  (weather.props.onChange as (event: unknown) => void)({ target: { value: "10" } });
  h.render();
  assert.notEqual(preview().context.contextKey, original.contextKey);
  assert.notDeepEqual(preview().context.backgroundPowerKw, original.backgroundPowerKw);
  assert.deepEqual(preview().context.energyProfile, original.energyProfile);
  assert.deepEqual(preview().context.coreRequests, original.coreRequests);
  assert.match(h.text(), /State:\s+idle/);
  assert.equal(h.button("Approve current proposal").props.disabled, true);
  assert.equal(h.requests.length, 0);
  assert.equal(h.assistantRequests.length, 0);
  h.unmount();
});

test("model suggestions and typed approval cannot execute; explicit approval and reset stay session-only", () => {
  const h = harness(); h.assistant.suggestion = { kind: "plan", mode: "carbon" }; h.assistant.message = "Review suggestion"; h.render();
  assert.equal(h.button("Approve current proposal").props.disabled, true);
  h.click("Use suggestion to create proposal"); assert.match(h.text(), /State:\s+idle/);
  h.submit("approve"); assert.match(h.text(), /State:\s+idle/);
  h.click("Approve current proposal"); assert.match(h.text(), /State:\s+running/); assert.equal(h.graph().disabled, true);
  h.click("Advance simulation 1 hour"); h.click("Reset judge session");
  assert.match(h.text(), /State:\s+idle/); assert.match(h.text(), /saved household is untouched/);
  assert.equal(h.button("Approve current proposal").props.disabled, true); assert.equal(h.requests.length, 0); h.unmount();
});

test("captured stale approval cannot approve the replacement proposal", () => {
  const h = harness(); h.graph().onPropose("cost"); h.render();
  const staleApprove = h.button("Approve current proposal").props.onClick as () => void;
  h.graph().onPropose("carbon"); h.render(); staleApprove(); h.render();
  assert.match(h.text(), /State:\s+idle/); assert.equal(h.button("Advance simulation 1 hour").props.disabled, true); h.unmount();
});

test("bridge diagnostics are explicit and late results after timeout or unmount cannot update the UI", async () => {
  const h = harness(); assert.equal(h.requests.length, 0); h.click("Check bridge reachability");
  assert.equal(h.requests[0].url, "/api/imessage/preflight"); assert.equal(h.requests[0].init.method, "POST");
  h.fireTimers(); assert.equal(h.requests[0].init.signal?.aborted, true);
  h.requests[0].resolve(Response.json({ status: "reachable" })); await h.settle();
  assert.match(h.text(), /check timed out/); assert.doesNotMatch(h.text(), /BlueBubbles is reachable/);
  h.click("Check bridge reachability"); h.unmount(); const count = h.writes();
  assert.equal(h.requests[1].init.signal?.aborted, true); assert.equal(h.timers.size, 0);
  h.requests[1].reject(Error("late abort")); for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(h.writes(), count);
});

test("judge discloses optional OpenAI text processing before an explicit request and still requires proposal review", () => {
  const h = harness();
  assert.match(h.text(), /OpenAI/); assert.match(h.text(), /text/);
  const elements = h.elements();
  const askIndex = elements.findIndex(node => node.type === "button" && /Ask optional/.test(text(node)));
  assert.ok(askIndex >= 0);
  const describedBy = elements[askIndex].props["aria-describedby"];
  assert.equal(typeof describedBy, "string");
  const disclosureIndex = elements.findIndex(node => node.props.id === describedBy);
  assert.ok(disclosureIndex >= 0 && disclosureIndex < askIndex, "Processing disclosure must appear before and describe the opt-in control");
  assert.match(text(elements[disclosureIndex]), /OpenAI/);
  assert.match(text(elements[disclosureIndex]), /text/);
  assert.match(text(elements[disclosureIndex]), /charges/);
  assert.equal(h.assistantRequests.length, 0); assert.equal(h.requests.length, 0);
  h.askAI(); assert.deepEqual(h.assistantRequests, ["Find a cheaper plan"]);
  h.assistant.suggestion = { kind: "plan", mode: "cost" };
  h.assistant.message = "OpenAI suggestion: review before creating a proposal. Your schedule has not changed."; h.render();
  assert.match(h.text(), /State:\s+idle/); assert.equal(h.button("Approve current proposal").props.disabled, true);
  h.click("Use suggestion to create proposal"); assert.match(h.text(), /State:\s+idle/);
  assert.equal(h.button("Approve current proposal").props.disabled, false);
  assert.equal(h.button("Advance simulation 1 hour").props.disabled, true);
  assert.equal(h.assistantRequests.length, 1); h.unmount();
});


test("public judge shows iMessage beta without bridge actions or network requests", () => {
  const h = harness(true);
  assert.match(h.text(), /Public phone pairing is not available/);
  assert.equal(h.elements().some(node => node.type === "button" && /Check bridge reachability/.test(text(node))), false);
  assert.equal(h.requests.length, 0);
  h.unmount();
});
