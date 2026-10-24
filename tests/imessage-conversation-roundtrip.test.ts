import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as characterContract from "../src/domain/character-dialogue";
import type { ApplianceId } from "../src/domain/appliances";
import { buildDemoScenario, DEFAULT_DEMO_PROFILE } from "../src/domain/demo";
import { createDemoCommandSession, requestDemoCommand } from "../src/domain/demo-commands";
import { IMessageBridge, type BridgeConfig, type sendBlueBubblesText } from "../src/server/imessage-bridge";
import type { useHouseholdConversation } from "../src/components/use-household-conversation";

const hookSource = ts.transpileModule(readFileSync(resolve("src/components/use-household-conversation.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const now = Date.UTC(2026, 9, 24);
const sender = "+15551234567";
const config: BridgeConfig = { url: "http://127.0.0.1:1234", password: "fixture-only", webhookSecret: "fixture-secret-not-used-for-network-1234", allowedSender: sender, recipient: "fixture@example.com" };
const event = (text: string, id: string) => ({ type: "new-message", data: { guid: id, text, isFromMe: false, dateCreated: now, handle: { address: sender }, chats: [{ guid: `iMessage;-;${sender}` }], attachments: [] } });
const flush = () => new Promise<void>(done => setImmediate(done));
type PhoneMessage = { id: string; applianceId: ApplianceId; text: string; expiresAt: number };

/** Runs the real shared hook and canonical planner; only React scheduling and provider I/O are fixtures. */
function household() {
  const scenario = buildDemoScenario({ ...DEFAULT_DEMO_PROFILE, applianceIds: ["evie", "bubbles", "chill"], weatherMode: "synthetic" });
  let session = createDemoCommandSession(scenario);
  const plannerCalls: { id: ApplianceId; text: string; reply: string }[] = [];
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  const callbacks: { value: unknown; deps: unknown[] }[] = [], effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  const pending: (() => void)[] = [], layouts: (() => void)[] = [];
  const timers = new Map<number, () => void>();
  let si = 0, ri = 0, ci = 0, ei = 0, timerId = 0;
  const requests: { body: characterContract.CharacterDialogueRequest; resolve: (response: Response) => void }[] = [];
  const react = {
    useState(initial: unknown) { const i = si++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], (value: unknown) => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
    useRef(initial: unknown) { const i = ri++; return refs[i] ?? (refs[i] = { current: initial }); },
    useCallback(value: unknown, deps: unknown[]) { const i = ci++, old = callbacks[i]; if (!old || deps.length !== old.deps.length || deps.some((item, j) => item !== old.deps[j])) callbacks[i] = { value, deps }; return callbacks[i].value; },
    useEffect(fn: () => void | (() => void), deps: unknown[]) { const i = ei++, old = effects[i]; if (!old || deps.length !== old.deps.length || deps.some((item, j) => item !== old.deps[j])) pending.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() || undefined }; }); },
    useLayoutEffect(fn: () => void | (() => void), deps: unknown[]) { const before = pending.length; react.useEffect(fn, deps); layouts.push(...pending.splice(before)); },
  };
  const fixture = { exports: {} };
  runInNewContext(hookSource, {
    module: fixture, exports: fixture.exports, AbortController,
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setTimeout: (fn: () => void) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
    fetch: (_url: string, init: RequestInit) => init.method === "POST"
      ? new Promise<Response>(resolve => requests.push({ body: JSON.parse(String(init.body)), resolve }))
      : Promise.resolve(Response.json({ status: "configured" })),
    require: (name: string) => { if (name === "react") return react; if (name === "@/domain/character-dialogue") return characterContract; throw new Error(name); },
  });
  const hook = (fixture.exports as { useHouseholdConversation: typeof useHouseholdConversation }).useHouseholdConversation;
  function render() {
    si = ri = ci = ei = 0;
    const result = hook("roundtrip-household", (id, text) => {
      const computed = requestDemoCommand(session, scenario, id, text); session = computed.session;
      plannerCalls.push({ id, text, reply: computed.reply }); return computed.reply;
    });
    layouts.splice(0).forEach(fn => fn()); pending.splice(0).forEach(fn => fn()); return result;
  }
  const bridge = new IMessageBridge(() => now);
  const pair = bridge.create(config).body as { token: string; code: string };
  bridge.receive(event(`PAIR ${pair.code}`, "phone-proof"), config);
  const deliveries: { chat: string; text: string; id: string }[] = [];
  const send: typeof sendBlueBubblesText = async (_config, chat, text, id) => { deliveries.push({ chat, text, id }); };
  return {
    bridge, pair, deliveries, send, render, requests, plannerCalls, session: () => session,
    async ready() { render(); await flush(); return render(); },
    phone(text: string, id: string) {
      assert.equal(bridge.receive(event(text, id), config).body.queued, true);
      const message = (bridge.poll(pair.token).body.messages as PhoneMessage[]).find(item => item.id === id);
      assert.ok(message); assert.ok(message.expiresAt > now); return message;
    },
    resolveReply(reply: string) {
      assert.equal(characterContract.parseCharacterReply(reply), reply, "fixture must pass the real response validator");
      requests.at(-1)!.resolve(Response.json({ source: "openai", reply }));
    },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
  };
}

