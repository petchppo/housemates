import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FilePairingStore, householdContextHash, MemoryPairingStore, pairingHash, REMEMBER_MS, type RememberedPairing } from "../src/server/imessage-pairing-store";

const binding: RememberedPairing = { credentialHash: pairingHash("fixture-device-credential"), contextHash: pairingHash("fixture-household"), configFingerprint: pairingHash("fixture-config"), chatGuid: "iMessage;-;fixture@example.test", createdAt: 100, expiresAt: 100 + REMEMBER_MS };
function directory() { return mkdtempSync(join(tmpdir(), "housemates-pairings-test-")); }

test("private atomic registry persists only schema-approved binding metadata and one-way hashes", () => {
  const dir = directory(), file = join(dir, "private", "imessage-pairings.json");
  try {
    const store = new FilePairingStore(file);
    assert.deepEqual(store.read(), []);
    assert.equal(existsSync(file), false);
    store.write([binding]);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(statSync(join(dir, "private")).mode & 0o777, 0o700);
    assert.deepEqual(new FilePairingStore(file).read(), [binding]);
    const raw = readFileSync(file, "utf8");
    for (const forbidden of ["fixture-device-credential", "fixture-household", "fixture-config", "transcript", "password", "apiKey"]) assert.equal(raw.includes(forbidden), false);
    store.write([{ ...binding, expiresAt: binding.expiresAt + 500 }]);
    assert.equal(store.read()[0].expiresAt, binding.expiresAt + 500);
    assert.deepEqual(readdirSync(join(dir, "private")), ["imessage-pairings.json"], "no temporary credential files remain");
    assert.throws(() => store.write([{ ...binding, message: "never persist conversation" } as RememberedPairing]));
    assert.equal(store.read()[0].expiresAt, binding.expiresAt + 500, "failed validation preserves prior atomic file");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("corrupt, oversized, permissive, symlinked or structurally invalid registries fail closed", () => {
  const dir = directory(), file = join(dir, "pairings.json"), store = new FilePairingStore(file);
  try {
    for (const raw of ["not json", "x".repeat(65_537), JSON.stringify({ version: 2, bindings: [] }),
      JSON.stringify({ version: 1, bindings: [{ ...binding, text: "private transcript" }] }),
      ...["credentialHash", "contextHash", "configFingerprint"].map(field => JSON.stringify({ version: 1, bindings: [{ ...binding, [field]: [binding.credentialHash] }] })),
      JSON.stringify({ version: 1, bindings: [binding, binding] }),
    ]) {
      writeFileSync(file, raw, { mode: 0o600 });
      assert.throws(() => store.read());
      assert.throws(() => store.write([]));
      assert.equal(readFileSync(file, "utf8"), raw);
    }
    writeFileSync(file, JSON.stringify({ version: 1, bindings: [binding] })); chmodSync(file, 0o644);
    assert.throws(() => store.read()); chmodSync(file, 0o600);
    const link = join(dir, "linked.json"); symlinkSync(file, link);
    assert.throws(() => new FilePairingStore(link).read());
    assert.throws(() => new FilePairingStore(link).write([]));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("memory storage isolates copies and context hashes reject invalid or oversized input", () => {
  const store = new MemoryPairingStore(); store.write([binding]);
  store.read()[0].contextHash = "changed";
  assert.deepEqual(store.read(), [binding]);
  assert.equal(householdContextHash("household A"), pairingHash("household A"));
  assert.notEqual(householdContextHash("household A"), householdContextHash("household B"));
  for (const invalid of [null, {}, "", " ", "x".repeat(16_385), "private\u0000key"]) assert.equal(householdContextHash(invalid), null);
  assert.ok(householdContextHash("家".repeat(16_384)));
});
