import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { applianceTransferPath, DEMO_PROFILE_STORAGE_KEY, parseTransferredAppliance, recruitDemoAppliance, recruitConfiguredApplimon } from "../src/domain/appliance-recruitment";
import { DEFAULT_DEMO_PROFILE, parseDemoProfile, type DemoProfile } from "../src/domain/demo";
import * as catalog from "../src/domain/applimon-catalog";
import { getDemoRegion } from "../src/data/demo-regions";

const household: DemoProfile = { ...DEFAULT_DEMO_PROFILE, regionId: "bangkok", residenceType: "apartment", weatherOffsetC: 7, weatherCode: 61, planningMode: "carbon", applianceIds: ["evie"] };

test("confirmed recruitment preserves household settings without duplicate models, energy or photo data", () => {
  const result = recruitDemoAppliance({ ...household, photo: "private", powerKw: 1000 }, "bubbles");
  assert.equal(result.status, "added");
  assert.deepEqual(result.profile, { ...household, applianceIds: ["evie", "bubbles"] });
  assert.equal("photo" in result.profile, false);
  assert.deepEqual(household.applianceIds, ["evie"]);
  const duplicate = recruitDemoAppliance(result.profile, "bubbles");
  assert.equal(duplicate.status, "already-present");
  assert.deepEqual(duplicate.profile, result.profile);
  assert.throws(() => recruitDemoAppliance(null, "evie"));
  assert.throws(() => recruitDemoAppliance(household, "oven"));
});

test("category transfer accepts only one exact supported category and carries no household or image", () => {
  for (const id of ["evie", "bubbles", "chill"] as const) {
    const path = applianceTransferPath(id);
    assert.equal(path, `/demo/scan?appliance=${id}`);
    assert.equal(parseTransferredAppliance(path.slice(path.indexOf("?"))), id);
  }
  for (const raw of ["", "?appliance=oven", "?appliance=EVIE", "?appliance=evie&appliance=chill", "?appliance=evie&appliance=evie", `?appliance=evie&x=${"x".repeat(1024)}`]) assert.equal(parseTransferredAppliance(raw), null);
  assert.throws(() => applianceTransferPath("oven" as "evie"));
});

