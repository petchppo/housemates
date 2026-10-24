import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { analyzeApplianceImage, validateApplianceImageEvidence, type ApplianceImageEvidence } from "../src/domain/appliance-image-evidence";
import { interpretApplimonMatches, interpretApplimonPhoto } from "../src/domain/applimon-recognition";

type Fixture = { id: string; categoryMatches: {label: string; score: number}[]; photoMatches: {label: string; score: number}[]; imageEvidence: ApplianceImageEvidence };
// Recorded actual q8 CPU outputs and image pixel metrics. Tests regress interpretation, not model accuracy.
const fixtures = (JSON.parse(readFileSync(resolve(process.cwd(), "tests/fixtures/applimon-photo-scores.json"), "utf8")) as {fixtures: Fixture[]}).fixtures;
function fixture(id: string): Fixture { const found = fixtures.find(row => row.id === id); assert.ok(found); return found; }
const interpret = (row: Fixture) => interpretApplimonPhoto(row.categoryMatches, row.photoMatches, row.imageEvidence);

test("actual low-detail appliance words and blank images abstain without treating style as authenticity", () => {
  for (const id of ["text-only-ac", "text-only-dishwasher", "text-only-ev", "text-only-fridge", "text-only-footer", "blank-white", "blank-black"]) {
    const result = interpret(fixture(id));
    assert.notEqual(result.status, "suggested");
    assert.equal(result.applianceId, null);
    assert.equal(result.recoveryReason, "low-detail");
    assert.deepEqual(result.alternatives, []);
    assert.equal(result.reviewRequired, true);
  }
});

test("actual clear photos and user appliance examples receive provisional categories", () => {
  for (const [id, expected] of [["bubbles", "bubbles"], ["evie", "evie"], ["frost", "frost"], ["breeze", "breeze"],
    ["user-retro-fridge", "frost"], ["user-robot", "rover"]]) {
    const result = interpret(fixture(id));
    assert.equal(result.applianceId, expected, id);
    assert.equal(result.reviewRequired, true);
    assert.equal(result.requiresEvConfirmation, expected === "evie");
    if (expected === "evie") assert.match(result.reviewNotes.join(" "), /plug-in hybrid/);
  }
});

test("drawing and product-style scores are advisory and cannot veto a clear category with usable pixels", () => {
  const clear = fixture("bubbles"), cartoon = fixture("cartoon-washer");
  const result = interpretApplimonPhoto(clear.categoryMatches, cartoon.photoMatches, clear.imageEvidence);
  assert.equal(result.applianceId, "bubbles");
  assert.equal(result.reviewRequired, true);
  assert.match(result.reviewNotes.join(" "), /style does not prove authenticity/);
  assert.deepEqual(result.alternatives, []);
});

test("unsupported categories have no misleading alternatives and uncertain alternatives require explicit selection", () => {
  const microwave = interpret(fixture("microwave"));
  assert.equal(microwave.applianceId, null);
  assert.equal(microwave.recoveryReason, "unsupported");
  assert.deepEqual(microwave.alternatives, []);
  const row = fixture("spin");
  const result = interpretApplimonMatches(row.categoryMatches);
  assert.equal(result.status, "uncertain");
  assert.equal(result.applianceId, null);
  assert.ok(result.alternatives.length > 0 && result.alternatives.length <= 3);
  assert.equal(new Set(result.alternatives).size, result.alternatives.length);
});

test("observed laundry and tank-family confusions require a category choice instead of a false character", () => {
  for (const id of ["tumble-1", "tumble-3", "spin-1"]) {
    const result = interpret(fixture(id));
    assert.equal(result.applianceId, null);
    assert.equal(result.recoveryReason, "uncertain");
    assert.deepEqual(result.alternatives, ["spin", "tumble"]);
  }
  for (const id of ["ember-3", "kettle-1"]) {
    const result = interpret(fixture(id));
    assert.equal(result.applianceId, null);
    assert.equal(result.recoveryReason, "uncertain");
    assert.deepEqual(result.alternatives, ["ember", "misty"]);
    assert.match(result.reason, /unsupported appliances/);
  }
});

test("gasoline-car and user Tesla comparisons offer a vehicle question, never an asserted EV category", () => {
  for (const id of ["car-1", "user-tesla"]) {
    const result = interpret(fixture(id));
    assert.equal(result.applianceId, null);
    assert.equal(result.status, "uncertain");
    assert.equal(result.recoveryReason, "uncertain");
    assert.deepEqual(result.alternatives, ["evie"]);
    assert.equal(result.requiresEvConfirmation, true);
    assert.equal(result.reviewRequired, true);
    assert.match(result.reason, /Is this an EV or plug-in hybrid/);
    assert.match(result.reviewNotes.join(" "), /Confirm.*EV or plug-in hybrid/);
  }
});

test("missing or malformed model outputs and pixel evidence fail closed", () => {
  const row = fixture("bubbles");
  const duplicate = structuredClone(row.photoMatches); duplicate[0] = duplicate[1];
  const nonfinite = structuredClone(row.photoMatches); nonfinite[0].score = NaN;
  for (const invalid of [undefined, null, [], row.photoMatches.slice(1), duplicate, nonfinite, row.categoryMatches]) {
    assert.throws(() => interpretApplimonPhoto(row.categoryMatches, invalid, row.imageEvidence));
  }
  for (const invalid of [undefined, {}, { ...row.imageEvidence, dominantColorFraction: NaN },
    { ...row.imageEvidence, colorEntropyBits: -1 }, { ...row.imageEvidence, width: 4096 }]) {
    assert.throws(() => interpretApplimonPhoto(row.categoryMatches, row.photoMatches, invalid));
  }
  assert.throws(() => interpretApplimonPhoto([], row.photoMatches, row.imageEvidence));
});

test("pixel evidence handles transparent blanks, measured color diversity and invalid buffers", () => {
  const transparent = analyzeApplianceImage({ width: 2, height: 2, channels: 4, data: new Uint8Array(16) });
  const white = analyzeApplianceImage({ width: 2, height: 2, channels: 3, data: new Uint8Array(12).fill(255) });
  assert.deepEqual(transparent, white);
  assert.equal(white.dominantColorFraction, 1);
  assert.equal(white.colorEntropyBits, 0);
  const colorful = analyzeApplianceImage({ width: 2, height: 2, channels: 3, data: [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255] });
  assert.equal(colorful.dominantColorFraction, .25);
  assert.equal(colorful.colorEntropyBits, 2);
  assert.deepEqual(validateApplianceImageEvidence({ ...colorful, injectedCategory: "evie" }), colorful);
  for (const data of [[0], [256, 0, 0], [-1, 0, 0], [NaN, 0, 0], [.5, 0, 0]]) {
    assert.throws(() => analyzeApplianceImage({ width: 1, height: 1, channels: 3, data }));
  }
  assert.throws(() => analyzeApplianceImage({ width: 513, height: 1, channels: 3, data: new Uint8Array(1539) }));
});
