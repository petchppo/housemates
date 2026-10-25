import * as messageHousehold from "../src/domain/message-household";
import * as optimization from "../src/domain/household-optimization";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
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

type Element = { type: unknown; props: Record<string, unknown>; key?: string };
const jsx = (type: unknown, props: Element["props"], key?: string): Element => ({ type, props, key });
const Scene = () => null, Chat = () => null, Party = () => null, Link = () => null, Sprite = () => null;
const Optimizer = () => null;
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
  return node && typeof node === "object" && "props" in node && !(node as Element).props["aria-hidden"] ? text((node as Element).props.children) : "";
}

/** Exercise the actual dashboard handlers against the real command/energy engine.
 * Child renderers and React scheduling are replaced, not the business decisions. */
function home(expandedOnly = false) {
  let scenario = demo.buildDemoScenario({ ...demo.DEFAULT_DEMO_PROFILE, applianceIds: expandedOnly ? [] : ["evie", "bubbles", "chill"], ...(expandedOnly ? { applimons: [catalog.createDemoApplimon("spin")] } : {}), weatherMode: "synthetic" });
  let session = commands.createDemoCommandSession(scenario), tree: Element;
  let stateIndex = 0, refIndex = 0;
  const states: unknown[] = [], refs: { current: unknown }[] = [], effects: (() => void)[] = [];
  let sends = 0, approvals = 0, edited = 0, recruited = 0;
  const controller = () => ({ session, ready: true, messages: [], storageNotice: "",
    send(id: ApplianceId, input: string) { sends++; session = commands.requestDemoCommand(session, scenario, id, input).session; },
    approve(id: string) { approvals++; session = commands.approveDemoCommand(session, scenario, id).session; },
    reject() { session = commands.rejectDemoCommand(session, scenario).session; },
    pause(paused: boolean) { session = commands.setDemoExecutionPaused(session, scenario, paused).session; },
    finishSimulation() { session = commands.advanceDemoExecution(session, scenario, 48).session; },
    reset() { session = commands.resetDemoCommandSession(session, scenario); },
  });
  const testModule = { exports: {} };
  runInNewContext(source, { module: testModule, exports: testModule.exports, structuredClone,
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return {
        useState(initial: unknown) { const index = stateIndex++; if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial; return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
        useRef(initial: unknown) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
        useEffect(effect: () => void) { effects.push(effect); },
      };
      if (name === "./use-demo-commands") return { useDemoCommands: controller };
      if (name === "./use-household-conversation") return { useHouseholdConversation: (_context: string, planner: (id: ApplianceId, value: string, source: string) => unknown) => ({
        forCharacter: () => ({ status: "unconfigured", reply: null, source: null, loading: false, notice: "", history: [] }),
        dispatch: (id: ApplianceId, value: string, options: { source?: string }) => Promise.resolve(planner(id, value, options.source ?? "text")),
        outboundTurns: [], invalidate() {},
      }) };
      if (name === "@/domain/message-household") return messageHousehold;
      if (name === "@/domain/household-optimization") return optimization;
      if (name === "./household-optimizer") return { HouseholdOptimizer: Optimizer };
      if (name === "@/domain/demo") return demo;
      if (name === "@/domain/demo-activity") return activity;
      if (name === "@/domain/simulation") return simulation;
      if (name === "@/domain/demo-commands") return commands;
      if (name === "@/domain/weather-location") return locations;
      if (name === "@/domain/demo-weather") return weather;
      if (name === "@/domain/applimon-catalog") return catalog;
      if (name === "@/data/demo-grid") return grid;
      if (name === "@/data/city-landmarks") return landmarks;
      if (name === "./household-scene-3d") return { HouseholdScene3D: Scene };
      if (name === "./appliance-chat") return { ApplianceChat: Chat };
      if (name === "./applimon-team-panel") return { ApplimonTeamPanel: Party };
      if (name === "./messages-connection") return { MessagesConnection: Link };
      if (name === "./pixel-appliance") return { PixelAppliance: Sprite };
      if (name === "./applimon-sprite") return { ApplimonSprite: Sprite };
      if (name.endsWith(".css")) return {};
      throw Error(name);
    },
  });
  const renderComponent = (testModule.exports as { DemoHomeDashboard: (props: unknown) => Element }).DemoHomeDashboard;
  let partyFocused = false, partyScrolled = false;
  const partyComposer = { focus() { partyFocused = true; }, scrollIntoView() { partyScrolled = true; } };
  const menuBody = { scrollTop: 0, querySelector(selector: string) { assert.equal(selector, "#party-message"); return partyComposer; } };
  const modal = { open: false, showModal() { this.open = true; }, close() { this.open = false; const dialog = all().find(element => element.type === "dialog")!; (dialog.props.onClose as () => void)(); } };
  function render() {
    stateIndex = refIndex = 0;
    tree = renderComponent({ scenario, mode: "cost", notice: "", onEdit: () => edited++, onAddAppliance: () => recruited++ });
    const dialog = all().find(element => element.type === "dialog")!;
    (dialog.props.ref as { current: unknown }).current = modal;
    const body = all().find(element => element.props.className === "dh-menu-body")!;
    (body.props.ref as { current: unknown }).current = menuBody;
    effects.splice(0).forEach(effect => effect());
  }
  function all() { return elements(tree); }
  function component(type: unknown) { return all().find(element => element.type === type)!; }
  function button(label: string) { return all().find(element => element.type === "button" && (element.props["aria-label"] === label || text(element).replace(/\s+/g, " ").trim() === label))!; }
  function click(label: string) { const target = button(label); assert.ok(target, label); (target.props.onClick as () => void)(); render(); }
  render();
  return { render, all, component, click, modal, replaceWeather() { scenario = demo.buildDemoScenario({ ...scenario.profile, weatherOffsetC: 5 }); render(); }, settleScenario() { session = commands.createDemoCommandSession(scenario); render(); }, session: () => session, counts: () => ({ sends, approvals, edited, recruited }), partyNavigation: () => ({ focused: partyFocused, scrolled: partyScrolled }) };
}