test("verified phone → shared AI conversation → web reply → bridge, then web follow-up carries the same history", async () => {
  const h = household(), conversation = await h.ready();
  const first = h.phone("Evie: I enjoy quiet road trips", "phone-first");
  const pending = conversation.dispatch(first.applianceId, first.text, { origin: "imessage", messageId: first.id, signal: new AbortController().signal });
  assert.equal(h.render().forCharacter("evie").history.at(-1)?.text, first.text);
  assert.equal(h.requests.length, 1); assert.equal(h.plannerCalls.length, 1);
  assert.equal(h.requests[0].body.plannerReply, h.plannerCalls[0].reply);
  h.resolveReply("Quiet-road spirit suits me! Tell me about your favorite journeys.");
  const phoneReply = await pending; assert.ok(phoneReply);
  assert.equal(h.render().forCharacter("evie").reply, phoneReply.text);
  assert.equal((await h.bridge.reply(h.pair.token, first.id, phoneReply.text, config, h.send, phoneReply.source)).status, 200);
  assert.equal(h.deliveries.length, 1);
  assert.equal(h.deliveries[0].chat, `iMessage;-;${sender}`);
  assert.ok(h.deliveries[0].text.includes(phoneReply.text));
  assert.match(h.deliveries[0].text, /Evie.*AI dialogue/);
  assert.equal(h.render().outboundTurns[0].origin, "imessage", "phone return is tagged to prevent web-mirror echoes");

  const web = h.render().dispatch("evie", "Do you remember what I enjoy?", { origin: "web" });
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests[1].body.history, [{ role: "user", text: first.text }, { role: "assistant", text: phoneReply.text }]);
  assert.equal(h.requests[1].body.character, "evie");
  h.resolveReply("Quiet road trips are your style! That sounds like a lovely escape.");
  const webReply = await web; assert.ok(webReply);
  const turn = h.render().outboundTurns.at(-1)!;
  assert.equal(turn.origin, "web"); assert.equal(turn.reply.text, webReply.text);
  assert.equal(h.render().forCharacter("evie").reply, webReply.text);
  const publication = { id: turn.id, applianceId: turn.applianceId, userText: turn.userText, text: turn.reply.text, source: turn.reply.source };
  assert.equal((await h.bridge.publish(h.pair.token, publication, config, h.send)).status, 200);
  assert.equal(h.deliveries.length, 2); assert.ok(h.deliveries[1].text.includes(webReply.text));
  assert.ok(h.deliveries[1].text.includes(turn.userText));
  await h.bridge.publish(h.pair.token, publication, config, h.send);
  assert.equal(h.deliveries.length, 2, "replayed publication cannot duplicate a message");
  assert.equal(h.requests.length, 2, "delivery never makes another model request");

  const followup = h.phone("Tell me more", "plain-followup");
  assert.equal(followup.applianceId, "evie");
  const next = h.render().dispatch(followup.applianceId, followup.text, { origin: "imessage", messageId: followup.id });
  assert.equal(h.requests[2].body.history.length, 4);
  assert.equal(h.requests[2].body.history.at(-1)?.text, webReply.text);
  h.resolveReply("Happy to keep chatting about the journey!"); await next;
  assert.equal(h.plannerCalls.length, 3); h.unmount();
});

test("provider failure yields the same labeled local reply on website and phone; phone approval never starts execution", async () => {
  const h = household(); await h.ready();
  for (const [index, input] of ["Evie: Find a cheaper plan", "approve"].entries()) {
    const message = h.phone(input, `fallback-${index}`);
    const pending = h.render().dispatch(message.applianceId, message.text, { origin: "imessage", messageId: message.id });
    h.requests.at(-1)!.resolve(Response.json({ error: "provider-quota" }, { status: 502 }));
    const reply = await pending; assert.ok(reply); assert.equal(reply.source, "local");
    assert.equal(reply.text, h.plannerCalls.at(-1)!.reply);
    assert.equal(h.render().forCharacter("evie").reply, reply.text);
    assert.equal((await h.bridge.reply(h.pair.token, message.id, reply.text, config, h.send, reply.source)).status, 200);
    assert.ok(h.deliveries.at(-1)!.text.includes(reply.text));
    assert.match(h.deliveries.at(-1)!.text, /local planner/);
    assert.equal(h.session().approved, null); assert.equal(h.session().status, "idle");
  }
  assert.ok(h.session().pending, "a proposal may exist, but a phone message cannot approve it");
  assert.equal(h.plannerCalls.length, 2); assert.equal(h.requests.length, 2); h.unmount();
});

test("mirrored Bubbles turn routes a plain phone follow-up to Bubbles while Evie context stays separate", async () => {
  const h = household(); await h.ready();
  const evie = h.render().dispatch("evie", "Quiet journeys please", { origin: "web" });
  h.resolveReply("Quiet journeys sound lovely!"); await evie;
  const bubbles = h.render().dispatch("bubbles", "Hello from the kitchen", { origin: "web" });
  assert.equal(h.requests.at(-1)!.body.character, "bubbles"); assert.deepEqual(h.requests.at(-1)!.body.history, []);
  h.resolveReply("Kitchen chatter makes me smile!"); await bubbles;
  const turn = h.render().outboundTurns.at(-1)!;
  await h.bridge.publish(h.pair.token, { id: turn.id, applianceId: turn.applianceId, userText: turn.userText, text: turn.reply.text, source: turn.reply.source }, config, h.send);
  const phone = h.phone("What were we discussing?", "kitchen-followup");
  assert.equal(phone.applianceId, "bubbles");
  const pending = h.render().dispatch(phone.applianceId, phone.text, { origin: "imessage", messageId: phone.id });
  assert.deepEqual(h.requests.at(-1)!.body.history, [{ role: "user", text: "Hello from the kitchen" }, { role: "assistant", text: turn.reply.text }]);
  h.resolveReply("Our kitchen hello was a cheerful beginning!"); await pending;
  assert.equal(h.render().forCharacter("evie").history.length, 2);
  assert.equal(h.render().forCharacter("bubbles").history.length, 4); h.unmount();
});
