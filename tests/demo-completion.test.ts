import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createSyntheticWeather, type DemoWeather } from "../src/domain/demo-weather";
import * as locationDomain from "../src/domain/weather-location";
import * as demo from "../src/domain/demo";
import * as regions from "../src/data/demo-regions";
import * as activity from "../src/domain/demo-activity";
import * as simulation from "../src/domain/simulation";
import * as landmarks from "../src/data/city-landmarks";
import * as recruitment from "../src/domain/appliance-recruitment";
import * as catalog from "../src/domain/applimon-catalog";
import * as cameraFocus from "../src/domain/camera-focus";

type Element = { type: unknown; props: Record<string, unknown>; key?: string };
const jsx = (type: unknown, props: Element["props"], key?: string): Element => ({ type, props, key });
const PlacePicker=()=>null;
const testPlace:locationDomain.WeatherLocation={id:3143244,name:"Oslo",country:"Norway",countryCode:"NO",latitude:59.91,longitude:10.75,timezone:"Europe/Oslo"};
const Dashboard = () => null, Scene = () => null, Guide = () => null, Capture = () => null, Specs = () => null, Reveal = () => null, Placeholder = () => null;
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
function app(options: { startAtHome?: boolean; stored?: string | null; blockRead?: boolean; blockWrite?: boolean; forecastUnavailable?: boolean } = {}) {
  const states: unknown[] = [], refs: { current: unknown }[] = [], dependencies: unknown[][] = [];
  const pendingEffects: (() => void)[] = [], microtasks: (() => void)[] = [];
  const cleanups: (void | (() => void))[] = [], revoked:string[]=[];let photoNumber=0;
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
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = effectIndex++, before = dependencies[index];
      if (!before || deps.some((value, i) => value !== before[i])) { dependencies[index] = deps; pendingEffects.push(()=>{cleanups[index]?.();cleanups[index]=effect();}); }
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
    URL:{createObjectURL:()=>`blob:recruit-${++photoNumber}`,revokeObjectURL:(url:string)=>revoked.push(url)},
    requestAnimationFrame: (callback: () => void) => { callback(); return 1; },
    queueMicrotask: (callback: () => void) => microtasks.push(callback),
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "next/navigation") return { useRouter: () => ({ push: (path: string) => pushes.push(path) }) };
      if (name === "next/link") return { default: Placeholder };
      if (name === "@/domain/weather-location") return locationDomain;
      if (name === "./weather-location-picker") return {WeatherLocationPicker:PlacePicker};
      if (name === "@/domain/demo") return demo;
      if (name === "@/domain/appliance-recruitment") return recruitment;
      if (name === "@/domain/applimon-catalog") return catalog;
      if (name === "@/domain/demo-activity") return activity;
      if (name === "@/domain/simulation") return simulation;
      if (name === "@/data/demo-regions") return regions;
      if (name === "@/data/city-landmarks") return landmarks;
      if (name === "./demo-home-dashboard") return { DemoHomeDashboard: Dashboard };
      if (name === "./household-scene-3d") return { HouseholdScene3D: Scene };
      if (name === "./tutorial-npc") return { TutorialNpc: Guide };
      if (name === "./appliance-capture") return { ApplianceCapture: Capture };
      if (name === "./applimon-spec-capture") return { ApplimonSpecCapture: Specs };
      if (name === "./use-demo-forecast") return { useDemoForecast: (profile: demo.DemoProfile, enabled: boolean, onForecast: (weather: DemoWeather) => void) => {
        if(enabled && profile.weatherLocation && profile.forecast?.source!=="live" && !options.forecastUnavailable) microtasks.push(()=>onForecast({...createSyntheticWeather(profile.regionId),location:profile.weatherLocation,timezone:profile.weatherLocation!.timezone,source:"live",sourceLabel:"Test forecast fixture",sourceUrl:"https://open-meteo.com/"}));
        return {loading:false,notice:options.forecastUnavailable?"City forecast unavailable. Retry to load actual weather data.":"",refresh(){}};
      } };
      if (name === "./applimon-reveal") return { ApplimonReveal: Reveal };
      if (name === "./applimon-sprite") return { ApplimonSprite: Placeholder };
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
  return { pushes, writes, storage, firstTree, find, activate, settle, revoked, get tree() { return tree; },
    chooseLocation(place=testPlace) { (find(element=>element.type===PlacePicker).props.onChange as (place:locationDomain.WeatherLocation)=>void)(place);settle(); },
    next() { const guide=find(element=>element.type===Guide); assert.notEqual(guide.props.canAdvance,false); (guide.props.onAdvance as () => void)(); settle(); },
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
      if (name === "@/domain/applimon-catalog") return catalog;
      if (name === "@/domain/camera-focus") return cameraFocus;
      if (name === "three" || name.includes("OrbitControls") || name.includes("RoundedBoxGeometry") || name === "./city-landmark-geometry" || name.endsWith(".css")) return {};
      throw new Error(name);
    },
  });
  const component = (testModule.exports as { HouseholdScene3D: (props: Element["props"]) => Element }).HouseholdScene3D;
  const controls = elements(component(sceneProps)).find(element => element.props.className === "hm3d-build-controls");
  assert.ok(controls);
  return elements(controls).find(element => element.type === "button")!;
}
function ready(instance: ReturnType<typeof app>) { instance.next(); instance.next(); instance.chooseLocation(); instance.next(); instance.recruitEvie(); instance.next(); }
const savedProfile: demo.DemoProfile = { ...demo.DEFAULT_DEMO_PROFILE, regionId: "oslo", residenceType: "townhouse", applianceIds: ["evie", "chill"], weatherLocation:testPlace, weatherOffsetC: 4, weatherCode: 61 };

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
  instance.next(); instance.next(); instance.chooseLocation(); instance.next();
  assert.equal(instance.find(element => element.type === Guide).props.canAdvance, false);
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
  assert.equal(scenario.profile.regionId, "oslo"); assert.equal(scenario.profile.weatherMode, "live");
  assert.equal(scenario.profile.weatherOffsetC, undefined); assert.equal(scenario.weather.source, "live");
  assert.deepEqual(scenario.profile.applianceIds, ["evie", "chill"]);
  assert.ok(scenario.plan?.proposed && scenario.plan.proposed.costUsd > 0);
  assert.equal("proposedCostUsd" in scenario.profile, false);
  assert.equal(demo.parseDemoProfile(instance.writes.at(-1)!.value)?.forecast?.source, "live");
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


