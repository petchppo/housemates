import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as THREE from "three";
import ts from "typescript";
import { DEMO_REGIONS } from "../src/data/demo-regions";
import { getTutorialChapter, getTutorialPrompt, type TutorialContext, type TutorialTarget } from "../src/data/tutorial-dialogue";

type Element = { type: string | ((props: Record<string, unknown>) => unknown); key?: string; props: Record<string, unknown> };
const jsx = (type: Element["type"], props: Element["props"], key?: string): Element => ({ type, props, key });
function source(file: string) {
  return ts.transpileModule(readFileSync(resolve(process.cwd(), file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

test("chapter boundaries, Chill-only guidance and every Show me target remain contextual and read-only", () => {
  const targets: TutorialTarget[] = ["region", "home", "weather", "team", "plan"];
  for (const region of DEMO_REGIONS) for (let step = 0; step < 5; step++) {
    const context: TutorialContext = Object.freeze({ step, regionId: region.id, residenceType: "apartment", applianceIds: Object.freeze(["chill"] as const) });
    const before = JSON.stringify(context);
    const chapter = getTutorialChapter(context);
    for (const page of [...chapter.pages, ...chapter.topics.flatMap(topic => topic.pages)]) {
      assert.equal(page.target, targets[step]);
      assert.doesNotMatch(page.text, /undefined|NaN/);
    }
    if (step === 4) assert.match(chapter.pages[0].text, /Add Evie or Bubbles/);
    assert.equal(JSON.stringify(context), before);
  }
  const context: TutorialContext = { step: -1, regionId: "california", residenceType: "detached", applianceIds: [] };
  assert.equal(getTutorialChapter(context).index, 0);
  assert.equal(getTutorialChapter({ ...context, step: NaN }).index, 0);
  assert.equal(getTutorialChapter({ ...context, step: 999 }).index, 4);
});

test("expanded-only teams receive contextual guidance without treating protected appliances as flexible", () => {
  const context: TutorialContext = { step: 4, regionId: "tokyo", residenceType: "apartment", applianceIds: ["spin"] };
  const flexible = getTutorialChapter(context).pages[0].text;
  assert.match(flexible, /Spin/);
  assert.match(flexible, /Choose a planning style/);
  assert.doesNotMatch(flexible, /no teammates yet|Add Evie/);
  const protectedOnly = getTutorialChapter({ ...context, applianceIds: ["frost", "ember"] }).pages[0].text;
  assert.match(protectedOnly, /Frost, Ember|Ember, Frost/);
  assert.match(protectedOnly, /fixed or protected/);
  assert.doesNotMatch(protectedOnly, /Choose a planning style/);
  assert.match(getTutorialPrompt({ ...context, step: 3 }), /team is taking shape/);
});

test("city, residence, team and chapter changes preserve the mascot's React reconciliation identity", () => {
  // Keys on any ancestor destroy descendant component instances. Walk the actual
  // JSX tree with React's key/position identity rules, including function children.
  const portrait = () => null;
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source("src/components/tutorial-npc.tsx"), {
    module: testModule, exports: testModule.exports, document: { body: {} },
    require: (name: string) => {
      if (name === "react") return { useId: () => "guide", useState: (initial: unknown) => [initial, () => {}], useEffect: () => {}, useRef: (current: unknown) => ({ current }), useSyncExternalStore: () => true };
      if (name === "react-dom") return { createPortal: (element: unknown) => element };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "./guide-mascot") return { GuideMascot: portrait };
      if (name === "@/data/tutorial-dialogue") return { getTutorialChapter, getTutorialPrompt };
      if (name.endsWith(".css")) return {};
      throw new Error(name);
    },
  });
  const npc = (testModule.exports as { TutorialNpc: (props: TutorialContext & { onNavigate: (target: TutorialTarget) => void; onAdvance?: () => void; canAdvance?: boolean; completed?: boolean }) => Element }).TutorialNpc;
  const identities = new Set<string>();
  const navigations: TutorialTarget[] = [];
  let showAction: (() => void) | undefined;
  let advanceAction: (() => void) | undefined;
  let advances = 0;
  function walk(node: unknown, path: string) {
    if (Array.isArray(node)) { node.forEach((child, index) => walk(child, `${path}/${index}`)); return; }
    if (!node || typeof node !== "object") return;
    const element = node as Element;
    const identity = `${path}/${typeof element.type === "string" ? element.type : element.type.name}:${element.key ?? "unkeyed"}`;
    if (element.type === portrait) { identities.add(identity); return; }
    if (typeof element.type === "function") { walk(element.type(element.props), identity); return; }
    if (element.props.className === "hm-tutorial-show") showAction = element.props.onClick as () => void;
    if (element.props.className === "hm-tutorial-advance") advanceAction = element.props.onClick as () => void;
    walk(element.props.children, identity);
  }
  for (const region of DEMO_REGIONS) for (let step = 0; step < 5; step++) {
    walk(npc({ step, regionId: region.id, residenceType: step % 2 ? "apartment" : "detached", applianceIds: step % 2 ? ["evie"] : ["bubbles", "chill"], onNavigate: target => navigations.push(target), onAdvance: () => advances++ }), "root");
    assert.equal(navigations.length, 0, "Rendering guidance must not navigate setup");
    assert.equal(advances, 0, "Context changes must not advance setup");
  }
  assert.equal(identities.size, 1, "Only dialogue text may live below a changing key; Pip's canvas must stay mounted");
  assert.ok(showAction); showAction();
  assert.deepEqual(navigations, ["plan"], "Only an explicit Show me action requests current-step navigation");
  assert.ok(advanceAction); advanceAction(); assert.equal(advances, 1);
  const context: TutorialContext = { step: 3, regionId: "california", residenceType: "apartment", applianceIds: [] };
  walk(npc({ ...context, onNavigate: target => navigations.push(target), onAdvance: () => advances++, canAdvance: false }), "root");
  advanceAction(); assert.equal(advances, 1, "A disabled team step cannot advance even if its handler is invoked");
  walk(npc({ ...context, step: 4, completed: true, onNavigate: target => navigations.push(target), onAdvance: () => advances++ }), "root");
  advanceAction(); assert.equal(advances, 1); assert.deepEqual(navigations, ["plan", "plan"]);
});

test("floating coach stays in the viewport and clear of next actions across responsive sizes", () => {
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source("src/components/tutorial-npc.tsx"), {
    module: testModule, exports: testModule.exports,
    require: (name: string) => {
      if (name === "@/data/tutorial-dialogue") return { getTutorialChapter, getTutorialPrompt };
      return {};
    },
  });
  type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
  const place = (testModule.exports as { getCoachmarkPosition: (box: Box | null, width: number, height: number, viewportWidth: number, viewportHeight: number, exclusions?: Box[], preferBelow?: boolean) => { left: number; top: number } }).getCoachmarkPosition;
  for (const [vw, vh, width, height] of [[1280, 900, 390, 180], [768, 1024, 390, 180], [390, 844, 340, 185], [320, 740, 300, 200], [844, 390, 355, 150]]) {
    for (const top of [20, vh / 2 - 22, vh - 64, vh + 100, -144]) {
      const anchor = { left: vw / 2 - 80, right: vw / 2 + 80, top, bottom: top + 44, width: 160, height: 44 };
      const pos = place(anchor, width, height, vw, vh);
      assert.ok(pos.left >= 10 && pos.left + width <= vw - 10);
      assert.ok(pos.top >= 10 && pos.top + height <= vh - 10);
      if (top >= 0 && top < vh) assert.ok(pos.left + width <= anchor.left || pos.left >= anchor.right || pos.top + height <= anchor.top || pos.top >= anchor.bottom, `Coach covers ${vw}×${vh} action at ${top}`);
    }
  }
  for (const [vw, vh, width, height] of [[390, 844, 340, 185], [320, 740, 300, 200], [390, 844, 340, 315]]) {
    const clock = { left: 20, right: vw - 20, top: 350, bottom: 510, width: vw - 40, height: 160 };
    const toolbar = { left: 20, right: vw - 20, top: 270, bottom: 340, width: vw - 40, height: 70 };
    const pos = place(clock, width, height, vw, vh, [toolbar], true);
    assert.ok(pos.top >= clock.bottom || pos.top + height <= toolbar.top, "Guide and expanded help must leave the camera toolbar and complete clock usable");
  }
  const clock = { left: 20, right: 370, top: 350, bottom: 510, width: 350, height: 160 };
  const toolbar = { ...clock, top: 270, bottom: 340, height: 70 };
  const objective = { ...clock, top: 660, bottom: 706, height: 46 };
  const toggle = { ...clock, top: 720, bottom: 764, height: 44 };
  const help = place(clock, 340, 245, 390, 844, [toolbar, objective, toggle], true);
  assert.ok(help.top + 245 <= toolbar.top, "When planning controls fill the lower viewport, compact scrolling help moves to the clear upper region");
});

test("coach coalesces native scroll updates and releases observers, frames and listeners on unmount", () => {
  const effects: (() => void | (() => void))[] = [];
  const frames = new Map<number, () => void>();
  const listeners = new Map<string, () => void>();
  let frameId = 0, observed = 0, disconnected = 0;
  const anchor = { getBoundingClientRect: () => ({ left: 110, right: 270, top: 650, bottom: 694, width: 160, height: 44 }) };
  const host = { getBoundingClientRect: () => ({ width: 340, height: 185 }) };
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source("src/components/tutorial-npc.tsx"), {
    module: testModule, exports: testModule.exports,
    document: { body: {}, getElementById: () => anchor, querySelectorAll: () => [] },
    window: { innerWidth: 390, innerHeight: 844, addEventListener: (type: string, callback: () => void, options: unknown) => { listeners.set(type, callback); if (type === "scroll") assert.equal((options as { passive: boolean }).passive, true); }, removeEventListener: (type: string) => listeners.delete(type) },
    ResizeObserver: class { observe() { observed++; } disconnect() { disconnected++; } },
    requestAnimationFrame: (callback: () => void) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    require: (name: string) => {
      if (name === "react") return { useId: () => "guide", useState: (initial: unknown) => [initial, () => {}], useEffect: (effect: () => void) => effects.push(effect), useRef: () => ({ current: host }), useSyncExternalStore: () => true };
      if (name === "react-dom") return { createPortal: (element: unknown) => element };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/data/tutorial-dialogue") return { getTutorialChapter, getTutorialPrompt };
      return {};
    },
  });
  const npc = (testModule.exports as { TutorialNpc: (props: TutorialContext & { onNavigate: () => void }) => unknown }).TutorialNpc;
  npc({ step: 0, regionId: "california", residenceType: "apartment", applianceIds: [], onNavigate() {} });
  const cleanup = effects[0]();
  assert.equal(observed, 2); assert.equal(frames.size, 1);
  for (let index = 0; index < 20; index++) listeners.get("scroll")?.();
  assert.equal(frames.size, 1, "Native scroll events share one pending animation frame");
  const callback = frames.get(frameId); frames.delete(frameId); callback?.();
  listeners.get("resize")?.(); assert.equal(frames.size, 1);
  if (typeof cleanup === "function") cleanup();
  assert.equal(frames.size, 0); assert.equal(listeners.size, 0); assert.equal(disconnected, 1);
});