test("home game menus and preview scrubbing never approve or advance execution", () => {
  const h = home();
  h.click("Open quest menu"); assert.equal(h.modal.open, true);
  h.click("Solar noon"); assert.equal(h.modal.open, false);
  assert.equal(h.component(Scene).props.hour, 13);
  assert.equal(h.session().status, "idle"); assert.equal(h.counts().approvals, 0);
  h.click("Open team menu"); h.click("Close household menu");
  assert.equal(h.component(Scene).props.hour, 13);
  assert.equal(h.counts().sends, 0);
  h.click("Recruit"); assert.equal(h.counts().recruited, 1);
});

test("optimizer hides the old session while a replacement weather context is initializing", () => {
  const h = home();
  h.click("Optimize household schedule");
  const original = h.component(Optimizer).props.context as optimization.CoordinatedContext;
  h.replaceWeather();
  assert.equal(h.component(Optimizer), undefined, "Never combine new weather with old session constraints");
  assert.equal(h.all().find(node => node.props["aria-label"] === "Optimize household schedule")!.props.disabled, true);
  assert.ok(h.all().some(node => node.props.role === "status" && /Updating the household/.test(text(node))));
  h.settleScenario();
  assert.notEqual((h.component(Optimizer).props.context as optimization.CoordinatedContext).contextKey, original.contextKey);
  assert.equal(h.component(Optimizer).props.active, true);
  assert.equal(h.session().status, "idle");
  assert.equal(h.counts().approvals, 0);
});

test("Optimize opens a coordinated snapshot without executing or changing approved runs", () => {
  const h = home();
  (h.component(Scene).props.onSelect as (id: ApplianceId) => void)("bubbles"); h.render();
  (h.component(Chat).props.onSend as (text: string, source: string) => void)("Don't run the dishwasher after 10 PM", "text"); h.render();
  const proposal = h.session().pending; assert.ok(proposal);
  h.click("Optimize household schedule");
  assert.equal(h.modal.open, true);
  assert.equal(h.component(Optimizer).props.active, true);
  const context = h.component(Optimizer).props.context as optimization.CoordinatedContext;
  assert.deepEqual(context.coreRequests, proposal.requests);
  assert.equal(h.session().status, "idle"); assert.equal(h.counts().approvals, 0);
  (h.component(Chat).props.onApprove as (id: string) => void)(proposal.id); h.render();
  const approved = h.session().approved;
  h.click("Close household menu"); h.click("Optimize household schedule");
  assert.equal(h.session().approved, approved);
  assert.equal(h.counts().approvals, 1);
});