test("completed-home scanning uses saved matching world, while session-only changes stay in their current setup", () => {
  const saved = app({ startAtHome: true, stored: JSON.stringify(savedProfile) });
  (saved.find(element => element.type === Dashboard).props.onAddAppliance as () => void)(); saved.settle();
  assert.deepEqual(saved.pushes, ["/demo/scan"]);

  const unsaved = app({ blockWrite: true, stored: JSON.stringify(savedProfile) }); ready(unsaved);
  unsaved.activate(unsaved.find(element => element.props.id === "demo-enter-home"));
  (unsaved.find(element => element.type === Dashboard).props.onAddAppliance as () => void)(); unsaved.settle();
  assert.deepEqual(unsaved.pushes, []);
  assert.equal(unsaved.find(element => element.type === Guide).props.step, 3);
  assert.match(text(unsaved.tree), /Add a teammate to this session/);
  const scene = unsaved.find(element => element.type === Scene);
  assert.deepEqual(Array.from(scene.props.visibleAppliances as string[]), ["evie"]);
});


test("onboarding photo selection opens synthetic character confirmation without recruiting early", () => {
  const instance = app(); instance.next(); instance.next(); instance.chooseLocation(); instance.next();
  instance.activate(instance.find(element => element.type === "button" && text(element).includes("Add from a photo")));
  const capture = instance.find(element => element.type === Capture);
  assert.equal(capture.props.catalogMode, true);
  assert.equal(capture.props.reviewSpecifications, true);
  (capture.props.onConfirm as (id: string) => void)("spin"); instance.settle();
  const before = instance.find(element => element.type === Scene);
  assert.deepEqual(Array.from(before.props.additionalApplimons as string[]), []);
  assert.equal(instance.writes.length, 0);
  assert.equal(instance.find(element => element.type === Guide).props.canAdvance, false);
  const specs = instance.find(element => element.type === Specs);
  assert.equal(specs.props.initialId, "spin");
  (specs.props.onConfirm as (device: catalog.ApplimonDevice) => void)(catalog.createDemoApplimon("spin")); instance.settle();
  assert.deepEqual(Array.from(instance.find(element => element.type === Scene).props.additionalApplimons as string[]), ["spin"]);
  assert.equal(instance.writes.length, 0, "Recruitment stays draft until move-in saves the world");
  assert.equal(instance.find(element => element.type === Guide).props.canAdvance, true);
  instance.next(); instance.activate(instance.find(element => element.props.id === "demo-enter-home"));
  assert.equal(demo.parseDemoProfile(instance.writes.at(-1)!.value)?.applimons?.[0].id, "spin");
  assert.deepEqual(instance.pushes, ["/demo/home"]);
});


test("unavailable real weather hides modeled weather and blocks setup advance", () => {
  const instance = app({forecastUnavailable:true}); instance.next(); instance.next(); instance.chooseLocation();
  assert.equal(instance.find(element=>element.type===Guide).props.canAdvance,false);
  assert.match(text(instance.tree),/City forecast unavailable/);
  assert.doesNotMatch(text(instance.tree),/Synthetic what-if|°C outside|World stats/);
  assert.equal(elements(instance.tree).some(element=>element.type===Dashboard),false);
});

