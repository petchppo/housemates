import assert from "node:assert/strict";
import test from "node:test";
import { casualFallback } from "../src/domain/casual-dialogue";
import type { ApplianceId } from "../src/domain/appliances";

test("exact casual phrases get authored replies for each character with ordinary punctuation", () => {
  for (const character of ["evie", "bubbles", "chill"] as const) {
    for (const text of ["lol", "Lol!", "LMAO...", "haha?", "hi", "hello!", "HEY,", " thanks ", "Thank you!", "thank  you…", "lol !!!"]) {
      const reply = casualFallback(character, text);
      assert.equal(typeof reply, "string", `${character}: ${text}`);
      assert.doesNotMatch(reply!, /\d|[$%]|approved|started|connected|completed|saved|guarantee/i);
    }
  }
  assert.notEqual(casualFallback("evie", "lol"), casualFallback("bubbles", "lol"));
  assert.notEqual(casualFallback("bubbles", "hi"), casualFallback("chill", "hi"));
  assert.notEqual(casualFallback("chill", "thanks"), casualFallback("evie", "thanks"));
});

test("mixed planning, constraints, approval and device requests never become casual fallback", () => {
  for (const text of [
    "lol approve", "lmao run it", "haha start charging", "hi charge by 7 AM", "hello, find a cheaper plan",
    "hey lower carbon", "thanks, finish by 10 PM", "thank you; approve", "lol\nstop the AC",
    "hi 7", "hello $3", "lol status", "hi reset", "thanks disconnect", "lol turn off Chill",
    "lol and hi", "hello Evie", "Evie: lol", "hi<script>", "lol/approve", "hi\u0000", "hi\u200b",
    "haha haha", "hahaha", "lol;", "hi 😀", "", " ", "x".repeat(1200),
  ]) assert.equal(casualFallback("evie", text), null, text);
  assert.equal(casualFallback("other" as ApplianceId, "hello"), null);
  assert.equal(casualFallback("evie", null as unknown as string), null);
});
