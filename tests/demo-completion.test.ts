import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as demo from "../src/domain/demo";
import * as regions from "../src/data/demo-regions";
import * as activity from "../src/domain/demo-activity";
import * as simulation from "../src/domain/simulation";
import * as landmarks from "../src/data/city-landmarks";

type Element = { type: unknown; props: Record<string, unknown>; key?: string };
const jsx = (type: unknown, props: Element["props"], key?: string): Element => ({ type, props, key });
const Dashboard = () => null, Scene = () => null, Guide = () => null, Placeholder = () => null;
const source = (path: string) => ts.transpileModule(readFileSync(resolve(process.cwd(), path), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const onboardingSource = source("src/components/demo-onboarding.tsx");
const sceneSource = source("src/components/household-scene-3d.tsx");
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

/** Execute real component JSX and event closures. Only browser services and child
 * renderers are replaced; state updates, effect timing and all domain math are real. */
function app(options: { startAtHome?: boolean; stored?: string | null; blockRead?: boolean; blockWrite?: boolean } = {}) {
  const states: unknown[] = [], refs: { current: unknown }[] = [], dependencies: unknown[][] = [];
  const pendingEffects: (() => void)[] = [], microtasks: (() => void)[] = [];
  const pushes: string[] = [], writes: { key: string; value: string }[] = [];
  const storage = new Map<string, string>();
  if (options.stored !== undefined && options.stored !== null) storage.set("housemates-demo-v1", options.stored);
  let stateIndex = 0, refIndex = 0, effectIndex = 0, dirty = false, tree: Element;
  const react = {
    useState(initial: unknown) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; dirty = true; }];
    },
    useRef(initial: unknown) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
    useMemo(calculate: () => unknown) { return calculate(); },
    useEffect(effect: () => void, deps: unknown[]) {
      const index = effectIndex++, before = dependencies[index];
      if (!before || deps.some((value, i) => value !== before[i])) { dependencies[index] = deps; pendingEffects.push(effect); }
    },
  };
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(onboardingSource, {
    module: testModule, exports: testModule.exports,
    localStorage: {
      getItem(key: string) { if (options.blockRead) throw new Error("storage blocked"); return storage.get(key) ?? null; },
      setItem(key: string, value: string) { if (options.blockWrite) throw new Error("quota exceeded"); writes.push({ key, value }); storage.set(key, value); },
    },
    window: { innerWidth: 1280, scrollTo() {}, matchMedia: () => ({ matches: true }) },
    document: { getElementById: () => null },
    requestAnimationFrame: (callback: () => void) => { callback(); return 1; },
    queueMicrotask: (callback: () => void) => microtasks.push(callback),
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "next/navigation") return { useRouter: () => ({ push: (path: string) => pushes.push(path) }) };
      if (name === "next/link") return { default: Placeholder };
      if (name === "@/domain/demo") return demo;
      if (name === "@/domain/demo-activity") return activity;
      if (name === "@/domain/simulation") return simulation;
      if (name === "@/data/demo-regions") return regions;
      if (name === "@/data/city-landmarks") return landmarks;
      if (name === "./demo-home-dashboard") return { DemoHomeDashboard: Dashboard };
      if (name === "./household-scene-3d") return { HouseholdScene3D: Scene };
      if (name === "./tutorial-npc") return { TutorialNpc: Guide };
      if (name === "./appliance-capture") return { ApplianceCapture: Placeholder };
      if (name === "./pixel-appliance") return { PixelAppliance: Placeholder };
      if (name.endsWith(".css")) return {};
      throw new Error(`Unexpected component dependency ${name}`);
    },
  });
  const component = (testModule.exports as { DemoOnboarding: (props: { startAtHome: boolean }) => Element }).DemoOnboarding;
  function render() { stateIndex = refIndex = effectIndex = 0; dirty = false; tree = component({ startAtHome: Boolean(options.startAtHome) }); }
  function settle() {
    for (let count = 0; count < 15; count++) {
      pendingEffects.splice(0).forEach(effect => effect());
      microtasks.splice(0).forEach(callback => callback());
      if (!dirty) return;
      render();
    }
    throw new Error("Component did not settle");
  }
  render(); const firstTree = tree!; settle();
  const find = (predicate: (element: Element) => boolean) => {
    const match = elements(tree).find(predicate); assert.ok(match, "Expected rendered element"); return match;
  };
  function activate(element: Element) { assert.notEqual(element.props.disabled, true, "Disabled controls cannot activate"); assert.equal(typeof element.props.onClick, "function"); (element.props.onClick as () => void)(); settle(); }
  return { pushes, writes, storage, firstTree, find, activate, settle, get tree() { return tree; },
    next() { activate(find(element => element.props.id === "demo-next-action")); },
    recruitEvie() { activate(find(element => element.type === "button" && text(element).includes("Evie"))); },
  };
}

function actualSceneFinish(sceneProps: Element["props"]): Element {
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(sceneSource, {
    module: testModule, exports: testModule.exports,
    require(name: string) {
      if (name === "react") return { useRef: (current: unknown) => ({ current }), useState: (initial: unknown) => [initial, () => {}], useEffect() {} };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "three" || name.includes("OrbitControls") || name.includes("RoundedBoxGeometry") || name === "./city-landmark-geometry" || name.endsWith(".css")) return {};
      throw new Error(name);
    },
  });
  const component = (testModule.exports as { HouseholdScene3D: (props: Element["props"]) => Element }).HouseholdScene3D;
  const controls = elements(component(sceneProps)).find(element => element.props.className === "hm3d-build-controls");
  assert.ok(controls);
  return elements(controls).find(element => element.type === "button")!;
}
function ready(instance: ReturnType<typeof app>) { instance.next(); instance.next(); instance.next(); instance.recruitEvie(); instance.next(); }
const savedProfile: demo.DemoProfile = { ...demo.DEFAULT_DEMO_PROFILE, regionId: "oslo", residenceType: "townhouse", applianceIds: ["evie", "chill"], weatherOffsetC: 4, weatherCode: 61 };