type View = { type: unknown; props: Record<string, unknown> };
function scanHarness(raw: string | null = JSON.stringify(household), search = "") {
  const states: unknown[] = [], effects: (() => void)[] = [];
  let index = 0, effectIndex = 0, tree: View, stored = raw;
  let writeBlocked = false, readBlocked = false, copied = "";
  const writes: string[] = [];
  const effectDeps: unknown[][] = [];
  const cleanups:(void|(()=>void))[]=[],revoked:string[]=[];let urlNumber=0;
  const microtasks: (() => void)[] = [];
  const capture = () => null;
  const specCapture = () => null;
  const reveal = () => null;
  const react = {
    useState(value: unknown) {
      const i = index++;
      if (!(i in states)) states[i] = value;
      return [states[i], (next: unknown) => { states[i] = typeof next === "function" ? next(states[i]) : next; }];
    },
    useEffect(effect: () => void | (()=>void), deps: unknown[]) {
      const i = effectIndex++;
      if (!effectDeps[i] || deps.some((value, j) => value !== effectDeps[i][j])) { effectDeps[i] = deps; effects.push(()=>{cleanups[i]?.();cleanups[i]=effect();}); }
    },
  };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/appliance-scan.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source, {
    module: testModule, exports: testModule.exports,
    queueMicrotask: (fn: () => void) => microtasks.push(fn),
    window: { location: { search, origin: "https://housemates.example" } },
    URL:{createObjectURL:()=>`blob:scan-${++urlNumber}`,revokeObjectURL:(url:string)=>revoked.push(url)},
    navigator: { clipboard: { writeText: async (text: string) => { copied = text; } } },
    localStorage: {
      getItem(key: string) { assert.equal(key, DEMO_PROFILE_STORAGE_KEY); if (readBlocked) throw Error("blocked"); return stored; },
      setItem(key: string, value: string) { assert.equal(key, DEMO_PROFILE_STORAGE_KEY); if (writeBlocked) throw Error("blocked"); stored = value; writes.push(value); },
    },
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { default: "a" };
      if (name === "./appliance-capture") return { ApplianceCapture: capture };
      if (name === "./applimon-spec-capture") return { ApplimonSpecCapture: specCapture };
      if (name === "./applimon-reveal") return { ApplimonReveal: reveal };
      if (name === "./applimon-sprite") return { ApplimonSprite: () => null };
      if (name === "@/domain/applimon-catalog") return catalog;
      if (name === "./household-scene-3d") return { HouseholdScene3D: () => null };
      if (name === "./pixel-appliance") return { PixelAppliance: () => null };
      if (name === "@/domain/demo") return { parseDemoProfile };
      if (name === "@/data/demo-regions") return { getDemoRegion };
      if (name === "@/domain/appliance-recruitment") return { applianceTransferPath, DEMO_PROFILE_STORAGE_KEY, parseTransferredAppliance, recruitDemoAppliance, recruitConfiguredApplimon };
      if (name.endsWith(".css")) return {};
      throw Error(`Unexpected scan import ${name}`);
    },
  });
  function render() {
    index = effectIndex = 0;
    tree = (testModule.exports as { ApplianceScan: () => View }).ApplianceScan();
    effects.splice(0).forEach(fn => fn());
    microtasks.splice(0).forEach(fn => fn());
  }
  function nodes(value: unknown): View[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== "object") return [];
    const node = value as View;
    return [node, ...nodes(node.props?.children)];
  }
  function text(value: unknown): string {
    if (Array.isArray(value)) return value.map(text).join("");
    if (value && typeof value === "object") return text((value as View).props?.children);
    return typeof value === "string" ? value : "";
  }
  function find(predicate: (node: View) => boolean) { const node = nodes(tree).find(predicate); assert.ok(node); return node; }
  render(); render();
  return {
    render, writes, find, revoked, text: () => text(tree),
    revelation:()=>nodes(tree).find(node=>node.type===reveal),
    photo(file:unknown){(find(node=>node.type===capture).props.onPhotoSelected as (file:unknown)=>void)(file);render();},
    continue(){(find(node=>node.type===reveal).props.onContinue as ()=>void)();render();},
    cancelSpecs(){(find(node=>node.type===specCapture).props.onCancel as ()=>void)();render();},
    begin(id:catalog.ApplimonId){(find(node=>node.type===capture).props.onConfirm as (id:catalog.ApplimonId)=>void)(id);render();},
    unmount(){cleanups.forEach(cleanup=>cleanup?.());},
    setStored(value: DemoProfile | null) { stored = value ? JSON.stringify(value) : null; },
    blockWrite() { writeBlocked = true; }, blockRead() { readBlocked = true; },
    confirm(id: catalog.ApplimonId,device=catalog.createDemoApplimon(id),photo?:unknown) {
      const shown=nodes(tree).find(node=>node.type===reveal);
      if(shown){(shown.props.onContinue as ()=>void)();render();}
      const open=nodes(tree).find(node=>node.type===specCapture);
      if(!open) {
        const photoCapture=nodes(tree).find(node=>node.type===capture);
        if(photoCapture)(photoCapture.props.onConfirm as (id:catalog.ApplimonId)=>void)(id);
        else {const name=catalog.getApplimon(id).name;(find(node=>node.type==="button"&&text(node).startsWith(name)).props.onClick as ()=>void)();}
        render();
      }
      (find(node=>node.type===specCapture).props.onConfirm as (device:catalog.ApplimonDevice,photo?:unknown)=>void)(device,photo); render();
    },
    async click(label: string) { await (find(node => node.type === "button" && text(node).startsWith(label)).props.onClick as () => void)(); render(); },
    stored: () => parseDemoProfile(stored), copied: () => copied,
  };
}

test("received scan link is inert until explicit destination confirmation, then persists reviewed category", async () => {
  const h = scanHarness(undefined, "?appliance=bubbles");
  assert.deepEqual(h.writes, []);
  assert.match(h.text(), /A CATEGORY ARRIVED/);
  await h.click("Meet Bubbles");
  assert.equal(h.writes.length,0);
  h.confirm("bubbles");
  assert.deepEqual(h.stored()?.applianceIds, ["evie", "bubbles"]);
  assert.match(h.text(), /joined your saved home/);
  assert.match(h.text(), /Review any earlier approved simulation/);
  await h.click("Copy transfer link");
  assert.equal(h.copied(), "https://housemates.example/demo/scan?appliance=bubbles");
  assert.equal(h.writes.length, 1);
});

test("scan confirmation merges with latest saved household and duplicate confirmation cannot add another load", () => {
  const h = scanHarness();
  h.setStored({ ...household, regionId: "tokyo", applianceIds: ["evie", "chill"] });
  h.confirm("bubbles");
  assert.equal(h.stored()?.regionId, "tokyo");
  assert.deepEqual(h.stored()?.applianceIds, ["evie", "bubbles", "chill"]);
  h.confirm("bubbles");
  assert.equal(h.writes.length, 1);
  assert.match(h.text(), /already on this team/);
});

test("blocked save keeps preview honest and missing household never invents or overwrites setup", () => {
  const blocked = scanHarness(); blocked.blockWrite(); blocked.confirm("chill");
  assert.match(blocked.text(), /preview only/);
  assert.equal(blocked.revelation(),undefined,"Failed saves cannot show confirmed celebration");
  assert.doesNotMatch(blocked.text(), /See my updated home/);
  assert.deepEqual(blocked.stored()?.applianceIds, ["evie"]);
  const missing = scanHarness(null); missing.confirm("bubbles");
  assert.equal(missing.stored(), null);
  assert.equal(missing.revelation(),undefined);
  assert.equal(missing.writes.length, 0);
  assert.match(missing.text(), /Build a world on this browser/);
  const removed = scanHarness(); removed.setStored(null); removed.confirm("chill");
  assert.equal(removed.writes.length, 0);
  const unreadable = scanHarness(); unreadable.blockRead(); unreadable.confirm("chill");
  assert.equal(unreadable.writes.length, 0);
  assert.equal(unreadable.revelation(),undefined);
  assert.match(unreadable.text(), /Nothing was saved/);
});