test("Escape closes help before minimizing and returns keyboard focus to a visible guide control", () => {
  let cursor = 0, helpOpen = true, prevented = 0;
  const writes: [number, unknown][] = [];
  const focused: string[] = [];
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source("src/components/tutorial-npc.tsx"), {
    module: testModule, exports: testModule.exports, document: { body: {} },
    require: (name: string) => {
      if (name === "react") return {
        useId: () => "pip", useEffect: () => {}, useSyncExternalStore: () => true,
        useRef: () => ({ current: { querySelector: (selector: string) => ({ focus: () => focused.push(selector) }) } }),
        useState: (initial: unknown) => { const index = cursor++; return [index === 1 ? helpOpen : initial, (value: unknown) => writes.push([index, value])]; },
      };
      if (name === "react-dom") return { createPortal: (element: unknown) => element };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/data/tutorial-dialogue") return { getTutorialChapter, getTutorialPrompt };
      return {};
    },
  });
  const npc = (testModule.exports as { TutorialNpc: (props: TutorialContext & { onNavigate: () => void }) => Element }).TutorialNpc;
  const props: TutorialContext & { onNavigate: () => void } = { step: 0, regionId: "california", residenceType: "apartment", applianceIds: [], onNavigate() {} };
  const event = { key: "Escape", preventDefault() { prevented++; }, stopPropagation() {} };
  (npc(props).props.onKeyDown as (event: unknown) => void)(event);
  assert.deepEqual(writes, [[1, false]]); assert.match(focused[0], /pip-help/);
  helpOpen = false; cursor = 0; writes.length = 0;
  const handler = npc(props).props.onKeyDown as (event: unknown) => void;
  handler(event); assert.deepEqual(writes, [[0, true]]); assert.match(focused[1], /pip-dialogue/);
  handler({ ...event, key: "Tab" }); assert.equal(prevented, 2); assert.equal(writes.length, 1);
});