for (const entry of ["primary", "scene"] as const) test(`the actual ${entry} completion control saves setup and enters /demo/home`, () => {
  const instance = app(); ready(instance);
  const control = entry === "primary" ? instance.find(element => element.props.id === "demo-enter-home") : actualSceneFinish(instance.find(element => element.type === Scene).props);
  assert.match(text(control), /Finish build.*enter home/);
  instance.activate(control);
  assert.deepEqual(instance.pushes, ["/demo/home"]);
  const last = instance.writes.at(-1)!;
  assert.equal(last.key, "housemates-demo-v1");
  assert.deepEqual(demo.parseDemoProfile(last.value)?.applianceIds, ["evie"]);
});

test("early scene control only skips animation and the empty team cannot advance through guide or route restore", () => {
  const instance = app();
  const skip = actualSceneFinish(instance.find(element => element.type === Scene).props);
  assert.equal(text(skip), "Skip animation"); instance.activate(skip);
  assert.equal(instance.writes.length, 0); assert.equal(instance.pushes.length, 0);
  instance.next(); instance.next(); instance.next();
  assert.equal(instance.find(element => element.props.id === "demo-next-action").props.disabled, true);
  const guide = instance.find(element => element.type === Guide);
  assert.equal(guide.props.canAdvance, false);
  (guide.props.onAdvance as () => void)(); instance.settle();
  assert.equal(instance.find(element => element.type === Guide).props.step, 3);
  assert.equal(instance.writes.length, 0); assert.equal(instance.pushes.length, 0);
  const restoredEmpty = app({ startAtHome: true, stored: JSON.stringify(demo.DEFAULT_DEMO_PROFILE) });
  assert.equal(elements(restoredEmpty.tree).some(element => element.type === Dashboard), false);
  assert.equal(restoredEmpty.find(element => element.type === Guide).props.step, 0);
});

test("blocked storage opens a functioning completed dashboard in the same session without claiming persistence", () => {
  const instance = app({ blockWrite: true }); ready(instance);
  instance.activate(instance.find(element => element.props.id === "demo-enter-home"));
  const dashboard = instance.find(element => element.type === Dashboard);
  const scenario = dashboard.props.scenario as demo.DemoScenario;
  assert.deepEqual(scenario.profile.applianceIds, ["evie"]);
  assert.equal(scenario.plan?.status, "feasible");
  assert.match(String(dashboard.props.notice), /this session.*could not save/i);
  assert.deepEqual(instance.pushes, []); assert.equal(instance.writes.length, 0);
});

test("direct completed-home navigation validates and recomputes a saved profile before opening the dashboard", () => {
  const instance = app({ startAtHome: true, stored: JSON.stringify({ ...savedProfile, weatherMode: "live", proposedCostUsd: -9000 }) });
  assert.equal(String(instance.firstTree.props["aria-busy"]), "true");
  const dashboard = instance.find(element => element.type === Dashboard);
  const scenario = dashboard.props.scenario as demo.DemoScenario;
  assert.equal(scenario.profile.regionId, "oslo"); assert.equal(scenario.profile.weatherMode, "synthetic");
  assert.equal(scenario.profile.weatherOffsetC, 4); assert.equal(scenario.weather.source, "synthetic");
  assert.deepEqual(scenario.profile.applianceIds, ["evie", "chill"]);
  assert.ok(scenario.plan?.proposed && scenario.plan.proposed.costUsd > 0);
  assert.equal("proposedCostUsd" in scenario.profile, false);
  assert.equal(instance.writes.length, 0);
});

test("missing, malformed, incompatible and blocked saved profiles return to usable setup rather than an empty dashboard", () => {
  for (const options of [{ stored: null }, { stored: "{broken" }, { stored: JSON.stringify({ ...savedProfile, version: 999 }) }, { blockRead: true }]) {
    const instance = app({ ...options, startAtHome: true });
    assert.equal(elements(instance.tree).some(element => element.type === Dashboard), false);
    assert.equal(instance.find(element => element.type === Guide).props.step, 0);
    assert.ok(instance.find(element => element.props.id === "demo-region-controls"));
    assert.equal(instance.pushes.length, 0);
  }
});

test("completion preserves the chosen carbon or balanced objective through a real route remount", () => {
  for (const objective of ["carbon", "balanced"] as const) {
    const instance = app(); ready(instance);
    const select = instance.find(element => element.props.id === "demo-objective");
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: objective } });
    instance.settle();
    instance.activate(instance.find(element => element.props.id === "demo-enter-home"));
    const saved = instance.storage.get("housemates-demo-v1")!;
    assert.equal(demo.parseDemoProfile(saved)?.planningMode, objective);
    const restored = app({ startAtHome: true, stored: saved });
    const dashboard = restored.find(element => element.type === Dashboard);
    assert.equal(dashboard.props.mode, objective);
    const scenario = dashboard.props.scenario as demo.DemoScenario;
    const expected = demo.buildDemoScenario(demo.parseDemoProfile(saved)!);
    assert.deepEqual(scenario.plan, expected.plan);
  }
});
