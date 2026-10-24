import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as legacy from "../src/domain/appliance-recognition";
import * as expanded from "../src/domain/applimon-recognition";
import * as evidence from "../src/domain/appliance-image-evidence";

async function runWorker(catalogMode: boolean, contentFails = false) {
  const messages: Record<string, unknown>[] = [], calls: string[][] = [];
  const paints: { operation: string; color?: string; bounds: number[] }[] = [];
  const callOptions: unknown[] = [];
  const modelRequests: { task: string; model: string; revision: unknown; dtype: unknown; device: unknown }[] = [];
  let disposed = false, closed = false;
  const classifier = Object.assign(async (_image: unknown, labels: string[], options?: { hypothesis_template: string }) => {
    callOptions.push(options ? { hypothesis_template: options.hypothesis_template } : undefined);
    calls.push(Array.from(labels));
    if (calls.length === 2 && contentFails) throw new Error("Content check failed");
    return labels.map((label, index) => ({ label, score: index === 0 ? .9 : .02 }));
  }, { dispose: async () => { disposed = true; } });
  const scope: { onmessage?: (event: unknown) => Promise<void>; postMessage: (message: Record<string, unknown>) => void } = { postMessage: message => messages.push(message) };
  class FakeCanvas {
    width: number; height: number;
    constructor(width: number, height: number) { this.width = width; this.height = height; }
    getContext() { return {
      fillStyle: "#000000",
      fillRect(...bounds: number[]) { paints.push({ operation: "fill", color: this.fillStyle, bounds }); },
      drawImage(_image: unknown, ...bounds: number[]) { paints.push({ operation: "image", bounds }); },
    }; }
  }
  const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/workers/appliance-recognition.worker.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  runInNewContext(source, { module: testModule, exports: testModule.exports, self: scope, Blob,
    createImageBitmap: async () => ({ width: 800, height: 600, close() { closed = true; } }), OffscreenCanvas: FakeCanvas,
    require(name: string) {
      if (name === "@huggingface/transformers") return { env: { backends: { onnx: { wasm: {} } } }, pipeline: async (task: string, model: string, options: Record<string, unknown>) => { modelRequests.push({ task, model, revision: options.revision, dtype: options.dtype, device: options.device }); return classifier; }, RawImage: { fromCanvas: () => ({ width: 2, height: 2, channels: 4, data: new Uint8Array([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]) }) } };
      if (name === "../domain/appliance-recognition") return legacy;
      if (name === "../domain/applimon-recognition") return expanded;
      if (name === "../domain/appliance-image-evidence") return evidence;
      throw Error(`Unexpected worker dependency ${name}`);
    },
  });
  await scope.onmessage?.({ data: { requestId: 7, photo: new Blob(["image fixture"], { type: "image/jpeg" }), catalogMode } });
  return { calls, messages, disposed, closed, paints, modelRequests, callOptions };
}

test("expanded worker finishes only after category and image-content checks on one classifier", async () => {
  const result = await runWorker(true);
  assert.deepEqual(result.calls, [expanded.APPLIMON_RECOGNITION_CANDIDATES.map(row => row.label), expanded.APPLIMON_PHOTO_CANDIDATES.map(row => row.label)]);
  const completed = result.messages.filter(row => row.status === "complete");
  assert.equal(completed.length, 1);
  const raw = completed[0].matches as {score:number}[];
  assert.equal(raw[0].score, .9); assert.equal(raw[1].score, .02, "Raw independent sigmoid scores are not normalized by the worker");
  assert.equal(Array.isArray(completed[0].photoMatches), true);
  assert.equal(completed[0].requestId, 7);
  assert.equal((completed[0].imageEvidence as evidence.ApplianceImageEvidence).dominantColorFraction, .25);
  assert.equal((completed[0].imageEvidence as evidence.ApplianceImageEvidence).colorEntropyBits, 2);
  assert.equal(result.disposed, true); assert.equal(result.closed, true);
});

test("a failed content check produces no partial category completion and releases resources", async () => {
  const result = await runWorker(true, true);
  assert.equal(result.messages.some(row => row.status === "complete"), false);
  assert.equal(result.messages.at(-1)?.status, "error");
  assert.equal(result.disposed, true); assert.equal(result.closed, true);
});

test("legacy three-appliance mode retains its original single comparison", async () => {
  const result = await runWorker(false);
  assert.deepEqual(result.calls, [legacy.RECOGNITION_CANDIDATES.map(row => row.label)]);
  assert.equal(result.messages.at(-1)?.status, "complete");
  assert.equal("photoMatches" in result.messages.at(-1)!, false);
  assert.equal("imageEvidence" in result.messages.at(-1)!, false);
});

test("transparent photo preprocessing paints a complete white background before drawing the resized image", async () => {
  const result = await runWorker(true);
  assert.deepEqual(result.paints, [
    { operation: "fill", color: "#ffffff", bounds: [0, 0, 512, 384] },
    { operation: "image", bounds: [0, 0, 512, 384] },
  ]);
});


test("catalog scans request pinned SigLIP q8 while legacy scans retain their pinned CLIP model", async () => {
  const catalog = await runWorker(true), original = await runWorker(false);
  assert.deepEqual(catalog.modelRequests, [{ task: "zero-shot-image-classification", model: "Xenova/siglip-base-patch16-224", revision: "4649052661e53c7000355844105f8a1792088239", dtype: "q8", device: "wasm" }]);
  assert.deepEqual(original.modelRequests, [{ task: "zero-shot-image-classification", model: "Xenova/clip-vit-base-patch32", revision: "d15189d7028b43f1d3e65039190477f6af591c2a", dtype: "q8", device: "wasm" }]);
  assert.deepEqual(catalog.callOptions, [{ hypothesis_template: "This is a photo of {}." }, { hypothesis_template: "This is a photo of {}." }]);
  assert.deepEqual(original.callOptions, [undefined]);
  assert.equal(catalog.disposed, true); assert.equal(original.disposed, true);
});
