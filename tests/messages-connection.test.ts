import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { MessageConversationHandler, MessageConversationOptions, MessageConversationReply, MessageSyncTurn } from "../src/domain/message-conversation";

type Element = { type: unknown; props: Record<string, unknown> };
const jsx = (type: unknown, props: Element["props"]): Element => typeof type === "function" ? type(props) : { type, props };
const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/messages-connection.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join(" ");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
function harness(options: { available?: boolean; replyFails?: boolean; publishFails?: boolean; handler?: MessageConversationHandler; outboundTurns?: MessageSyncTurn[]; paired?: boolean } = {}) {
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [], pending: (() => void)[] = [];
  const timers = new Map<number, () => void>(), listeners = new Map<string, () => void>();
  const deadlines = new Map<number, { fn: () => void; ms: number }>();
  let si = 0, ri = 0, ei = 0, timerId = 0, dirty = false, mounted = true, tree: Element;
  let pollCount = 0, replyCount = 0, disconnectCount = 0;
  let queue: { id: string; applianceId: string; text: string; expiresAt?: number }[] = [];
  let clock = Date.now();
  class ClockDate extends Date { static now() { return clock; } }
  let deferredPoll: (() => Promise<Response>) | null = null;
  let deferredReply: (() => Promise<Response>) | null = null;
  let deferredPublish: (() => Promise<Response>) | null = null;
  let expired = false;
  let paired = options.paired ?? true;
  let outboundTurns = options.outboundTurns;
  let handler = options.handler;
  const commands: string[] = [];
  const commandOptions: MessageConversationOptions[] = [];
  const replies: Record<string, unknown>[] = [], publishes: Record<string, unknown>[] = [], dismissed: string[] = [];
  const deliveries: Record<string, unknown>[] = [];
  const react = {
    useState(initial: unknown) { const index = si++; if (!(index in states)) states[index] = initial;
      return [states[index], (next: unknown) => { const value = typeof next === "function" ? next(states[index]) : next; if (!Object.is(value, states[index])) { states[index] = value; dirty = true; } }]; },
    useRef(initial: unknown) { const index = ri++; return refs[index] ?? (refs[index] = { current: initial }); },
    useEffect(fn: () => void | (() => void), deps: unknown[]) { const index = ei++, old = effects[index];
      if (!old || old.deps.length !== deps.length || deps.some((v, i) => !Object.is(v, old.deps[i]))) pending.push(() => { old?.cleanup?.(); effects[index] = { deps, cleanup: fn() || undefined }; }); },
    useLayoutEffect(fn: () => void | (() => void), deps: unknown[]) { react.useEffect(fn, deps); },
  };
  const document = { hidden: false, addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) };
  const fetcher = async (_url: unknown, init?: RequestInit) => {
    if (init?.method !== "POST") return Response.json({ available: options.available ?? true, message: "Bridge status" });
    const body = JSON.parse(String(init.body));
    if (body.action === "pair") return Response.json({ token: "a".repeat(64), code: "ABCDE1234567", recipient: "housemates@example.com", expiresAt: clock + 300000 });
    if (body.action === "disconnect") { disconnectCount++; return Response.json({ disconnected: true }); }
    if (body.action === "poll") { pollCount++; if (deferredPoll) return deferredPoll(); if (expired) return Response.json({ error: "Pairing expired" }, { status: 401 }); return Response.json({ state: paired ? "paired" : "awaiting-pair", messages: paired ? queue.map(message => "expiresAt" in message ? message : { ...message, expiresAt: clock + 300000 }) : [] }); }
    if (body.action === "reply") { replyCount++; replies.push(body); deliveries.push(body); if (deferredReply) return deferredReply(); if (options.replyFails) throw Error("uncertain delivery"); return Response.json({ delivered: true }); }
    if (body.action === "publish") { publishes.push(body); deliveries.push(body); if (deferredPublish) return deferredPublish(); if (options.publishFails) throw Error("uncertain publish delivery"); return Response.json({ delivered: true }); }
    if (body.action === "dismiss") { dismissed.push(body.id); queue = queue.filter(message => message.id !== body.id); return Response.json({ dismissed: true }); }
    throw Error("Unknown API action");
  };
  const testModule = { exports: {} };
  runInNewContext(source, { module: testModule, exports: testModule.exports, document, fetch: fetcher, AbortController, Error, Date: ClockDate,
    window: { setInterval: (fn: () => void) => { timers.set(++timerId, fn); return timerId; }, clearInterval: (id: number) => timers.delete(id), setTimeout: (fn: () => void, ms: number) => { deadlines.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: (id: number) => deadlines.delete(id) },
    require: (name: string) => { if (name === "react") return react; if (name === "react/jsx-runtime") return { jsx, jsxs: jsx }; if (name.endsWith(".css")) return {}; throw Error(name); },
  });
  const Component = (testModule.exports as { MessagesConnection: (props: unknown) => Element }).MessagesConnection;
  function render() { si = ri = ei = 0; dirty = false; tree = Component({ contextKey: "home-A", applianceIds: ["evie", "bubbles"], outboundTurns, onCommand: (id: "evie" | "bubbles" | "chill", message: string, context: MessageConversationOptions) => { commands.push(message); commandOptions.push(context); return handler ? handler(id, message, context) : "Computed reply"; } }); pending.splice(0).forEach(fn => fn()); }
  async function settle() { for (let i = 0; i < 25; i++) { await Promise.resolve(); if (mounted && dirty) render(); } }
  function button(label: string) { const found = nodes(tree).find(node => node.type === "button" && text(node).includes(label)); assert.ok(found); return found; }
  async function click(label: string) { const node = button(label); assert.notEqual(node.props.disabled, true); await (node.props.onClick as () => Promise<void>)(); await settle(); }
  render();
  return { settle, click, button, commands, commandOptions, replies, publishes, deliveries, dismissed, document, timers, listeners, text: () => text(tree),
    queue(value: typeof queue) { queue = value; }, defer(fn: (() => Promise<Response>) | null) { deferredPoll = fn; }, deferReply(fn: (() => Promise<Response>) | null) { deferredReply = fn; },
    deferPublish(fn: (() => Promise<Response>) | null) { deferredPublish = fn; },
    timeout: async (maxMs = Infinity) => { [...deadlines.values()].filter(deadline => deadline.ms <= maxMs).forEach(deadline => deadline.fn()); await settle(); },
    deadlines: () => [...deadlines.values()].map(deadline => deadline.ms),
    now: () => clock,
    advance(ms: number) { clock += ms; },
    handler(fn: MessageConversationHandler) { handler = fn; },
    async outbound(turns: MessageSyncTurn[]) { outboundTurns = turns; render(); await settle(); },
    pairState(value: boolean) { paired = value; },
    async visibility(hidden: boolean) { document.hidden = hidden; listeners.get("visibilitychange")?.(); await settle(); },
    expire() { expired = true; }, counts: () => ({ pollCount, replyCount, disconnectCount }),
    tick: async () => { timers.forEach(fn => fn()); await settle(); },
    unmount: () => { mounted = false; effects.forEach(effect => effect.cleanup?.()); } };
}

