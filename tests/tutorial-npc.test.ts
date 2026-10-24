import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as THREE from "three";
import ts from "typescript";
import { DEMO_REGIONS } from "../src/data/demo-regions";
import { getTutorialChapter, type TutorialContext, type TutorialTarget } from "../src/data/tutorial-dialogue";

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

test("city, residence, team and chapter changes preserve the mascot's React reconciliation identity", () => {
  // Keys on any ancestor destroy descendant component instances. Walk the actual
  // JSX tree with React's key/position identity rules, including function children.
  const portrait = () => null;
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source("src/components/tutorial-npc.tsx"), {
    module: testModule, exports: testModule.exports,
    require: (name: string) => {
      if (name === "react") return { useId: () => "guide", useState: (initial: unknown) => [initial, () => {}] };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "./guide-mascot") return { GuideMascot: portrait };
      if (name === "@/data/tutorial-dialogue") return { getTutorialChapter };
      if (name.endsWith(".css")) return {};
      throw new Error(name);
    },
  });
  const npc = (testModule.exports as { TutorialNpc: (props: TutorialContext & { onNavigate: (target: TutorialTarget) => void }) => Element }).TutorialNpc;
  const identities = new Set<string>();
  const navigations: TutorialTarget[] = [];
  let showAction: (() => void) | undefined;
  function walk(node: unknown, path: string) {
    if (Array.isArray(node)) { node.forEach((child, index) => walk(child, `${path}/${index}`)); return; }
    if (!node || typeof node !== "object") return;
    const element = node as Element;
    const identity = `${path}/${typeof element.type === "string" ? element.type : element.type.name}:${element.key ?? "unkeyed"}`;
    if (element.type === portrait) { identities.add(identity); return; }
    if (typeof element.type === "function") { walk(element.type(element.props), identity); return; }
    if (element.props.className === "hm-tutorial-show") showAction = element.props.onClick as () => void;
    walk(element.props.children, identity);
  }
  for (const region of DEMO_REGIONS) for (let step = 0; step < 5; step++) {
    walk(npc({ step, regionId: region.id, residenceType: step % 2 ? "apartment" : "detached", applianceIds: step % 2 ? ["evie"] : ["bubbles", "chill"], onNavigate: target => navigations.push(target) }), "root");
    assert.equal(navigations.length, 0, "Rendering guidance must not navigate setup");
  }
  assert.equal(identities.size, 1, "Only dialogue text may live below a changing key; Pip's canvas must stay mounted");
  assert.ok(showAction); showAction();
  assert.deepEqual(navigations, ["plan"], "Only an explicit Show me action requests current-step navigation");
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