test("mascot props reuse one renderer and true unmount explicitly releases its WebGL context", () => {
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  const pending: (() => void)[] = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0, created = 0, disposed = 0, released = 0, disconnected = 0;
  const events: string[] = [];
  const frames = new Map<number, (time: number) => void>();
  let frameId = 0;
  class Renderer {
    domElement = { setAttribute() {}, addEventListener() {}, removeEventListener() { events.push("remove-listener"); }, remove() { events.push("remove-canvas"); } };
    constructor() { created++; }
    setClearColor() {} setPixelRatio() {} setSize() {} render() {}
    dispose() { disposed++; events.push("dispose"); }
    forceContextLoss() { released++; events.push("release"); }
  }
  class Observer { observe() {} disconnect() { disconnected++; } }
  const host = { clientWidth: 112, clientHeight: 112, appendChild() {} };
  const react = {
    useRef(value: unknown) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: value }); },
    useState(value: unknown) { const index = stateIndex++; if (!(index in states)) states[index] = value; return [states[index], (next: unknown) => { states[index] = next; }]; },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = effectIndex++, old = effects[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) pending.push(() => { old?.cleanup?.(); effects[index] = { deps, cleanup: effect() || undefined }; });
    },
  };
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source("src/components/guide-mascot.tsx"), {
    module: testModule, exports: testModule.exports,
    window: { devicePixelRatio: 1, matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    ResizeObserver: Observer, IntersectionObserver: Observer,
    requestAnimationFrame: (callback: (time: number) => void) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id), queueMicrotask: (callback: () => void) => callback(),
    require: (name: string) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "three") return { ...THREE, WebGLRenderer: Renderer };
      if (name.includes("RoundedBoxGeometry")) return { RoundedBoxGeometry: THREE.BoxGeometry };
      if (name.endsWith(".css")) return {};
      throw new Error(name);
    },
  });
  const mascot = (testModule.exports as { GuideMascot: (props: { mood: "welcome" | "thinking" | "celebrate"; talking: boolean }) => Element }).GuideMascot;
  for (let index = 0; index < 30; index++) {
    stateIndex = refIndex = effectIndex = 0;
    mascot({ mood: (["welcome", "thinking", "celebrate"] as const)[index % 3], talking: index % 2 === 0 });
    refs[0].current = host;
    pending.splice(0).forEach(effect => effect());
  }
  assert.equal(created, 1);
  assert.equal(disposed, 0);
  effects.forEach(effect => effect.cleanup?.());
  assert.equal(disposed, 1); assert.equal(released, 1); assert.equal(disconnected, 2); assert.equal(frames.size, 0);
  assert.ok(events.indexOf("remove-listener") < events.indexOf("release"), "Intentional cleanup must not announce a context-loss failure");
  assert.ok(events.indexOf("dispose") < events.indexOf("release"));
});


