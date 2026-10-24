import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { interpretApplianceMatches, RECOGNITION_CANDIDATES } from "../src/domain/appliance-recognition";
import { APPLIMON_RECOGNITION_CANDIDATES, APPLIMON_PHOTO_CANDIDATES, interpretApplimonMatches, interpretApplimonPhoto, interpretSiglipApplimonPhoto } from "../src/domain/applimon-recognition";
import * as catalog from "../src/domain/applimon-catalog";

function scores(first: number, score = .75, second?: number, runner = .1) {
  return RECOGNITION_CANDIDATES.map((candidate, index) => ({ label: candidate.label,
    score: index === first ? score : index === second ? runner : (1 - score - (second === undefined ? 0 : runner)) / (RECOGNITION_CANDIDATES.length - (second === undefined ? 1 : 2)) }));
}
test("clear supported matches suggest each appliance without energy/model claims", () => {
  for (const [index, id] of [[0, "evie"], [1, "bubbles"], [2, "chill"]] as const) {
    const result = interpretApplianceMatches(scores(index));
    assert.equal(result.applianceId, id);
    assert.equal(result.status, "suggested");
    assert.match(result.reason, /confirm/);
    assert.equal("powerKw" in result, false);
  }
});
test("unsupported appliances, rooms, people and pets do not get forced into a housemate", () => {
  for (let index = 3; index < RECOGNITION_CANDIDATES.length; index++) {
    const result = interpretApplianceMatches(scores(index));
    assert.equal(result.status, "unsupported");
    assert.equal(result.applianceId, null);
  }
});
test("weak and ambiguous supported matches abstain", () => {
  for (const raw of [scores(1, .3), scores(1, .45, 3, .4), scores(0, .5, 2, .5)]) {
    const result = interpretApplianceMatches(raw);
    assert.equal(result.status, "uncertain");
    assert.equal(result.applianceId, null);
  }
});
test("order does not change a suggestion and returned scores remain relative matches", () => {
  const input = scores(2);
  assert.deepEqual(interpretApplianceMatches(input), interpretApplianceMatches([...input].reverse()));
  assert.equal(input.length, RECOGNITION_CANDIDATES.length);
  assert.equal(interpretApplianceMatches(input).matches[0].score, .75);
});
test("malformed, missing, duplicate, unknown and nonfinite model output fails closed", () => {
  const valid = scores(1);
  const changed = (value: unknown) => [value, ...valid.slice(1)];
  for (const input of [null, {}, [], valid.slice(1), [...valid, valid[0]], changed(valid[1]),
    changed({ label: "unknown", score: .2 }), changed({ label: valid[0].label, score: NaN }),
    changed({ label: valid[0].label, score: Infinity }), changed({ label: valid[0].label, score: -1 }),
    changed({ label: valid[0].label, score: "0.2" }), changed({ label: valid[0].label, score: 1.2 }),
    valid.map(item => ({ ...item, score: .9 }))]) assert.throws(() => interpretApplianceMatches(input));
});

