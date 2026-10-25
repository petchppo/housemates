import * as messageHousehold from "../src/domain/message-household";
import * as optimization from "../src/domain/household-optimization";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as demo from "../src/domain/demo";
import * as activity from "../src/domain/demo-activity";
import * as simulation from "../src/domain/simulation";
import * as commands from "../src/domain/demo-commands";
import * as locations from "../src/domain/weather-location";
import * as weather from "../src/domain/demo-weather";
import * as catalog from "../src/domain/applimon-catalog";
import * as grid from "../src/data/demo-grid";
import * as landmarks from "../src/data/city-landmarks";
import type { ApplianceId } from "../src/domain/appliances";

type Element = { type: unknown; props: Record<string, unknown> };
const jsx = (type: unknown, props: Element["props"]): Element => ({ type, props });
const Chat = () => null, Messages = () => null, Child = () => null;
const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/demo-home-dashboard.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  return node && typeof node === "object" && "props" in node ? text((node as Element).props.children) : "";
}

type DispatchOptions = { origin: "web" | "imessage"; source?: "text" | "voice"; signal?: AbortSignal; messageId?: string };
function dashboard() {
  const scenario = demo.buildDemoScenario({ ...demo.DEFAULT_DEMO_PROFILE, applianceIds: ["evie", "bubbles", "chill"], weatherMode: "synthetic" });
  let session = commands.createDemoCommandSession(scenario), tree: Element;
  let stateIndex = 0, refIndex = 0, context = "", lastPlannerReply = "";
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  const dispatches: { id: ApplianceId; text: string; options: DispatchOptions }[] = [];
  const events: string[] = [];
  const outbound = [{ id: "web-turn-fixture", applianceId: "evie", text: "Hello", reply: "Hello there", source: "openai" }];
  const views = Object.fromEntries(["evie", "bubbles", "chill"].map(id => [id, { marker: id, messages: [], pending: false }]));
  const result = { reply: "An exact shared response", source: "openai" };
  const pendingResult = Promise.resolve(result);
  let planner!: (id: ApplianceId, text: string, source: "text" | "voice") => string | undefined;
  const controller = () => ({ session, ready: true, messages: [], storageNotice: "",
    send(id: ApplianceId, input: string, source: "text" | "voice") {
      events.push(`send:${id}:${source}`);
      const next = commands.requestDemoCommand(session, scenario, id, input); session = next.session; lastPlannerReply = next.reply; return next.reply;
    },
    approve(id: string) { events.push("approve"); session = commands.approveDemoCommand(session, scenario, id).session; },
    reject() { events.push("reject"); session = commands.rejectDemoCommand(session, scenario).session; },
    reset() { events.push("reset"); session = commands.resetDemoCommandSession(session, scenario); },
    pause() {}, finishSimulation() {},
  });
  const modules: Record<string, unknown> = {
    "@/domain/household-optimization": optimization, "./household-optimizer": { HouseholdOptimizer: Child },
    "@/domain/message-household": messageHousehold, "@/domain/demo": demo, "@/domain/demo-activity": activity, "@/domain/simulation": simulation,
    "@/domain/demo-commands": commands, "@/domain/weather-location": locations, "@/domain/demo-weather": weather,
    "@/domain/applimon-catalog": catalog, "@/data/demo-grid": grid, "@/data/city-landmarks": landmarks,
    "./household-scene-3d": { HouseholdScene3D: Child }, "./appliance-chat": { ApplianceChat: Chat },
    "./messages-connection": { MessagesConnection: Messages }, "./applimon-team-panel": { ApplimonTeamPanel: Child },
    "./pixel-appliance": { PixelAppliance: Child }, "./applimon-sprite": { ApplimonSprite: Child },
    "./use-demo-commands": { useDemoCommands: controller },
    "./use-household-conversation": { useHouseholdConversation(key: string, callback: typeof planner) {
      context = key; planner = callback;
      return {
        dispatch(id: ApplianceId, input: string, options: DispatchOptions) { dispatches.push({ id, text: input, options }); return pendingResult; },
        forCharacter(id: ApplianceId) { return views[id]; }, outboundTurns: outbound,
        invalidate() { events.push("invalidate"); },
      };
    } },
  };
  const testModule = { exports: {} };
  runInNewContext(source, { module: testModule, exports: testModule.exports,
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return {
        useState(initial: unknown) { const index = stateIndex++; if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial; return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
        useRef(initial: unknown) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
        useEffect() {},
      };
      if (name.endsWith(".css")) return {};
      if (name in modules) return modules[name];
      throw new Error(name);
    },
  });
  const Component = (testModule.exports as { DemoHomeDashboard: (props: unknown) => Element }).DemoHomeDashboard;
  function render() { stateIndex = refIndex = 0; tree = Component({ scenario, mode: "cost", notice: "", onEdit() {} }); }
  function component(type: unknown) { const element = elements(tree).find(node => node.type === type); assert.ok(element); return element; }
  function find(predicate: (element: Element) => boolean) { const element = elements(tree).find(predicate); assert.ok(element); return element; }
  render();
  return { render, component, find, dispatches, events, outbound, views, result, pendingResult,
    planner: (id: ApplianceId, input: string, source: "text" | "voice") => planner(id, input, source), session: () => session, context: () => context, lastPlannerReply: () => lastPlannerReply };
}