test("Messages UI has no provider activity or pairing when unconfigured", async () => {
  const ui = harness({ available: false }); await ui.settle();
  assert.equal(ui.button("Pair my iPhone").props.disabled, true);
  assert.equal(ui.timers.size, 0); assert.deepEqual(ui.commands, []);
  ui.unmount();
});

test("stalled polling fetch and response body time out and later messages still arrive", async () => {
  for (const bodyStalls of [false, true]) {
    const ui = harness(); await ui.settle(); await ui.click("Pair my iPhone");
    let release!: (value: Response) => void;
    const stalled = new Promise<Response>(resolve => { release = resolve; });
    ui.defer(bodyStalls ? async () => ({ json: () => stalled }) as unknown as Response : () => stalled);
    await ui.tick(); await ui.timeout();
    assert.match(ui.text(), /CONNECTION INTERRUPTED/);
    ui.defer(null);
    await ui.tick();
    assert.match(ui.text(), /Connection restored/);
    assert.doesNotMatch(ui.text(), /Retrying the connection automatically/);
    ui.queue([{ id: "fresh-after-timeout", applianceId: "evie", text: "Status" }]);
    await ui.tick();
    assert.deepEqual(ui.commands, ["Status"]);
    assert.equal(ui.counts().replyCount, 1);
    assert.match(ui.text(), /PAIRED TO THIS TAB/);
    release(Response.json({ state: "paired", messages: [{ id: "stale", applianceId: "evie", text: "old request" }] }));
    await ui.settle(); assert.deepEqual(ui.commands, ["Status"]);
    ui.unmount();
  }
});

