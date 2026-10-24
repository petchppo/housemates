import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as memory from "../src/domain/memory";
import type { HouseholdState } from "../src/domain/household";

// Exercise the actual browser-store module without a DOM, browser, or test package.
// React hooks are minimal test doubles; persistence/restoration is the real module.
const source = ts.transpileModule(
  readFileSync(resolve(process.cwd(), "src/components/use-household.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;

type StoreSnapshot = {
  state: HouseholdState;
  ready: boolean;
  persistence: "pending" | "saved" | "session";
  notice: string | null;
};
type StoreApi = {
  useHousehold(): StoreSnapshot;
  resetHousehold(): void;
  updateHousehold(transition: (state: HouseholdState) => HouseholdState): void;
};
type StorageBehavior = { readFail?: boolean; writeFail?: boolean; removeFail?: boolean; initial?: string | null };

function createStoreHarness({ readFail = false, writeFail = false, removeFail = false, initial = null }: StorageBehavior = {}) {
  let stored = initial;
  let writes = 0;
  const effects: (() => void)[] = [];
  const testModule: { exports: unknown } = { exports: {} };
  const react = {
    useEffect: (effect: () => void) => effects.push(effect),
    useSyncExternalStore: (_subscribe: unknown, get: () => StoreSnapshot) => get(),
  };
  const localStorage = {
    getItem(key: string) {
      assert.equal(key, memory.STORAGE_KEY);
      if (readFail) throw new Error("Storage access is blocked.");
      return stored;
    },
    setItem(key: string, value: string) {
      assert.equal(key, memory.STORAGE_KEY);
      if (writeFail) throw new Error("Storage write failed.");
      writes++;
      stored = value;
    },
    removeItem(key: string) {
      assert.equal(key, memory.STORAGE_KEY);
      if (removeFail) throw new Error("Storage removal is blocked.");
      stored = null;
    },
  };
  runInNewContext(source, {
    module: testModule,
    exports: testModule.exports,
    window: { localStorage },
    require: (name: string) => {
      if (name === "react") return react;
      if (name === "@/domain/memory") return memory;
      throw new Error(`Unexpected browser-store dependency: ${name}`);
    },
  });
  const api = testModule.exports as StoreApi;
  const beforeHydration = api.useHousehold();
  assert.equal(beforeHydration.ready, false);
  assert.equal(beforeHydration.persistence, "pending");
  assert.equal(writes, 0);
  const hydrate = effects.shift();
  assert.ok(hydrate);
  hydrate();
  return { api, snapshot: () => api.useHousehold(), stored: () => stored, writes: () => writes };
}

function rememberedHousehold() {
  const state = memory.createInitialHouseholdState("2026-10-24T17:00:00.000Z");
  state.preferences.dishwasherCutoffHour = 22;
  return memory.serializeHouseholdState(state);
}

test("browser memory is marked saved only after initial defaults are successfully written", () => {
  const harness = createStoreHarness();
  assert.equal(harness.snapshot().ready, true);
  assert.equal(harness.snapshot().persistence, "saved");
  assert.equal(harness.snapshot().notice, null);
  assert.equal(harness.writes(), 1);
  assert.ok(harness.stored());
  assert.equal(JSON.parse(harness.stored()!).version, 1);
});

test("blocked browser storage reads preserve a usable session-only household", () => {
  const harness = createStoreHarness({ readFail: true });
  const snapshot = harness.snapshot();
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.persistence, "session");
  assert.equal(snapshot.state.requests.length, 2);
  assert.match(snapshot.notice ?? "", /storage is unavailable/i);
  assert.equal(harness.writes(), 0);
});

test("blocked writes preserve loaded preferences and new in-session changes without claiming persistence", () => {
  const original = rememberedHousehold();
  const harness = createStoreHarness({ initial: original, writeFail: true });
  assert.equal(harness.snapshot().state.preferences.dishwasherCutoffHour, 22);
  assert.equal(harness.snapshot().persistence, "session");
  assert.match(harness.snapshot().notice ?? "", /cannot save/i);
  harness.api.updateHousehold(state => ({ ...state, mode: "carbon" }));
  assert.equal(harness.snapshot().state.mode, "carbon");
  assert.equal(harness.snapshot().persistence, "session");
  assert.match(harness.snapshot().notice ?? "", /may not survive a refresh/i);
  assert.equal(harness.stored(), original);
});

test("reset erases old memory even when writing the replacement defaults fails", () => {
  const harness = createStoreHarness({ initial: rememberedHousehold(), writeFail: true });
  harness.api.resetHousehold();
  assert.equal(harness.stored(), null);
  assert.equal(harness.snapshot().state.preferences.dishwasherCutoffHour, null);
  assert.equal(harness.snapshot().state.savedPlans.length, 0);
  assert.equal(harness.snapshot().persistence, "session");
  assert.match(harness.snapshot().notice ?? "", /memory was cleared/i);
});

test("reset warns that old data may return when both erasing and writing browser storage fail", () => {
  const original = rememberedHousehold();
  const harness = createStoreHarness({ initial: original, writeFail: true, removeFail: true });
  harness.api.resetHousehold();
  assert.equal(harness.stored(), original);
  assert.equal(harness.snapshot().state.preferences.dishwasherCutoffHour, null);
  assert.equal(harness.snapshot().persistence, "session");
  assert.match(harness.snapshot().notice ?? "", /old data may return on refresh/i);
});

test("corrupt browser data is replaced with validated defaults before displaying saved status", () => {
  const harness = createStoreHarness({ initial: "{broken json" });
  assert.equal(harness.snapshot().persistence, "saved");
  assert.ok(harness.snapshot().notice);
  assert.ok(harness.stored());
  const repaired = memory.restoreHouseholdState(harness.stored(), "2026-10-24T17:00:00.000Z");
  assert.equal(repaired.notice, null);
  assert.equal(repaired.state.proposalStatus, "none");
  assert.equal(repaired.state.savedPlans.length, 0);
});
