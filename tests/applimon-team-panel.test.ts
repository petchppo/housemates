import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as catalog from "../src/domain/applimon-catalog";
import * as planning from "../src/domain/applimon-planning";
import * as conversation from "../src/domain/conversation";
import * as demo from "../src/domain/demo";
import { hourlyEnergy } from "../src/data/energy";

type Element = { type: unknown; props: Record<string, unknown>; key?: string };
const jsx = (type: unknown, props: Element["props"], key?: string): Element => ({ type, props, key });
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (value && typeof value === "object" && "props" in value) return text((value as Element).props.children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** Actual component with genuine parser/planner; React keys, clocks and visibility are controlled. */
function panel(initial = [catalog.createDemoApplimon("spin"), catalog.createDemoApplimon("tumble")]) {
  let states: unknown[] = [], refs: { current: unknown }[] = [];
  let effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  const pending: (() => void)[] = [], timers = new Map<number, () => void>(), listeners = new Map<string, () => void>();
  let si = 0, ri = 0, ei = 0, timerId = 0, dirty = false, key: string | undefined, tree: Element;
  let devices = initial;
  let visible = true, aiCharacter = "spin", aiActive = true, aiClears = 0;
  const aiCalls: { character: string; text: string; plannerReply: string }[] = [];
  const ai = { status: "unconfigured", reply: null as string | null, loading: false, notice: "", history: [] as {role: string; text: string}[],
    async request(value: string, plannerReply: string) { aiCalls.push({ character: aiCharacter, text: value, plannerReply }); },
    clear() { aiClears++; ai.reply = null; ai.history = []; dirty = true; },
  };
  const active: catalog.ApplimonId[][] = [];
  const document = { hidden: false, addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) };
  const react = {
    useState(initial: unknown) { const i = si++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
      return [states[i], (next: unknown) => { const value = typeof next === "function" ? next(states[i]) : next; if (!Object.is(value, states[i])) { states[i] = value; dirty = true; } }]; },
    useRef(initial: unknown) { const i = ri++; return refs[i] ?? (refs[i] = { current: initial }); },
    useMemo(calculate: () => unknown) { return calculate(); },
    useEffect(fn: () => void | (() => void), deps: unknown[]) { const i = ei++, old = effects[i];
      if (!old || deps.length !== old.deps.length || deps.some((v, j) => !Object.is(v, old.deps[j]))) pending.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() || undefined }; }); },
  };
  const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/applimon-team-panel.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source, { module: testModule, exports: testModule.exports, document, structuredClone,
    window: { setInterval: (fn: () => void) => { timers.set(++timerId, fn); return timerId; }, clearInterval: (id: number) => timers.delete(id) },
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "@/domain/applimon-catalog") return catalog;
      if (name === "@/domain/applimon-planning") return planning;
      if (name === "@/domain/conversation") return conversation;
      if (name === "@/domain/demo") return demo;
      if (name === "./use-character-dialogue") return { useCharacterDialogue: (character: string, _context: string, enabled: boolean) => { aiCharacter = character; aiActive = enabled; return ai; } };
      if (name === "./applimon-sprite") return { ApplimonSprite: "sprite" };
      if (name.endsWith(".css")) return {};
      throw Error(`Unexpected party dependency ${name}`);
    },
  });
  const component = (testModule.exports as { ApplimonTeamPanel: (props: unknown) => Element }).ApplimonTeamPanel;
  const onActiveChange = (ids: catalog.ApplimonId[]) => active.push(ids);
  function render() {
    const child = component({ devices, energyProfile: hourlyEnergy, onEdit() {}, onActiveChange, active: visible });
    if (key !== child.key) { effects.forEach(effect => effect.cleanup?.()); states = []; refs = []; effects = []; key = child.key; }
    si = ri = ei = 0; dirty = false;
    tree = (child.type as (props: Element["props"]) => Element)(child.props);
    pending.splice(0).forEach(fn => fn());
  }
  function settle() { for (let i = 0; dirty && i < 20; i++) render(); assert.equal(dirty, false, "Party state settles"); }
  function find(predicate: (node: Element) => boolean) { const node = nodes(tree).find(predicate); assert.ok(node); return node; }
  function button(label: string) { return find(node => node.type === "button" && text(node).trimStart().startsWith(label)); }
  function click(label: string) { const node = button(label); assert.notEqual(node.props.disabled, true); (node.props.onClick as () => void)(); settle(); }
  render(); settle();
  return { click, button, active, timers, document, listeners, ai, aiCalls, get aiClears() { return aiClears; }, get aiActive() { return aiActive; }, refresh() { render(); settle(); }, setVisible(value: boolean) { visible = value; render(); settle(); }, text: () => text(tree).replace(/\s+/g, " "),
    command(value: string) { const input = find(node => node.props.id === "party-message"); (input.props.onChange as (event: unknown) => void)({ target: { value } }); settle();
      const form = find(node => node.type === "form"); (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); settle(); },
    replace(next: catalog.ApplimonDevice[]) { devices = next; render(); settle(); },
    tick() { [...timers.values()].forEach(fn => fn()); settle(); },
    hide() { document.hidden = true; listeners.get("visibilitychange")?.(); settle(); },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
  };
}

test("expanded party projects immediately but text approval cannot start tasks", () => {
  const ui = panel();
  assert.match(ui.text(), /PROJECTED PARTY PLAN/); assert.equal(ui.timers.size, 0);
  ui.command("approve"); assert.equal(ui.timers.size, 0); assert.match(ui.text(), /message never starts/);
  ui.click("Approve party simulation"); assert.match(ui.text(), /APPROVED PARTY RUN/); assert.equal(ui.timers.size, 1);
  ui.hide(); assert.equal(ui.timers.size, 0); assert.match(ui.text(), /Resume party simulation/);
  ui.unmount();
});