test("a stalled reply is never resent and does not block the next phone request", async () => {
  const ui = harness(); await ui.settle(); await ui.click("Pair my iPhone");
  ui.deferReply(() => new Promise(() => {}));
  ui.queue([{ id: "first", applianceId: "evie", text: "First request" }]);
  await ui.tick(); await ui.timeout();
  assert.match(ui.text(), /no automatic resend/);
  ui.deferReply(null);
  ui.queue([{ id: "first", applianceId: "evie", text: "First request" }, { id: "second", applianceId: "evie", text: "Second request" }]);
  await ui.tick(); await ui.tick();
  assert.deepEqual(ui.commands, ["First request", "Second request"]);
  assert.equal(ui.counts().replyCount, 2);
  ui.unmount();
});

test("actual Messages component imports each phone request once even when delivery fails", async () => {
  const ui = harness({ replyFails: true }); await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([{ id: "message-1", applianceId: "evie", text: "Find a cheaper plan" }]);
  await ui.tick(); await ui.tick();
  assert.deepEqual(ui.commands, ["Find a cheaper plan"]); assert.equal(ui.counts().replyCount, 1);
  assert.match(ui.text(), /uncertain delivery/);
  await ui.click("Disconnect Messages"); assert.equal(ui.timers.size, 0); assert.equal(ui.listeners.size, 0);
  assert.equal(ui.counts().disconnectCount, 1); ui.unmount();
});

test("hidden or unmounted households ignore in-flight messages and revoke the capability", async () => {
  const ui = harness(); await ui.settle(); await ui.click("Pair my iPhone");
  let release!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; }); ui.defer(() => pending);
  const tick = ui.tick(); ui.document.hidden = true;
  release(Response.json({ state: "paired", messages: [{ id: "late-1", applianceId: "evie", text: "approve" }] }));
  await tick; assert.deepEqual(ui.commands, []);
  const polls = ui.counts().pollCount; await ui.tick(); assert.equal(ui.counts().pollCount, polls);
  ui.unmount(); await ui.settle(); assert.equal(ui.timers.size, 0); assert.equal(ui.counts().disconnectCount, 1);
});

test("expired pairing clears the paired claim and returns to explicit pairing", async () => {
  const ui = harness(); await ui.settle(); await ui.click("Pair my iPhone");
  assert.match(ui.text(), /PAIRED TO THIS TAB/);
  ui.expire(); await ui.tick();
  assert.doesNotMatch(ui.text(), /PAIRED TO THIS TAB/); assert.match(ui.text(), /Pairing expired/);
  assert.equal(ui.button("Pair my iPhone").props.disabled, false); assert.equal(ui.timers.size, 0); ui.unmount();
});