test("legacy synthetic saved home waits for actual weather without losing reviewed team or planning mode", () => {
  const stored=JSON.stringify({...savedProfile,weatherLocation:undefined,weatherMode:"synthetic",weatherPreferenceExplicit:true,forecast:createSyntheticWeather(savedProfile.regionId),planningMode:"carbon"});
  const unavailable=app({startAtHome:true,stored,forecastUnavailable:true});
  assert.equal(elements(unavailable.tree).some(element=>element.type===Dashboard),false);
  assert.equal(unavailable.find(element=>element.type===Guide).props.step,2);
  assert.equal(unavailable.find(element=>element.type===Guide).props.canAdvance,false);
  const restored=app({startAtHome:true,stored});
  restored.chooseLocation();restored.next();restored.next();restored.next();
  const dashboard=restored.find(element=>element.type===Dashboard);
  assert.equal(dashboard.props.mode,"carbon");
  const scenario=dashboard.props.scenario as demo.DemoScenario;
  assert.deepEqual(scenario.profile.applianceIds,savedProfile.applianceIds);
  assert.equal(scenario.weather.source,"live");
  assert.equal(scenario.profile.weatherCode,undefined);
});


test("onboarding reveal receives the selected photo and continuing never recruits or saves twice",()=>{
  const instance=app();instance.next();instance.next();instance.chooseLocation();instance.next();
  instance.activate(instance.find(element=>element.type==="button"&&text(element).includes("Add from a photo")));
  const capture=instance.find(element=>element.type===Capture);
  const photo={type:"image/png",name:"washer.png",size:3000};
  (capture.props.onPhotoSelected as (file:unknown)=>void)(photo);instance.settle();
  (capture.props.onConfirm as (id:string)=>void)("spin");instance.settle();
  const specs=instance.find(element=>element.type===Specs);
  (specs.props.onConfirm as (device:catalog.ApplimonDevice)=>void)(catalog.createDemoApplimon("spin"));instance.settle();
  const reveal=instance.find(element=>element.type===Reveal);
  assert.equal(reveal.props.id,"spin");assert.equal(reveal.props.state,"confirmed");assert.equal(reveal.props.photoUrl,"blob:recruit-1");
  assert.deepEqual(Array.from(instance.find(element=>element.type===Scene).props.additionalApplimons as string[]),["spin"]);
  assert.equal(instance.writes.length,0);
  (reveal.props.onContinue as ()=>void)();instance.settle();
  assert.equal(elements(instance.tree).some(element=>element.type===Reveal),false);
  assert.deepEqual(instance.revoked,["blob:recruit-1"]);
  assert.deepEqual(Array.from(instance.find(element=>element.type===Scene).props.additionalApplimons as string[]),["spin"]);
  assert.equal(instance.writes.length,0,"Reveal continuation only closes presentation");
  instance.next();instance.activate(instance.find(element=>element.props.id==="demo-enter-home"));
  const stored=demo.parseDemoProfile(instance.writes.at(-1)!.value)!;
  assert.equal(stored.applimons?.length,1);assert.equal(stored.applimons?.[0].id,"spin");
  assert.equal(instance.writes.some(write=>write.value.includes("blob:")||write.value.includes("washer.png")),false);
});


test("reselecting updated metadata for the same place refreshes a saved home", () => {
  const instance=app({startAtHome:true,stored:JSON.stringify(savedProfile)});
  (instance.find(element=>element.type===Dashboard).props.onEdit as ()=>void)();instance.settle();
  instance.next();instance.next();
  const corrected={...testPlace,name:"Oslo municipality",latitude:59.92};
  instance.chooseLocation(corrected);instance.next();instance.next();instance.next();
  const scenario=instance.find(element=>element.type===Dashboard).props.scenario as demo.DemoScenario;
  assert.deepEqual(scenario.profile.weatherLocation,corrected);
  assert.deepEqual(scenario.weather.location,corrected);
});


test("onboarding synthetic recruitment retains an existing custom teammate when selected again", () => {
  const custom: catalog.ApplimonDevice = { ...catalog.createDemoApplimon("spin"), energyKwh: .8, ratedPowerW: 2200, specSource: "manual" };
  const instance = app({ startAtHome: true, stored: JSON.stringify({ ...savedProfile, applimons: [custom] }) });
  (instance.find(element => element.type === Dashboard).props.onEdit as () => void)(); instance.settle();
  instance.next(); instance.next(); instance.next();
  instance.activate(instance.find(element => element.type === "button" && text(element).includes("Spin")));
  const confirmation = instance.find(element => element.type === Specs);
  assert.deepEqual(confirmation.props.initialDevice, custom);
  (confirmation.props.onConfirm as (device: catalog.ApplimonDevice) => void)(catalog.createDemoApplimon("spin")); instance.settle();
  instance.next(); instance.activate(instance.find(element => element.props.id === "demo-enter-home"));
  const saved = demo.parseDemoProfile(instance.writes.at(-1)!.value)!;
  assert.deepEqual(saved.applimons, [custom]);
});