// Exercise the actual component's worker lifecycle without a browser dependency.
// Worker/model execution is browser-verified separately; hooks and JSX are stubs.
type View = { type: unknown; props: Record<string, unknown> };
const usableEvidence = { version: 1, width: 512, height: 512, dominantColorFraction: .1, colorEntropyBits: 6 };
const photoScores = APPLIMON_PHOTO_CANDIDATES.map((candidate,index) => ({ label: candidate.label, score: index === 0 ? .9 : .1 / (APPLIMON_PHOTO_CANDIDATES.length - 1) }));
function captureHarness(catalogMode=false) {
  const state: unknown[] = [], refs: { current: unknown }[] = [];
  const effects: { deps: unknown[]; cleanup: void | (() => void) }[] = [];
  const pending: (() => void)[] = [], revoked: string[] = [], confirmed: string[] = [];
  const photos: unknown[] = [];
  const timers = new Map<number, () => void>();
  let stateIndex = 0, refIndex = 0, effectIndex = 0, urlCount = 0, timerCount = 0;
  let tree: View;
  const workers: FakeWorker[] = [];
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    posted: { requestId: number; photo: unknown } | null = null;
    terminated = false;
    constructor() { workers.push(this); }
    postMessage(value: { requestId: number; photo: unknown }) { this.posted = value; }
    terminate() { this.terminated = true; }
    deliver(message: Record<string, unknown>) { this.onmessage?.({ data: { requestId: this.posted?.requestId, ...message } }); }
  }
  class LocalUrl extends URL {
    static createObjectURL() { return `blob:local-${++urlCount}`; }
    static revokeObjectURL(value: string) { revoked.push(value); }
  }
  const react = {
    useId: () => "capture-test",
    useRef: (value: unknown) => { const index = refIndex++; return refs[index] ?? (refs[index] = { current: value }); },
    useState(value: unknown) {
      const index = stateIndex++;
      if (!(index in state)) state[index] = value;
      return [state[index], (next: unknown) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = effectIndex++;
      const old = effects[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) pending.push(() => {
        old?.cleanup?.(); effects[index] = { deps, cleanup: effect() };
      });
    },
  };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/appliance-capture.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText.replaceAll("import.meta.url", JSON.stringify("file:///src/components/appliance-capture.tsx"));
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source, {
    module: testModule, exports: testModule.exports, URL: LocalUrl, Worker: FakeWorker,
    setTimeout: (callback: () => void) => { timers.set(++timerCount, callback); return timerCount; },
    clearTimeout: (id: number) => timers.delete(id),
    require: (name: string) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "./pixel-appliance") return { PixelAppliance: () => null };
      if (name === "@/domain/appliance-recognition") return { interpretApplianceMatches };
      if (name === "@/domain/applimon-recognition") return { interpretApplimonMatches, interpretApplimonPhoto, interpretSiglipApplimonPhoto };
      if (name === "@/domain/applimon-catalog") return catalog;
      if (name === "./applimon-reveal") return { ApplimonReveal: "reveal" };
      if (name === "./applimon-sprite") return { ApplimonSprite: () => null };
      if (name.endsWith(".css")) return {};
      throw new Error(`Unexpected capture dependency: ${name}`);
    },
  });
  function render() {
    stateIndex = refIndex = effectIndex = 0;
    tree = (testModule.exports as { ApplianceCapture: (props: unknown) => View }).ApplianceCapture({ ...(catalogMode?{catalogMode:true}:{}), onConfirm: (id: string) => confirmed.push(id), onPhotoSelected: (file: unknown) => photos.push(file) });
    pending.splice(0).forEach(effect => effect());
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
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  }
  function find(predicate: (node: View) => boolean) { const node = nodes(tree).find(predicate); assert.ok(node); return node; }
  function button(label: string) { return find(node => node.type === "button" && text(node).startsWith(label)); }
  function click(label: string) { const node = button(label); (node.props.onClick as () => void)(); render(); }
  function upload() {
    const file = { name: "appliance.jpg", type: "image/jpeg", size: 10_000 };
    const node = find(node => node.type === "input" && node.props.type === "file");
    (node.props.onChange as (event: unknown) => void)({ target: { files: [file], value: "photo" } }); render();
    return file;
  }
  render();
  return { render, workers, revoked, confirmed, photos, timers, find, button, click, upload, allNodes: () => nodes(tree), nodeText: text,
    text: () => text(tree), unmount: () => effects.forEach(effect => effect.cleanup?.()) };
}

test("recognition is opt-in and even a strong result cannot select or add an appliance", () => {
  const harness = captureHarness();
  const file = harness.upload();
  assert.equal(harness.workers.length, 0);
  harness.click("Suggest appliance");
  assert.equal(harness.workers[0].posted?.photo, file);
  harness.workers[0].deliver({ status: "complete", matches: scores(1) }); harness.render();
  assert.match(harness.text(), /Suggested match: Dishwasher/);
  assert.equal(harness.button("Confirm housemate").props.disabled, true);
  assert.deepEqual(harness.confirmed, []);
  const radio = harness.find(node => node.type === "input" && node.props.value === "bubbles");
  (radio.props.onChange as () => void)(); harness.render(); harness.click("Confirm housemate");
  assert.deepEqual(harness.confirmed, ["bubbles"]);
  assert.equal(harness.workers[0].terminated, true);
  assert.equal(harness.revoked.length, 1);
});
test("cancel and photo replacement terminate inference and ignore stale results", () => {
  const harness = captureHarness(); harness.upload(); harness.click("Suggest appliance");
  const canceled = harness.workers[0]; harness.click("Cancel recognition");
  canceled.deliver({ status: "complete", matches: scores(1) }); harness.render();
  assert.equal(canceled.terminated, true); assert.doesNotMatch(harness.text(), /Suggested match/);
  harness.click("Suggest appliance"); const replaced = harness.workers[1]; harness.upload();
  replaced.deliver({ status: "complete", matches: scores(2) }); harness.render();
  assert.equal(replaced.terminated, true); assert.doesNotMatch(harness.text(), /Suggested match/);
  assert.equal(harness.revoked.length, 1);
});
test("network failure, timeout, retry and unmount leave a usable manual path", () => {
  const harness = captureHarness(); harness.upload(); harness.click("Suggest appliance");
  harness.workers[0].deliver({ status: "error", message: "Failed to fetch" }); harness.render();
  assert.match(harness.text(), /retry or choose manually/);
  assert.equal(harness.workers[0].terminated, true);
  harness.click("Suggest appliance");
  const expire = [...harness.timers.values()][0]; expire(); harness.render();
  assert.match(harness.text(), /took too long/); assert.equal(harness.workers[1].terminated, true);
  harness.click("Suggest appliance"); harness.unmount();
  assert.equal(harness.workers[2].terminated, true); assert.equal(harness.timers.size, 0);
  assert.equal(harness.revoked.length, 1);
});