test("phone turns await the shared AI dispatcher and send its exact reply once", async () => {
  let release!: (reply: MessageConversationReply) => void;
  const pending = new Promise<MessageConversationReply>(resolve => { release = resolve; });
  const ui = harness({ handler: () => pending }); await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([{ id: "phone-ai", applianceId: "evie", text: "Remember our earlier conversation?" }]);
  await ui.tick(); await ui.tick();
  assert.deepEqual(ui.commands, ["Remember our earlier conversation?"]);
  assert.equal(ui.replies.length, 0, "transport must not send a local reply before the shared AI completes");
  assert.equal(ui.commandOptions[0].messageId, "phone-ai");
  assert.equal(ui.commandOptions[0].signal.aborted, false);
  release({ text: "Glad to pick up our conversation!", source: "openai" });
  await ui.settle(); await ui.tick();
  assert.equal(ui.replies.length, 1);
  assert.equal(ui.replies[0].text, "Glad to pick up our conversation!");
  assert.equal(ui.replies[0].source, "openai");
  assert.deepEqual(ui.commands, ["Remember our earlier conversation?"]);
  ui.unmount();
});

test("queued phone requests run sequentially through the same conversation dispatcher", async () => {
  let release!: (reply: MessageConversationReply) => void;
  const first = new Promise<MessageConversationReply>(resolve => { release = resolve; });
  const ui = harness({ handler: (_id, message) => message === "First" ? first : { text: "Continuing the conversation", source: "openai" } });
  await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([{ id: "sequence-a", applianceId: "evie", text: "First" }, { id: "sequence-b", applianceId: "evie", text: "Second" }]);
  await ui.tick(); assert.deepEqual(ui.commands, ["First"]);
  release({ text: "First response", source: "openai" });
  await ui.settle(); await ui.tick();
  assert.deepEqual(ui.commands, ["First", "Second"]);
  assert.deepEqual(ui.replies.map(reply => reply.text), ["First response", "Continuing the conversation"]);
  ui.unmount();
});

test("later messages in a polled batch cannot run after expiring behind an earlier AI turn", async () => {
  let release!: (reply: MessageConversationReply) => void;
  const pending = new Promise<MessageConversationReply>(resolve => { release = resolve; });
  const ui = harness({ handler: () => pending }); await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([
    { id: "still-current", applianceId: "evie", text: "First request", expiresAt: ui.now() + 30_000 },
    { id: "expires-in-batch", applianceId: "evie", text: "Old queued request", expiresAt: ui.now() + 1_000 },
  ]);
  await ui.tick(); assert.deepEqual(ui.commands, ["First request"]);
  ui.advance(2_000);
  release({ text: "Current reply", source: "openai" }); await ui.settle(); await ui.tick();
  assert.deepEqual(ui.commands, ["First request"], "stale queued requests must be rechecked immediately before dispatch");
  assert.deepEqual(ui.replies.map(reply => reply.text), ["Current reply"]);
  ui.unmount();
});

test("a phone turn cancels at its message expiry even before the normal model timeout", async () => {
  let release!: (reply: MessageConversationReply) => void;
  const pending = new Promise<MessageConversationReply>(resolve => { release = resolve; });
  const ui = harness({ handler: () => pending }); await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([{ id: "expires-during-ai", applianceId: "evie", text: "Nearly expired request", expiresAt: ui.now() + 1_000 }]);
  await ui.tick();
  assert.ok(ui.deadlines().includes(1_000), "the model deadline must fit inside the mailbox lifetime");
  ui.advance(1_000); await ui.timeout(1_000);
  assert.equal(ui.commandOptions[0].signal.aborted, true);
  release({ text: "Late reply", source: "openai" }); await ui.settle();
  assert.equal(ui.replies.length, 0);
  ui.handler(() => ({ text: "Fresh reply", source: "openai" }));
  ui.queue([{ id: "fresh-after-expiry", applianceId: "evie", text: "Fresh request" }]); await ui.tick();
  assert.deepEqual(ui.commands, ["Nearly expired request", "Fresh request"]);
  assert.deepEqual(ui.replies.map(reply => reply.text), ["Fresh reply"]);
  ui.unmount();
});