test("docked guide reserves its parent row, never positions a portal, and advances only explicitly", () => {
  const effects: (() => unknown)[] = [];
  const navigations: string[] = [];
  const testModule: { exports: unknown } = { exports: {} };
  let portals = 0;
  runInNewContext(source("src/components/tutorial-npc.tsx"), {
    module: testModule, exports: testModule.exports,
    require(name: string) {
      if (name === "react") return { useId: () => "dock-guide", useState: (initial: unknown) => [initial, () => {}], useEffect: (effect: () => unknown) => effects.push(effect), useRef: (current: unknown) => ({ current }), useSyncExternalStore: () => true };
      if (name === "react-dom") return { createPortal: () => { portals++; } };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/data/tutorial-dialogue") return { getTutorialChapter, getTutorialPrompt };
      return {};
    },
  });
  const npc = (testModule.exports as { TutorialNpc: (props: Record<string, unknown>) => Element }).TutorialNpc;
  const tree = npc({ step: 2, regionId: "california", residenceType: "apartment", applianceIds: ["evie"], presentation: "dock", prompt: "Review your chosen forecast source.", advanceLabel: "Meet my team", onBack: () => navigations.push("back"), onAdvance: () => navigations.push("advance"), onNavigate: (target: string) => navigations.push(target) });
  // No document/window/ResizeObserver are provided: dock rendering and effects must need none.
  effects.forEach(effect => effect());
  assert.equal(portals, 0);
  assert.equal(tree.props.style, undefined);
  assert.match(String(tree.props.className), /hm-tutorial-dock/);
  const nodes: Element[] = [];
  function walk(node: unknown) {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== "object" || !("props" in node)) return;
    nodes.push(node as Element); walk((node as Element).props.children);
  }
  walk(tree);
  assert.equal(navigations.length, 0);
  const advance = nodes.find(node => node.props.className === "hm-tutorial-advance");
  const back = nodes.find(node => node.props.className === "hm-tutorial-back");
  assert.ok(advance); assert.ok(back);
  (advance.props.onClick as () => void)(); (back.props.onClick as () => void)();
  assert.deepEqual(navigations, ["advance", "back"]);
  assert.ok(nodes.some(node => node.type === "p" && Array.isArray(node.props.children) && node.props.children[0] === "Review your chosen forecast source."));
});

