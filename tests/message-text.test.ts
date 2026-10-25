import assert from "node:assert/strict";
import test from "node:test";
import { APPLIMON_CATALOG } from "../src/domain/applimon-catalog";
import { formatPhoneReply, formatWebsiteTurn, routeMessageText } from "../src/domain/message-text";

test("normal texting, colon sentences and casual mentions retain both text and active persona", () => {
  for (const text of ["lol", "What do you think?", "Question: why is that cheaper?", "Tomorrow: let's compare options.",
    "I was talking to Evie earlier.", "Evie is funny.", "Can Bubbles help later?", "Hi there: how are you?", "Frost is a refrigerator.", "Hi Bubblesome!", "Hey Chillness?", "  keep my spacing  "])
    assert.deepEqual(routeMessageText(text, "bubbles"), { kind: "message", applianceId: "bubbles", text });
});

test("only explicit colon/comma addresses and named greetings switch the core persona", () => {
  for (const [text, applianceId, body] of [
    ["Evie: Find a cheaper plan", "evie", "Find a cheaper plan"],
    ["Bubbles, how are you?", "bubbles", "how are you?"],
    ["hey Evie, what do you think?", "evie", "what do you think?"],
    ["hi Bubbles how are you?", "bubbles", "how are you?"],
    ["HELLO CHILL: Tell me about yourself", "chill", "Tell me about yourself"],
    ["Hi Evie", "evie", "Hi"],
    ["Hi Bubbles!", "bubbles", "Hi!"],
    ["Hey Chill?", "chill", "Hey?"],
    ["Evie: Bubbles, this is a quoted address.", "evie", "Bubbles, this is a quoted address."],
  ] as const) assert.deepEqual(routeMessageText(text, "chill"), { kind: "message", applianceId, text: body });
  for (const text of ["Evie:", "Bubbles, ", "Chill:   "]) assert.deepEqual(routeMessageText(text, "bubbles"), { kind: "ignore", reason: "empty-address" });
});

test("explicit unsupported catalog addresses are rejected without treating ordinary colon prose as an address", () => {
  for (const item of APPLIMON_CATALOG.filter(item => !["evie", "bubbles", "chill"].includes(item.id))) {
    for (const text of [`${item.name}: hello`, `${item.name}, hello`, `hey ${item.name}, hello`, `hi ${item.name} hello`])
      assert.deepEqual(routeMessageText(text, "evie"), { kind: "ignore", reason: "unsupported-address" });
  }
  assert.deepEqual(routeMessageText("Question: Frost is protected, right?", "chill"), { kind: "message", applianceId: "chill", text: "Question: Frost is protected, right?" });
});

test("natural phone and website formatting preserves exact bodies and labels local simulation fallback", () => {
  const body = "A thoughtful plan sounds lovely!\nWhat matters most to you?";
  assert.equal(formatPhoneReply("evie", "openai", body), `${body}\n\n— Evie`);
  const local = "No plan is approved. Preview costs $2.30; use the current proposal's approval button.";
  assert.equal(formatPhoneReply("bubbles", "local", local), `${local}\n\n— Bubbles · local reply (simulation)`);
  assert.equal(formatWebsiteTurn("chill", "openai", "Hey!\nHow are you?", body), `You (website): Hey!\nHow are you?\n\nChill: ${body}`);
  assert.equal(formatWebsiteTurn("evie", "local", "Review my plan", local), `You (website): Review my plan\n\nEvie · local reply (simulation): ${local}`);
  assert.equal(formatPhoneReply("evie", "openai", body).includes("Review and approve"), false);
});