test("expired and malformed mailbox lifetimes cannot dispatch a conversation", async () => {
  const ui = harness(); await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([
    { id: "expired", applianceId: "evie", text: "Old request", expiresAt: ui.now() },
    { id: "missing-expiry", applianceId: "evie", text: "Missing expiry", expiresAt: undefined },
    { id: "invalid-expiry", applianceId: "evie", text: "Invalid expiry", expiresAt: Number.NaN },
  ]);
  await ui.tick(); assert.deepEqual(ui.commands, []); assert.equal(ui.replies.length, 0);
  ui.unmount();
});

test("phone conversation can wait behind web turns until its mailbox deadline", async () => {
  let release!: (reply: MessageConversationReply) => void;
  const pending = new Promise<MessageConversationReply>(resolve => { release = resolve; });
  const ui = harness({ handler: () => pending }); await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([{ id: "slow-ai", applianceId: "evie", text: "A slow conversation" }]);
  await ui.tick();
  assert.ok(ui.deadlines().includes(300_000));
  await ui.timeout(20_000);
  assert.equal(ui.commandOptions[0].signal.aborted, false, "model work must not inherit the bridge HTTP deadline");
  ui.advance(40_000); await ui.timeout(35_000);
  assert.equal(ui.commandOptions[0].signal.aborted, false, "two bounded web turns ahead of a phone turn must not cancel that queued phone turn");
  release({ text: "Shared reply after the earlier web turns", source: "openai" }); await ui.settle();
  assert.equal(ui.replies.length, 1);
  assert.equal(ui.replies[0].text, "Shared reply after the earlier web turns");
  ui.unmount();
});

test("the shared conversation deadline is bounded by mailbox expiry and late output is discarded", async () => {
  let release!: (reply: MessageConversationReply) => void;
  const pending = new Promise<MessageConversationReply>(resolve => { release = resolve; });
  const ui = harness({ handler: () => pending }); await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([{ id: "slow-ai", applianceId: "evie", text: "A slow conversation" }]);
  await ui.tick(); ui.advance(300_000); await ui.timeout(300_000);
  assert.equal(ui.commandOptions[0].signal.aborted, true);
  assert.equal(ui.replies.length, 0);
  release({ text: "Too late", source: "openai" }); await ui.settle();
  assert.equal(ui.replies.length, 0, "late model output cannot be sent after cancellation");
  ui.handler(() => ({ text: "Recovered", source: "openai" }));
  ui.queue([{ id: "recovered-ai", applianceId: "evie", text: "Continue" }]);
  await ui.tick();
  assert.deepEqual(ui.commands, ["A slow conversation", "Continue"]);
  assert.equal(ui.replies.length, 1); assert.equal(ui.replies[0].text, "Recovered");
  ui.unmount();
});

test("committed shared turns preserve web-phone-web delivery order after deferred React updates", async () => {
  let release!: (reply: MessageConversationReply) => void;
  const pending = new Promise<MessageConversationReply>(resolve => { release = resolve; });
  const ui = harness({ handler: () => pending, outboundTurns: [] });
  await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([{ id: "phone-order", applianceId: "evie", text: "Phone after web" }]); await ui.tick();
  const earlier = webTurn("earlier-web"), later = webTurn("later-web");
  const reply = { text: "Exact phone response", source: "openai" as const };
  release(reply); await ui.settle();
  assert.equal(ui.deliveries.length, 0, "do not send the phone reply before the shared completion snapshot commits");
  await ui.outbound([earlier, { id: "imessage-committed", applianceId: "evie", userText: "Phone after web", reply, origin: "imessage" }, later]);
  await ui.tick();
  assert.deepEqual(ui.deliveries.map(turn => [turn.action, turn.text]), [
    ["publish", earlier.reply.text], ["reply", reply.text], ["publish", later.reply.text],
  ]);
  assert.deepEqual(ui.commands, ["Phone after web"], "mirroring must never run the shared dispatcher again");
  ui.unmount();
});