test("completed home can return to docked setup without hiding dialogue or remounting Pip", () => {
  const values: unknown[] = [];
  let cursor = 0, advances = 0;
  const portrait = () => null;
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source("src/components/tutorial-npc.tsx"), {
    module: testModule, exports: testModule.exports,
    require(name: string) {
      if (name === "react") return { useId: () => "return-guide", useEffect: () => {}, useRef: (current: unknown) => ({ current }), useSyncExternalStore: () => true,
        useState(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; } };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "./guide-mascot") return { GuideMascot: portrait };
      if (name === "@/data/tutorial-dialogue") return { getTutorialChapter, getTutorialPrompt };
      return {};
    },
  });
  const npc = (testModule.exports as { TutorialNpc: (props: Record<string, unknown>) => Element }).TutorialNpc;
  function render(completed: boolean, step: number) {
    cursor = 0;
    const nodes: { element: Element; path: string }[] = [];
    function walk(node: unknown, path: string) {
      if (Array.isArray(node)) { node.forEach((child, index) => walk(child, `${path}/${index}`)); return; }
      if (!node || typeof node !== "object" || !("props" in node)) return;
      const element = node as Element;
      const here = `${path}/${typeof element.type === "function" ? element.type.name : element.type}:${element.key ?? "unkeyed"}`;
      nodes.push({ element, path: here }); walk(element.props.children, here);
    }
    walk(npc({ completed, step, presentation: "dock", regionId: "california", residenceType: "apartment", applianceIds: ["evie"], onNavigate() {}, onAdvance() { advances++; } }), "root");
    return nodes;
  }
  const home = render(true, 4);
  const editing = render(false, 0);
  for (const nodes of [home, editing]) assert.equal(nodes.find(node => node.element.props.id === "return-guide-dialogue")?.element.props.hidden, false);
  assert.equal(home.find(node => node.element.type === portrait)?.path, editing.find(node => node.element.type === portrait)?.path);
  const advance = editing.find(node => node.element.props.className === "hm-tutorial-advance")?.element;
  assert.ok(advance); assert.equal(advances, 0); (advance.props.onClick as () => void)(); assert.equal(advances, 1);
  const helpButton = editing.find(node => node.element.type === "button" && node.element.props["aria-controls"] === "return-guide-help")?.element;
  assert.ok(helpButton); (helpButton.props.onClick as () => void)();
  const help = render(false, 0).find(node => node.element.props.id === "return-guide-help")?.element;
  assert.ok(help); assert.equal(help.props.hidden, false); assert.equal(help.props.tabIndex, 0); assert.equal(help.props.role, "region"); assert.equal(help.props["aria-label"], "Pip’s guide pages");
});
