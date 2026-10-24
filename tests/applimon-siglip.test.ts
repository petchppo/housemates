import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { interpretSiglipApplimonPhoto, APPLIMON_MODEL, APPLIMON_MODEL_REVISION, APPLIMON_HYPOTHESIS_TEMPLATE } from "../src/domain/applimon-recognition";
import type { ApplianceImageEvidence } from "../src/domain/appliance-image-evidence";

type Fixture = { id: string; categoryMatches: {label: string; score: number}[]; photoMatches: {label: string; score: number}[]; imageEvidence: ApplianceImageEvidence };
// Recorded real model outputs: these regress interpretation, not independent model accuracy.
const recording = JSON.parse(readFileSync(resolve(process.cwd(), "tests/fixtures/applimon-siglip-scores.json"), "utf8")) as {
  model: string; revision: string; hypothesisTemplate: string; fixtures: Fixture[];
};
function fixture(id: string): Fixture { const found = recording.fixtures.find(row => row.id === id); assert.ok(found); return found; }
const interpret = (row: Fixture) => interpretSiglipApplimonPhoto(row.categoryMatches, row.photoMatches, row.imageEvidence);

test("actual SigLIP records retain the evaluated model pin and hypothesis template", () => {
  assert.equal(recording.model, APPLIMON_MODEL);
  assert.equal(recording.revision, APPLIMON_MODEL_REVISION);
  assert.equal(recording.hypothesisTemplate, APPLIMON_HYPOTHESIS_TEMPLATE);
  assert.equal(recording.fixtures.length, 60);
  for (const row of recording.fixtures) assert.equal(interpret(row).reviewRequired, true);
});

test("real robot, retro fridge and installed outdoor AC remain reviewable without a blanket style veto", () => {
  for (const [id, expected] of [["user-robot", "rover"], ["user-retro-fridge", "frost"], ["chill-background-2", "chill"], ["chill-background-3", "chill"]]) {
    assert.equal(interpret(fixture(id)).applianceId, expected, id);
  }
  const tesla = interpret(fixture("user-tesla"));
  assert.equal(tesla.applianceId, null);
  assert.deepEqual(tesla.alternatives, ["evie"]);
  assert.equal(tesla.requiresEvConfirmation, true);
});

test("the real captioned tiger needs subject review despite its strong relative fridge score", () => {
  const result = interpret(fixture("tiger-fridge-caption"));
  assert.equal(result.applianceId, null);
  assert.equal(result.status, "uncertain");
  assert.match(result.reason, /main subject/);
  assert.match(result.reviewNotes.join(" "), /comparisons disagree/);
});

test("real text and blanks fail visual detail checks; unsupported appliances never receive a suggested character", () => {
  for (const id of ["text-only-ac", "text-only-ev", "text-only-fridge", "text-only-footer", "text-only-dishwasher", "blank-white", "blank-black"]) {
    assert.equal(interpret(fixture(id)).recoveryReason, "low-detail", id);
  }
  for (const id of ["microwave-1", "kettle-1", "toaster-1", "television-1", "laptop-1"]) {
    const result = interpret(fixture(id));
    assert.equal(result.status, "unsupported", id);
    assert.deepEqual(result.alternatives, []);
  }
  const car = interpret(fixture("car-1"));
  assert.equal(car.applianceId, null);
  assert.equal(car.requiresEvConfirmation, true);
  assert.match(car.reason, /Is this an EV or plug-in hybrid/);
});

test("the frozen raw strength floor remains active and confusable families require choice", () => {
  for (const id of ["frost-2", "frost-3"]) {
    const result = interpret(fixture(id));
    assert.equal(result.status, "uncertain");
    assert.equal(result.applianceId, null);
    assert.deepEqual(result.alternatives, ["frost"]);
    assert.match(result.reason, /raw visual match is weak/);
  }
  for (const id of ["spin-2", "fresh-washer", "fresh-dryer"]) {
    assert.deepEqual(interpret(fixture(id)).alternatives, ["spin", "tumble"]);
    assert.equal(interpret(fixture(id)).applianceId, null);
  }
  assert.deepEqual(interpret(fixture("ember-3")).alternatives, ["ember", "misty"]);
});

test("both raw model arrays are validated before either normalization or policy shortcuts", () => {
  const row = fixture("user-robot");
  for (const matches of [undefined, [], row.categoryMatches.slice(1), row.categoryMatches.map(r => ({ ...r, score: 0 })),
    row.categoryMatches.map((r, i) => i === 0 ? { ...r, score: NaN } : r)]) {
    assert.throws(() => interpretSiglipApplimonPhoto(matches, row.photoMatches, row.imageEvidence));
  }
  assert.throws(() => interpretSiglipApplimonPhoto(row.categoryMatches, row.photoMatches.slice(1), row.imageEvidence));
  assert.throws(() => interpretSiglipApplimonPhoto(row.categoryMatches, row.photoMatches, undefined));
});