test("a previous identical phone turn cannot satisfy a new phone completion fence", async () => {
  const reply = { text: "Repeated exact response", source: "openai" as const };
  const historical: MessageSyncTurn = { id: "old-phone", applianceId: "evie", userText: "Hello again", reply, origin: "imessage" };
  const ui = harness({ handler: async () => reply, outboundTurns: [historical] });
  await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([{ id: "fresh-phone", applianceId: "evie", text: "Hello again" }]); await ui.tick();
  assert.equal(ui.replies.length, 0);
  await ui.outbound([historical, { ...historical, id: "new-phone" }]); await ui.tick();
  assert.equal(ui.replies.length, 1); assert.equal(ui.replies[0].id, "fresh-phone");
  ui.unmount();
});

test("resetting shared history drops unsent web replies from the previous conversation", async () => {
  const ui = harness({ outboundTurns: [] }); await ui.settle(); await ui.click("Pair my iPhone");
  await ui.outbound([webTurn("before-reset")]);
  await ui.outbound([]); await ui.tick();
  assert.equal(ui.publishes.length, 0);
  const fresh = webTurn("after-reset"); await ui.outbound([fresh]); await ui.tick();
  assert.deepEqual(ui.publishes.map(turn => turn.id), [fresh.id]);
  ui.unmount();
});

test("hiding while awaiting the shared React commit suppresses the late phone reply", async () => {
  const reply = { text: "A response awaiting display", source: "openai" as const };
  const ui = harness({ handler: async () => reply, outboundTurns: [] });
  await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([{ id: "pending-display", applianceId: "evie", text: "Wait for display" }]); await ui.tick();
  assert.equal(ui.replies.length, 0);
  await ui.visibility(true);
  await ui.outbound([{ id: "late-shared-turn", applianceId: "evie", userText: "Wait for display", reply, origin: "imessage" }]);
  await ui.visibility(false); await ui.tick();
  assert.equal(ui.replies.length, 0); assert.equal(ui.publishes.length, 0);
  ui.unmount();
});

test("reset during delivery of an earlier web turn prevents the now-stale phone reply", async () => {
  let finishPhone!: (reply: MessageConversationReply) => void, finishPublish!: (response: Response) => void;
  const phone = new Promise<MessageConversationReply>(resolve => { finishPhone = resolve; });
  const publish = new Promise<Response>(resolve => { finishPublish = resolve; });
  const ui = harness({ handler: () => phone, outboundTurns: [] });
  await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([{ id: "reset-during-mirror", applianceId: "evie", text: "Phone follows web" }]); await ui.tick();
  const reply = { text: "Phone context before reset", source: "openai" as const };
  finishPhone(reply); await ui.settle();
  ui.deferPublish(() => publish);
  await ui.outbound([webTurn("queued-earlier"), { id: "phone-committed-before-reset", applianceId: "evie", userText: "Phone follows web", reply, origin: "imessage" }]);
  assert.equal(ui.publishes.length, 1); assert.equal(ui.replies.length, 0);
  await ui.outbound([]);
  finishPublish(Response.json({ delivered: true })); await ui.settle(); await ui.tick();
  assert.equal(ui.replies.length, 0, "a context reset while an earlier delivery is in flight invalidates the phone completion fence");
  ui.unmount();
});

test("hiding, disconnecting or unmounting aborts a pending conversation and never sends stale output", async () => {
  for (const action of ["hide", "disconnect", "unmount"] as const) {
    let release!: (reply: MessageConversationReply) => void;
    const pending = new Promise<MessageConversationReply>(resolve => { release = resolve; });
    const ui = harness({ handler: () => pending }); await ui.settle(); await ui.click("Pair my iPhone");
    ui.queue([{ id: `cancel-${action}`, applianceId: "evie", text: "Pending turn" }]);
    await ui.tick();
    if (action === "hide") await ui.visibility(true);
    else if (action === "disconnect") await ui.click("Disconnect Messages");
    else ui.unmount();
    assert.equal(ui.commandOptions[0].signal.aborted, true, action);
    release({ text: "Stale reply", source: "openai" }); await ui.settle();
    assert.equal(ui.replies.length, 0, action);
    if (action !== "unmount") ui.unmount();
  }
});