test("coordinated optimizer receives the current expanded party revision without changing recruitment", () => {
  const h = home(true);
  const revised = { ...catalog.createDemoApplimon("spin"), latestStartHour: 12, deadlineHour: 15 };
  (h.component(Party).props.onPlanningChange as (devices: catalog.ApplimonDevice[]) => void)([revised]); h.render();
  h.click("Optimize household schedule");
  const context = h.component(Optimizer).props.context as optimization.CoordinatedContext;
  assert.equal(context.inventory[0].deadlineHour, 15);
  assert.equal(context.inventory[0].latestStartHour, 12);
  assert.equal(h.counts().recruited, 0); assert.equal(h.counts().approvals, 0);
});

test("home dialogue approval follows execution while a later preview leaves that run unchanged", () => {
  const h = home();
  (h.component(Chat).props.onSend as (text: string, source: string) => void)("Find a cheaper plan", "text"); h.render();
  assert.ok(h.session().pending);
  (h.component(Chat).props.onApprove as (id: string) => void)(h.session().pending!.id); h.render();
  assert.equal(h.session().status, "running");
  const approvedHour = h.session().executionHour;
  assert.equal(h.component(Scene).props.hour, approvedHour);
  h.click("Open quest menu"); h.click("Solar noon");
  assert.equal(h.component(Scene).props.hour, 13); assert.equal(h.session().executionHour, approvedHour);
  h.click("Open quest menu"); h.click("Follow approved simulation");
  assert.equal(h.component(Scene).props.hour, approvedHour);
  assert.equal(h.counts().approvals, 1);
});

test("home menu navigation retains team selection and persistent party/messaging components", () => {
  const h = home();
  (h.component(Scene).props.onSelect as (id: ApplianceId) => void)("bubbles"); h.render();
  for (const menu of ["energy", "team", "weather", "link", "quest"]) {
    h.click(`Open ${menu} menu`);
    assert.equal(h.component(Chat).props.selected, "bubbles");
    assert.equal(h.all().filter(element => element.type === Party).length, 1);
    assert.equal(h.all().filter(element => element.type === Link).length, 1);
    h.click("Close household menu");
    assert.ok(h.component(Party)); assert.ok(h.component(Link));
  }
  assert.equal(h.counts().sends, 0); assert.equal(h.counts().approvals, 0);
});


test("expanded-only home has a direct conversation path instead of a disabled empty-party composer", () => {
  const h = home(true);
  assert.equal(h.all().some(element => element.type === Chat), false);
  assert.ok(h.all().some(element => element.props["aria-label"] === "Your recruited party is ready"));
  h.click("Talk to Spin ▸");
  assert.equal(h.modal.open, true);
  assert.deepEqual(h.partyNavigation(), { focused: true, scrolled: true });
  const panel = h.component(Party);
  assert.equal((panel.props.devices as catalog.ApplimonDevice[])[0].id, "spin");
  assert.equal(h.counts().sends, 0);
  assert.equal(h.counts().approvals, 0);
});

test("appliance selection requests camera focus only after interaction, including repeated selection", () => {
  const h = home();
  assert.equal(h.component(Scene).props.focusOnSelect, true);
  assert.equal(h.component(Scene).props.focusRequest, undefined, "initial selected teammate must not hide the overview");
  h.click("Evie");
  const first = h.component(Scene).props.focusRequest as { id: string; nonce: number };
  assert.equal(first.id, "evie");
  h.click("Evie");
  const again = h.component(Scene).props.focusRequest as { id: string; nonce: number };
  assert.equal(again.id, "evie");
  assert.ok(again.nonce > first.nonce, "same teammate can refocus after camera Reset");
  (h.component(Scene).props.onSelect as (id: ApplianceId) => void)("bubbles"); h.render();
  assert.equal((h.component(Scene).props.focusRequest as { id: string }).id, "bubbles");
  assert.equal(h.component(Chat).props.selected, "bubbles");
  (h.component(Chat).props.onSelect as (id: ApplianceId) => void)("chill"); h.render();
  assert.equal((h.component(Scene).props.focusRequest as { id: string }).id, "chill");
  assert.equal(h.counts().sends, 0);
  assert.equal(h.counts().approvals, 0);
  assert.equal(h.session().status, "idle");
});