test("web, reviewed voice and iMessage share one dispatcher without a direct planner-send bypass", async () => {
  const h = dashboard();
  const send = h.component(Chat).props.onSend as (text: string, source: "text" | "voice") => void;
  send("Find a cheaper plan", "text");
  send("Review my spoken request", "voice");
  const signal = new AbortController().signal;
  const phone = h.component(Messages).props.onCommand as (id: ApplianceId, text: string, options: { signal: AbortSignal; messageId: string }) => Promise<unknown>;
  const returned = phone("chill", "Hello from my phone", { signal, messageId: "verified-message-fixture" });
  assert.equal(returned, h.pendingResult, "transport must await the exact controller result");
  assert.equal(await returned, h.result);
  assert.equal(h.dispatches.length, 3);
  assert.equal(h.dispatches[0].id, "evie");
  assert.equal(h.dispatches[0].options.origin, "web");
  assert.equal(h.dispatches[0].options.source, "text");
  assert.equal(h.dispatches[1].options.source, "voice");
  assert.equal(h.dispatches[2].id, "chill");
  assert.equal(h.dispatches[2].text, "Hello from my phone");
  assert.equal(h.dispatches[2].options.origin, "imessage");
  assert.equal(h.dispatches[2].options.signal, signal);
  assert.equal(h.dispatches[2].options.messageId, "verified-message-fixture");
  assert.deepEqual(h.events, [], "transport/UI callbacks cannot invoke planner or approval independently");
  assert.equal(h.session().status, "idle");
});

test("controlled per-character conversation and completed outbound turns retain exact identity", () => {
  const h = dashboard();
  assert.equal(h.component(Chat).props.conversation, h.views.evie);
  assert.equal(h.component(Messages).props.outboundTurns, h.outbound);
  (h.component(Chat).props.onSelect as (id: ApplianceId) => void)("bubbles"); h.render();
  assert.equal(h.component(Chat).props.conversation, h.views.bubbles);
  (h.component(Chat).props.onSend as (text: string, source: string) => void)("Hello Bubbles", "text");
  assert.equal(h.dispatches[0].id, "bubbles");
  assert.equal(h.component(Messages).props.outboundTurns, h.outbound);
});

test("controller planner callback preserves exact computed reply; approval, rejection, reset and mode changes invalidate first", () => {
  const h = dashboard();
  const reply = h.planner("evie", "Find a cheaper plan", "voice");
  assert.equal(typeof reply, "string");
  assert.equal(reply, h.lastPlannerReply(), "shared controller receives the exact computed planner response");
  assert.deepEqual(h.events, ["send:evie:voice"]);
  assert.ok(h.session().pending);
  h.render(); h.events.length = 0;
  (h.component(Chat).props.onReject as (id: string) => void)(h.session().pending!.id);
  assert.deepEqual(h.events, ["invalidate", "reject"]);
  h.planner("evie", "Find a cheaper plan", "text"); h.render(); h.events.length = 0;
  const approvedId = h.session().pending!.id;
  (h.component(Chat).props.onApprove as (id: string) => void)(approvedId); h.render();
  assert.deepEqual(h.events, ["invalidate", "approve"]);
  assert.equal(h.session().status, "running");
  assert.ok(h.context().endsWith(`:${approvedId}:running`));
  h.events.length = 0;
  const reset = h.find(node => node.type === "button" && text(node).trim() === "Start a new simulated day");
  (reset.props.onClick as () => void)(); h.render();
  assert.deepEqual(h.events, ["invalidate", "reset"]);
  assert.equal(h.session().status, "idle");
  h.events.length = 0;
  const mode = h.find(node => node.type === "select" && node.props.id === "demo-home-objective");
  (mode.props.onChange as (event: unknown) => void)({ target: { value: "carbon" } });
  assert.deepEqual(h.events, ["invalidate", "send:evie:text"]);
  assert.equal(h.session().pending?.mode, "carbon");
  assert.equal(h.dispatches.length, 0, "manual controls must not generate an unrequested AI/phone turn");
});