test("canceled or failed conversation dispatch is never mislabeled or sent as an AI reply", async () => {
  for (const handler of [async () => undefined, async () => { throw Error("Conversation unavailable"); }] satisfies MessageConversationHandler[]) {
    const ui = harness({ handler }); await ui.settle(); await ui.click("Pair my iPhone");
    ui.queue([{ id: "no-reply", applianceId: "evie", text: "Hello" }]);
    await ui.tick(); await ui.tick();
    assert.deepEqual(ui.commands, ["Hello"]);
    assert.equal(ui.replies.length, 0);
    assert.ok(ui.dismissed.includes("no-reply"), "consumed conversation failures must leave the mailbox");
    ui.unmount();
  }
});

test("local conversation fallback preserves its source and exact reply", async () => {
  const ui = harness({ handler: async () => ({ text: "The planner needs your review.", source: "local", notice: "AI unavailable" }) });
  await ui.settle(); await ui.click("Pair my iPhone");
  ui.queue([{ id: "fallback", applianceId: "evie", text: "Make a plan" }]);
  await ui.tick();
  assert.equal(ui.replies[0].text, "The planner needs your review.");
  assert.equal(ui.replies[0].source, "local");
  ui.unmount();
});

function webTurn(id: string, origin: "web" | "imessage" = "web"): MessageSyncTurn {
  return { id, applianceId: "evie", userText: `Hello ${id}`, reply: { text: `Reply ${id}`, source: "openai" }, origin };
}

test("only new web turns after pairing mirror to iMessage without replay or phone echoes", async () => {
  const historical = webTurn("historical");
  const ui = harness({ outboundTurns: [historical], paired: false }); await ui.settle();
  await ui.click("Pair my iPhone");
  const beforeProof = webTurn("before-proof"); await ui.outbound([historical, beforeProof]); await ui.tick();
  assert.equal(ui.publishes.length, 0);
  ui.pairState(true); await ui.tick();
  assert.equal(ui.publishes.length, 0, "pairing must not publish earlier conversation history");
  const fresh = webTurn("fresh-web"), echoed = webTurn("phone-origin", "imessage");
  await ui.outbound([historical, beforeProof, fresh, echoed]); await ui.tick(); await ui.tick();
  assert.equal(ui.publishes.length, 1);
  assert.equal(ui.publishes[0].id, fresh.id);
  assert.equal(ui.publishes[0].applianceId, "evie");
  assert.equal(ui.publishes[0].userText, fresh.userText);
  assert.equal(ui.publishes[0].text, fresh.reply.text);
  assert.equal(ui.publishes[0].source, "openai");
  assert.deepEqual(ui.commands, [], "mirroring a completed turn must not invoke the model/planner again");
  await ui.outbound([fresh, echoed]); await ui.tick();
  assert.equal(ui.publishes.length, 1);
  ui.unmount();
});

test("uncertain web-turn delivery is not retried and later turns can still publish", async () => {
  const ui = harness({ publishFails: true }); await ui.settle(); await ui.click("Pair my iPhone");
  const first = webTurn("uncertain-web"); await ui.outbound([first]); await ui.tick(); await ui.tick();
  assert.equal(ui.publishes.length, 1);
  const second = webTurn("next-web"); await ui.outbound([first, second]); await ui.tick();
  assert.equal(ui.publishes.length, 2);
  assert.deepEqual(ui.publishes.map(turn => turn.id), [first.id, second.id]);
  ui.unmount();
});