test("operating-window requests are allowed, cross-appliance text cannot silently edit the selected teammate", () => {
  const ui = panel();
  ui.command("start between 9 AM and 4 PM");
  assert.match(ui.text(), /starts 9 ?– ?16/); assert.doesNotMatch(ui.text(), /A message never starts/);
  ui.command("Rover finish by 8 PM");
  assert.match(ui.text(), /(?:select|selected|switch|different|Rover)/i);
  assert.match(ui.text(), /starts 9 ?– ?16/);
  assert.match(ui.text(), /finishes by hour 22/);
  ui.unmount();
});

test("an impossible deadline disables approval until a feasible revision", () => {
  const ui = panel(); ui.command("finish by 8 AM today");
  assert.equal(ui.button("Approve party simulation").props.disabled, true);
  assert.equal(ui.timers.size, 0); assert.match(ui.text(), /cannot fit|No full|deadline/i);
  ui.command("finish by 10 PM"); assert.equal(ui.button("Approve party simulation").props.disabled, false);
  ui.unmount();
});

test("fast-forward completes actual approved ledger totals and status reports calculated usage", () => {
  const devices = [catalog.createDemoApplimon("spin"), catalog.createDemoApplimon("tumble")];
  const expected = planning.optimizeApplimonTeam(devices, hourlyEnergy, "cost"); assert.ok(expected.proposed);
  const ui = panel(devices); ui.click("Approve party simulation"); ui.click("Finish simulated tasks");
  assert.equal(ui.timers.size, 0); assert.match(ui.text(), /COMPLETED SIMULATION/);
  assert.ok(ui.text().includes(`${expected.proposed.energyKwh.toFixed(2)} kWh executed`));
  assert.ok(ui.text().includes(`$ ${expected.proposed.costUsd.toFixed(2)} accrued`));
  assert.ok(ui.text().includes(`${(expected.proposed.carbonGrams/1000).toFixed(3)} kg modeled`));
  ui.command("Status"); assert.match(ui.text(), /Spin: complete/);
  ui.unmount();
});

test("recruitment and reviewed-spec changes remount the party, clear old approval and stop its clock", () => {
  const devices = [catalog.createDemoApplimon("spin")], ui = panel(devices);
  ui.click("Approve party simulation"); assert.equal(ui.timers.size, 1);
  ui.replace([...devices, catalog.createDemoApplimon("frost")]);
  assert.equal(ui.timers.size, 0); assert.match(ui.text(), /PROJECTED PARTY PLAN/); assert.doesNotMatch(ui.text(), /APPROVED PARTY RUN/);
  assert.equal(ui.button("Approve party simulation").props.disabled, false);
  ui.click("Approve party simulation");
  ui.replace([{ ...devices[0], energyKwh: .6 }, catalog.createDemoApplimon("frost")]);
  assert.equal(ui.timers.size, 0); assert.match(ui.text(), /PROJECTED PARTY PLAN/);
  assert.equal(ui.active.at(-1)?.length, 0); ui.unmount();
});


test("all expanded characters share Send, retain deterministic facts and never infer approval from AI", () => {
  const ids = ["spin", "tumble", "ember", "misty", "rover", "frost", "breeze"] as const;
  const ui = panel(ids.map(id => catalog.createDemoApplimon(id))); ui.ai.status = "configured"; ui.refresh();
  assert.match(ui.text(), /Local reply · AI ready/);
  assert.doesNotMatch(ui.text(), /Smart Timing · cost|Clean Shift · carbon/);
  assert.match(ui.text(), /Chat options/);
  for (const id of ids) {
    ui.click(catalog.getApplimon(id).name); ui.command("Hi, tell me about yourself");
    assert.equal(ui.aiCalls.at(-1)?.character, id); assert.ok(ui.aiCalls.at(-1)?.plannerReply);
    assert.equal(ui.timers.size, 0);
  }
  ui.ai.reply = "Happy to help with your household rhythm!"; ui.refresh();
  assert.match(ui.text(), /AI dialogue · simulated/); assert.match(ui.text(), /Happy to help/); assert.match(ui.text(), /Planner details/);
  ui.command("approve"); assert.equal(ui.timers.size, 0); assert.match(ui.aiCalls.at(-1)!.plannerReply, /message never starts/);
  ui.click("Approve party simulation"); assert.equal(ui.ai.reply, null); assert.equal(ui.timers.size, 1);
  ui.setVisible(false); assert.equal(ui.aiActive, false); assert.equal(ui.timers.size, 1, "Closing the modal must cancel only AI, not deterministic execution");
  const count = ui.aiCalls.length; ui.command("Hello again"); assert.equal(ui.aiCalls.length, count);
  ui.unmount();
});

test("expanded fallback keeps API disclosure and planner details when provider fails", () => {
  const ui = panel(); ui.ai.status = "configured"; ui.ai.notice = "AI unavailable; local reply shown."; ui.refresh();
  ui.command("Find a cheaper plan"); assert.equal(ui.aiCalls.length, 1); assert.match(ui.aiCalls[0].plannerReply, /kWh/);
  assert.match(ui.text(), /Local fallback · simulated/); assert.match(ui.text(), /API charges may apply/); assert.match(ui.text(), /Planner details/);
  assert.equal(ui.timers.size, 0); ui.unmount();
});