test("expanded catalog recognition preserves ten identities and requires explicit review without mutating legacy candidates", () => {
  const matches=(winner:number,top=.8)=>APPLIMON_RECOGNITION_CANDIDATES.map((candidate,index)=>({label:candidate.label,score:index===winner?top:(1-top)/(APPLIMON_RECOGNITION_CANDIDATES.length-1)}));
  for (let index = 0; index < 10; index++) {
    const id = catalog.APPLIMON_IDS[index], result = interpretApplimonMatches(matches(index));
    if (["spin", "tumble", "ember", "misty"].includes(id)) {
      assert.equal(result.applianceId, null, "Similar-looking appliances require the user to choose");
      assert.equal(result.status, "uncertain");
      assert.ok(result.alternatives.includes(id), `${id} remains represented in explicit category choices`);
    } else assert.equal(result.applianceId, id);
  }
  assert.equal(interpretApplimonMatches(matches(10)).status,"unsupported");
  assert.equal(interpretApplimonMatches(matches(3,.3)).status,"uncertain");
  assert.throws(()=>interpretApplimonMatches(scores(1)));
  const h=captureHarness(true);h.upload();h.click("Suggest appliance");
  assert.equal((h.workers[0].posted as unknown as {catalogMode:boolean}).catalogMode,true);
  h.workers[0].deliver({status:"complete",matches:matches(3),photoMatches:photoScores,imageEvidence:usableEvidence});h.render();
  assert.match(h.text(),/Which one is yours/);assert.match(h.text(),/Choose Spin/);assert.match(h.text(),/Choose Tumble/);assert.deepEqual(h.confirmed,[]);
  assert.equal(h.button("Confirm housemate").props.disabled,true);
  h.click("Choose Spin");assert.deepEqual(h.confirmed,[]);h.click("Confirm housemate");
  assert.deepEqual(h.confirmed,["spin"]);
  assert.equal(RECOGNITION_CANDIDATES.length,14);
});


test("capture hands the original File to review without leaking its owned URL or erasing it on confirmation", () => {
  const h = captureHarness(true);
  const file = h.upload();
  assert.equal(h.photos[0], file);
  assert.equal(h.photos.some(value => typeof value === "string"), false);
  (h.find(node => node.type === "input" && node.props.value === "spin").props.onChange as () => void)();
  h.render(); h.click("Confirm housemate");
  assert.deepEqual(h.confirmed, ["spin"]);
  assert.equal(h.photos.at(-1), file, "The next review stage retains the original file");
  assert.equal(h.revoked.length, 1, "Capture releases only its own preview URL");
  h.unmount();
});

test("removing or canceling a photo clears the parent handoff and stale recognition cannot create a reveal", () => {
  const h = captureHarness();
  h.upload(); h.click("Suggest appliance");
  const stale = h.workers[0];
  h.click("Cancel selection");
  assert.equal(h.photos.at(-1), null);
  stale.deliver({ status: "complete", matches: scores(1) }); h.render();
  assert.doesNotMatch(h.text(), /Suggested match/);
  assert.equal(h.button("Confirm housemate").props.disabled, true);
  h.upload(); h.click("Remove photo"); assert.equal(h.photos.at(-1), null);
  h.unmount();
});


