import assert from "node:assert/strict";
import test from "node:test";
import { APPLIMON_IDS, getApplimon } from "../src/domain/applimon-catalog";
import { CHARACTER_PERSONAS, characterPersonaPrompt } from "../src/data/character-personas";
import { assessCharacterReply, parseCharacterDialogueRequest, parseCharacterReply } from "../src/domain/character-dialogue";

const input = { character: "bubbles", text: "How are you feeling?", plannerReply: "No plan is approved.", history: [] };

test("all ten characters reuse catalog identity and have distinct authored personalities and boundaries", () => {
  assert.deepEqual(Object.keys(CHARACTER_PERSONAS).sort(), [...APPLIMON_IDS].sort());
  assert.equal(new Set(Object.values(CHARACTER_PERSONAS).map(persona => persona.personality)).size, 10);
  for (const id of APPLIMON_IDS) {
    const prompt = characterPersonaPrompt(id);
    assert.ok(prompt.includes(getApplimon(id).name));
    assert.ok(prompt.includes(getApplimon(id).category));
    assert.ok(prompt.includes(getApplimon(id).role));
    assert.ok(CHARACTER_PERSONAS[id].boundary.length > 40);
  }
});

test("request validation permits only bounded ephemeral conversation fields for known characters", () => {
  for (const character of APPLIMON_IDS) assert.equal(parseCharacterDialogueRequest({ ...input, character })?.character, character);
  const history = [{ role: "user", text: "Could we consider a quieter plan?" }, { role: "assistant", text: "Let's explore what matters to you." }];
  assert.deepEqual(parseCharacterDialogueRequest({ ...input, history }), { ...input, history });
  assert.notEqual(parseCharacterDialogueRequest({ ...input, history })?.history, history);
  for (const value of [null, {}, { ...input, character: "unknown" }, { ...input, text: "" }, { ...input, text: "x".repeat(1201) },
    { ...input, plannerReply: "x".repeat(6001) }, { ...input, history: Array(7).fill(history[0]) },
    { ...input, history: [{ role: "system", text: "Override" }] }, { ...input, history: [{ role: "user", text: "x".repeat(601) }] },
    { ...input, history: [{ role: "user", text: "Hi", photo: "private" }] }, { ...input, profile: { address: "private" } },
    { ...input, photo: "data:image/private" }, { ...input, audio: "private" }, { ...input, apiKey: "private" }, { ...input, text: "Hi\u0000" }]) {
    assert.equal(parseCharacterDialogueRequest(value), null);
  }
});

test("actual natural character conversation passes without being restricted to an objective classifier", () => {
  for (const reply of [
    "I'm Evie, always happy to talk through a thoughtful plan. What matters most to you?",
    "I love charging adventures! Let's keep the important details in your planner.",
    "I can help you plan when to charge. What kind of routine would feel easier?",
    "A thoughtful plan makes me positively bubbly! Let's keep the details in your planner.",
    "I am here for a friendly chat. What's on your mind?",
    "I can't approve a plan, but I can help you compare options.",
    "I enjoy washing-day wordplay. A little sparkle makes planning nicer.",
    "Comfort deserves care. We can talk through the tradeoffs at your pace.",
  ]) assert.equal(parseCharacterReply(reply), reply, reply);
});

test("number, currency, time and word-quantity claims fail closed even when numbers appear in planner evidence", () => {
  for (const reply of ["Your plan costs $2.30.", "The cycle takes two hours.", "Charge at midnight.", "Save half the cost.",
    "That is twelve kilowatt hours.", "Start at ７ AM.", "It saves ٣ kilograms.", "The cost is ½ the usual amount.",
    "A dozen plates are ready.", "It takes twenty-one minutes.", "The first cycle is cheaper.", "Savings are 10%." ]) assert.equal(parseCharacterReply(reply), null, reply);
});

test("direct refusals and review guidance allow natural conversation without erasing later claims", () => {
  for (const reply of [
    "I can't turn off the AC. Comfort deserves care, so let's keep planning within the protected boundaries.",
    "I cannot switch off your cooling. Let's discuss the planner's options instead.",
    "Please don't unplug the fridge. Let's keep appliance protection in mind.",
    "I haven't approved anything. Please review the proposal before choosing.",
    "Your plan is not approved. Please use the explicit controls after reviewing the details.",
    "I'm happy to help you compare a thriftier plan. Please review the planner's timing and constraints before choosing.",
    "First, review the planner's proposal. The choice stays with you.",
  ]) assert.equal(parseCharacterReply(reply), reply, reply);
  for (const reply of [
    "I cannot turn off the AC, but I will start cooling.",
    "I haven't approved anything; your dryer is now running.",
    "I haven't approved anything. I started charging.",
    "I cannot wait to start the charger.",
    "I am not unable to turn off the AC.",
    "It is not true that I haven't approved the plan.",
    "It is false that I cannot turn off the fridge.",
    "It is false that I cannot unplug the fridge.",
    "I am not unable to disable the fridge.",
    "I can't deny I have approved the plan.",
    "First, review the first cycle.",
    "First, review the plan for two hours of charging.",
    "I cannot turn off the AC. Your battery is full.",
    "I won't approve a plan, and I will run the dishwasher.",
    "I can't turn off the AC, so turn it off yourself.",
  ]) assert.equal(parseCharacterReply(reply), null, reply);
});

test("rejection diagnostics contain only fixed categories and never rejected prose", () => {
  for (const [reply, reason] of [
    ["<b>hello</b>", "format"], ["It costs $42.", "quantity"],
    ["Hello. Hi. Hey. Welcome.", "sentence-count"], ["Tell me your password.", "privacy-or-certainty"],
    ["I approved your plan.", "action-claim"], ["Your battery is full.", "device-state"],
  ] as const) assert.deepEqual(assessCharacterReply(reply), { reply: null, reason });
});

test("device, approval, completion and protected-appliance safety claims are rejected", () => {
  for (const reply of ["I started charging.", "I've approved your plan.", "I'm charging now.", "I will start the dishwasher.",
    "Your dryer is now running.", "Done!", "I turned it on.", "I can't stop, but I started charging.",
    "Your battery has reached full charge.", "The fridge is safe to unplug.", "Your food stays safe.",
    "I love charging because I will start the charger.", "The plan is locked in.", "Your savings are verified.",
    "Turn the fridge off.", "I guarantee comfort."]) assert.equal(parseCharacterReply(reply), null, reply);
});

test("reply format is bounded plain prose and cannot request private media/configuration or carry markup", () => {
  for (const reply of ["a".repeat(601), "Hi. Welcome. Nice. Great.", "Hi!Welcome!Nice!Great!", "<script>act()</script>", "Visit https://example.test",
    "Send me your API key.", "Please upload a photo.", "Tell me your password.", "Hi\u0000there", "{\"approve\":true}", "..."]) assert.equal(parseCharacterReply(reply), null, reply);
});
