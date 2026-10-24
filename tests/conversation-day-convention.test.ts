import assert from "node:assert/strict";
import test from "node:test";
import { parseHouseholdIntent, type ConstraintUpdate } from "../src/domain/conversation";

function changes(input: string, dayConvention?: "overnight" | "day-one"): ConstraintUpdate[] {
  const result = parseHouseholdIntent(input, dayConvention ? { dayConvention } : {});
  assert.equal(result.kind, "plan", `Expected a plan for: ${input}`);
  if (result.kind !== "plan") throw new Error("Expected parsed plan");
  return result.changes;
}

test("day-one convention keeps daytime job windows and deadlines on the first day", () => {
  assert.deepEqual(changes("Bubbles start between 9 AM and 4 PM", "day-one"),
    [{ applianceId: "bubbles", earliestHour: 9, latestHour: 16 }]);
  assert.deepEqual(changes("Bubbles finish by 10 AM", "day-one"),
    [{ applianceId: "bubbles", deadlineHour: 10 }]);
  assert.deepEqual(changes("Evie do not start before 6 AM", "day-one"),
    [{ applianceId: "evie", earliestHour: 6 }]);
  assert.deepEqual(changes("Bubbles start before noon", "day-one"),
    [{ applianceId: "bubbles", latestHour: 11 }]);
});

test("day-one windows crossing midnight advance only the end into day two", () => {
  for (const convention of ["day-one", "overnight"] as const) {
    assert.deepEqual(changes("Bubbles from 11 PM to 2 AM", convention),
      [{ applianceId: "bubbles", earliestHour: 23, latestHour: 26 }]);
    assert.deepEqual(changes("Evie between 11 PM and midnight", convention),
      [{ applianceId: "evie", earliestHour: 23, latestHour: 24 }]);
  }
  assert.deepEqual(changes("Bubbles between midnight and 3 AM", "day-one"),
    [{ applianceId: "bubbles", earliestHour: 0, latestHour: 3 }]);
});

test("explicit today and tomorrow override either convention and anchor the window end", () => {
  for (const convention of ["day-one", "overnight"] as const) {
    assert.deepEqual(changes("Evie by 7 AM tomorrow", convention),
      [{ applianceId: "evie", deadlineHour: 31 }]);
    assert.deepEqual(changes("Evie by today 7 AM", convention),
      [{ applianceId: "evie", deadlineHour: 7 }]);
    assert.deepEqual(changes("Bubbles between tomorrow 9 AM and 4 PM", convention),
      [{ applianceId: "bubbles", earliestHour: 33, latestHour: 40 }]);
    assert.deepEqual(changes("Bubbles from Day 1 11 PM to Day 2 2 AM", convention),
      [{ applianceId: "bubbles", earliestHour: 23, latestHour: 26 }]);
  }
});

test("legacy calls retain evening-to-next-morning behavior without opting into day-one", () => {
  assert.deepEqual(changes("Evie charged by 7 AM"),
    [{ applianceId: "evie", deadlineHour: 31 }]);
  assert.deepEqual(changes("Bubbles between 1 AM and 4 AM"),
    [{ applianceId: "bubbles", earliestHour: 25, latestHour: 28 }]);
  assert.deepEqual(changes("Bubbles finish by midnight"),
    [{ applianceId: "bubbles", deadlineHour: 24 }]);
  assert.deepEqual(changes("Bubbles between 8 PM and 10 PM"),
    [{ applianceId: "bubbles", earliestHour: 20, latestHour: 22 }]);
  assert.deepEqual(changes("Bubbles finish by breakfast", "day-one"),
    [{ applianceId: "bubbles", deadlineHour: 31 }], "The documented breakfast shortcut remains explicitly Day 2");
});

test("new day convention keeps ambiguous minutes, conflicting days and third-day windows rejected", () => {
  for (const dayConvention of ["day-one", "overnight"] as const) {
    for (const input of ["Bubbles by 9:30 AM", "Bubbles by today 9 AM tomorrow", "Bubbles by Day 3 8 AM",
      "Bubbles between tomorrow 11 PM and 2 AM", "Bubbles by 9 AM; Bubbles by 10 AM"]) {
      assert.equal(parseHouseholdIntent(input, { dayConvention }).kind, "clarify", input);
    }
  }
});

test("day convention changes only time defaults while retaining modes and explicit approval classification", () => {
  for (const dayConvention of ["day-one", "overnight"] as const) {
    for (const [input, mode] of [["Find a cheaper plan", "cost"], ["Find a lower-carbon plan", "carbon"], ["Make a balanced plan", "balanced"]]) {
      const result = parseHouseholdIntent(input, { dayConvention });
      assert.equal(result.kind, "plan");
      if (result.kind === "plan") { assert.equal(result.mode, mode); assert.deepEqual(result.changes, []); }
    }
    assert.equal(parseHouseholdIntent("Approve", { dayConvention }).kind, "approve");
    assert.equal(parseHouseholdIntent("Turn off the AC", { dayConvention }).kind, "comfort");
  }
});