test("a new scan clears a previous manual choice and cannot confirm it as the new result", () => {
  const h = captureHarness(); h.upload();
  (h.find(node => node.type === "input" && node.props.value === "chill").props.onChange as () => void)();
  h.render(); assert.equal(h.button("Confirm housemate").props.disabled, false);
  h.click("Suggest appliance"); assert.equal(h.button("Confirm housemate").props.disabled, true);
  h.workers[0].deliver({ status: "complete", matches: scores(1) }); h.render();
  assert.match(h.text(), /Suggested match: Dishwasher/);
  assert.equal(h.button("Confirm housemate").props.disabled, true);
  assert.deepEqual(h.confirmed, []); h.unmount();
});


test("expanded scan cannot reveal a category without a validated image-content result", () => {
  const h = captureHarness(true); h.upload(); h.click("Suggest appliance");
  const matches = APPLIMON_RECOGNITION_CANDIDATES.map((candidate,index) => ({ label: candidate.label, score: index === 3 ? .9 : .1 / (APPLIMON_RECOGNITION_CANDIDATES.length - 1) }));
  h.workers[0].deliver({ status: "complete", matches }); h.render();
  assert.match(h.text(), /unreadable result/);
  assert.doesNotMatch(h.text(), /Suggested match/);
  assert.equal(h.button("Confirm housemate").props.disabled, true);
  assert.deepEqual(h.confirmed, []); h.unmount();
});

test("a completed uncertain scan clearly requests a category and opens the manual path without selecting one", () => {
  const h = captureHarness(); h.upload(); h.click("Suggest appliance");
  h.workers[0].deliver({ status: "complete", matches: scores(1, .3) }); h.render();
  assert.match(h.text(), /Scan complete. Choose a category/);
  assert.match(h.text(), /CHOOSE YOUR APPLIANCE/);
  assert.doesNotMatch(h.text(), /READY TO SCAN|Scan finished. Check the result/);
  assert.equal(h.find(node => node.props.className === "hm-capture-manual").props.open, true);
  assert.equal(h.allNodes().some(node => node.type === "p" && h.nodeText(node).startsWith("Optional local scan")), false, "Completed scans do not repeat the initial download notice");
  assert.equal(h.button("Confirm housemate").props.disabled, true);
  assert.deepEqual(h.confirmed, []);
  h.click("Select appliance");
  assert.equal(h.button("Confirm housemate").props.disabled, true);
  h.upload();
  assert.equal(h.find(node => node.props.className === "hm-capture-manual").props.open, false);
  assert.match(h.text(), /READY TO SCAN/);
  assert.doesNotMatch(h.text(), /Scan complete. Choose a category/);
  h.unmount();
});

test("cancel clears the expanded abstention state and stale completion cannot reopen it", () => {
  const h = captureHarness(); h.upload(); h.click("Suggest appliance");
  const worker = h.workers[0];
  worker.deliver({ status: "complete", matches: scores(3) }); h.render();
  assert.equal(h.find(node => node.props.className === "hm-capture-manual").props.open, true);
  h.click("Cancel selection");
  assert.equal(h.find(node => node.props.className === "hm-capture-manual").props.open, false);
  assert.equal(h.photos.at(-1), null);
  worker.deliver({ status: "complete", matches: scores(3) }); h.render();
  assert.equal(h.find(node => node.props.className === "hm-capture-manual").props.open, false);
  assert.doesNotMatch(h.text(), /Scan complete. Choose a category/);
  assert.equal(h.button("Confirm housemate").props.disabled, true); h.unmount();
});


test("a provisional vehicle suggestion requires a category choice and never claims verified fuel type or specifications", () => {
  const h = captureHarness(true); h.upload(); h.click("Suggest appliance");
  const matches = APPLIMON_RECOGNITION_CANDIDATES.map((candidate,index) => ({ label: candidate.label, score: index === 0 ? .9 : .1 / (APPLIMON_RECOGNITION_CANDIDATES.length - 1) }));
  h.workers[0].deliver({ status: "complete", matches, photoMatches: photoScores, imageEvidence: usableEvidence }); h.render();
  assert.match(h.text(), /Suggested match: EV charging setup/);
  assert.match(h.text(), /Confirm that this is an EV or plug-in hybrid/);
  assert.equal(h.button("Confirm housemate").props.disabled, true);
  assert.deepEqual(h.confirmed, []);
  (h.find(node => node.type === "input" && node.props.value === "evie").props.onChange as () => void)(); h.render();
  h.click("Confirm housemate"); assert.deepEqual(h.confirmed, ["evie"]); h.unmount();
});