test("configured recruitment adds new categories without forcing a legacy surrogate or accepting unreviewed specs", () => {
  const spin=catalog.createDemoApplimon("spin");
  const added=recruitConfiguredApplimon(household,spin);
  assert.deepEqual(added.profile.applianceIds,["evie"]);
  assert.deepEqual(added.profile.applimons,[spin]);
  const updated=recruitConfiguredApplimon(added.profile,{...spin,energyKwh:.8});
  assert.equal(updated.status,"updated");
  assert.equal(updated.profile.applimons?.length,1);
  assert.throws(()=>recruitConfiguredApplimon(household,{...spin,confirmed:false}));
  assert.equal(parseTransferredAppliance("?appliance=spin"),"spin");
});


test("confirmed scan reveal is cosmetic, preserves current household and releases its local photo",()=>{
  const h=scanHarness();const photo={name:"washer.png",type:"image/png",size:3000};h.photo(photo);
  h.confirm("spin");
  assert.equal(h.revelation()?.props.state,"confirmed");assert.equal(h.revelation()?.props.photoUrl,"blob:scan-1");
  assert.equal(h.writes.length,1);assert.equal(h.stored()?.regionId,"bangkok");assert.equal(h.stored()?.planningMode,"carbon");
  h.continue();assert.equal(h.revelation(),undefined);assert.deepEqual(h.revoked,["blob:scan-1"]);
  assert.equal(h.writes.length,1);assert.equal(h.stored()?.applimons?.length,1);
  assert.equal(h.writes.some(value=>value.includes("blob:")||value.includes("washer.png")),false);
  h.confirm("spin",{...catalog.createDemoApplimon("spin"),energyKwh:.8});
  assert.equal(h.writes.length,1);assert.equal(h.stored()?.applimons?.length,1);assert.equal(h.stored()?.applimons?.[0].energyKwh,.7);
  assert.equal(h.stored()?.regionId,"bangkok");assert.equal(h.stored()?.planningMode,"carbon");
});

test("legacy optional photo reaches reveal while canceling character confirmation clears its local photo",()=>{
  const h=scanHarness();h.confirm("spin",catalog.createDemoApplimon("spin"),{name:"nameplate.png",type:"image/png",size:3000});
  assert.equal(h.revelation()?.props.photoUrl,"blob:scan-1");h.unmount();assert.deepEqual(h.revoked,["blob:scan-1"]);
  const canceled=scanHarness();canceled.photo({name:"washer.png",type:"image/png",size:3000});canceled.begin("spin");canceled.cancelSpecs();
  assert.deepEqual(canceled.revoked,["blob:scan-1"]);assert.equal(canceled.writes.length,0);assert.equal(canceled.revelation(),undefined);
});


test("synthetic recruitment preserves newer saved specifications from another tab", () => {
  const h = scanHarness();
  h.begin("spin");
  const newer: catalog.ApplimonDevice = { ...catalog.createDemoApplimon("spin"), energyKwh: .85, ratedPowerW: 2200, earliestStartHour: 10, specSource: "manual" };
  h.setStored({ ...household, regionId: "tokyo", applimons: [newer] });
  h.confirm("spin");
  assert.deepEqual(h.stored()?.applimons, [newer]);
  assert.equal(h.stored()?.regionId, "tokyo");
  assert.equal(h.writes.length, 0, "Already present latest device must not be replaced by the stale confirmation");
  assert.match(h.text(), /saved settings stay unchanged/);
});

test("all ten synthetic categories persist valid inputs and repeated recruitment never duplicates load", () => {
  const h = scanHarness(JSON.stringify({ ...household, applianceIds: [] }));
  for (const entry of catalog.APPLIMON_CATALOG) {
    h.confirm(entry.id);
    const saved = h.stored()?.applimons?.find(device => device.id === entry.id);
    assert.deepEqual(saved, catalog.createDemoApplimon(entry.id));
    const writes = h.writes.length;
    h.confirm(entry.id);
    assert.equal(h.writes.length, writes);
  }
  const saved = h.stored()!;
  assert.equal(saved.applimons?.length, 10);
  assert.deepEqual(saved.applianceIds, ["evie", "bubbles", "chill"]);
  const restored = scanHarness(JSON.stringify(saved));
  restored.confirm("spin");
  assert.equal(restored.writes.length, 0);
  assert.deepEqual(restored.stored(), saved);
});