test("uncertain categories offer validated alternatives without selecting one; unrelated appliances do not become generic teammates", () => {
  const h = captureHarness(true); h.upload(); h.click("Suggest appliance");
  const matches = APPLIMON_RECOGNITION_CANDIDATES.map((candidate,index) => ({ label: candidate.label, score: index === 3 ? .42 : index === 4 ? .4 : .18 / (APPLIMON_RECOGNITION_CANDIDATES.length - 2) }));
  h.workers[0].deliver({ status: "complete", matches, photoMatches: photoScores, imageEvidence: usableEvidence }); h.render();
  assert.match(h.text(), /Which one is yours/);
  assert.equal(h.button("Confirm housemate").props.disabled, true);
  h.click("Choose Tumble"); assert.equal(h.button("Confirm housemate").props.disabled, false); assert.deepEqual(h.confirmed, []);
  assert.match(h.text(), /Your choice: Clothes dryer/); assert.doesNotMatch(h.text(), /Try a clearer photo/);
  h.upload(); h.click("Suggest appliance");
  const unsupported = APPLIMON_RECOGNITION_CANDIDATES.map((candidate,index) => ({ label: candidate.label, score: index === 10 ? .9 : .1 / (APPLIMON_RECOGNITION_CANDIDATES.length - 1) }));
  h.workers[1].deliver({ status: "complete", matches: unsupported, photoMatches: photoScores, imageEvidence: usableEvidence }); h.render();
  assert.match(h.text(), /Not in this team yet/); assert.match(h.text(), /We model 10 appliance types/);
  assert.equal(h.allNodes().some(node => node.props.className === "hm-capture-alternatives"), false);
  assert.equal(h.button("Confirm housemate").props.disabled, true); h.unmount();
});

test("expanded results without actual pixel evidence fail closed while low-detail evidence gets a distinct manual recovery", () => {
  const h = captureHarness(true); h.upload(); h.click("Suggest appliance");
  const matches = APPLIMON_RECOGNITION_CANDIDATES.map((candidate,index) => ({ label: candidate.label, score: index === 1 ? .9 : .1 / (APPLIMON_RECOGNITION_CANDIDATES.length - 1) }));
  h.workers[0].deliver({ status: "complete", matches, photoMatches: photoScores }); h.render();
  assert.match(h.text(), /unreadable result/); assert.equal(h.button("Confirm housemate").props.disabled, true);
  h.click("Suggest appliance"); h.workers[1].deliver({ status: "complete", matches, photoMatches: photoScores, imageEvidence: { ...usableEvidence, dominantColorFraction: 1, colorEntropyBits: 0 } }); h.render();
  assert.match(h.text(), /We need a little more detail/);
  assert.equal(h.find(node => node.props.className === "hm-capture-manual").props.open, true);
  assert.equal(h.button("Confirm housemate").props.disabled, true); h.unmount();
});

test("a generic or non-electric vehicle match asks about EV eligibility instead of claiming an EV match", () => {
  const h = captureHarness(true); h.upload(); h.click("Suggest appliance");
  const matches = APPLIMON_RECOGNITION_CANDIDATES.map((candidate,index) => ({ label: candidate.label, score: index === 16 ? .9 : .1 / (APPLIMON_RECOGNITION_CANDIDATES.length - 1) }));
  h.workers[0].deliver({ status: "complete", matches, photoMatches: photoScores, imageEvidence: usableEvidence }); h.render();
  assert.match(h.text(), /Vehicle found/);
  assert.match(h.text(), /Is this an EV or plug-in hybrid you charge/);
  assert.doesNotMatch(h.text(), /Suggested match: EV/);
  assert.equal(h.button("Confirm housemate").props.disabled, true);
  assert.deepEqual(h.confirmed, []);
  h.click("Choose Evie");
  assert.deepEqual(h.confirmed, [], "Choosing a charging setup still requires review and confirmation");
  assert.match(h.text(), /Your choice: EV charging setup/);
  h.unmount();
});


test("catalog and legacy capture disclose their respective download sizes before opt-in scanning", () => {
  const expanded = captureHarness(true), legacy = captureHarness();
  expanded.upload(); legacy.upload();
  assert.match(expanded.text(), /first use downloads about 250 MB/);
  assert.doesNotMatch(expanded.text(), /190 MB/);
  assert.match(legacy.text(), /first use downloads about 190 MB/);
  assert.doesNotMatch(legacy.text(), /250 MB/);
  assert.equal(expanded.workers.length, 0); assert.equal(legacy.workers.length, 0);
  expanded.unmount(); legacy.unmount();
});
