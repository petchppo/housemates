import assert from "node:assert/strict";
import test from "node:test";
import { handleBridgeRequest, IMessageBridge, normalizeMessageAddress, parseBlueBubblesEvent, readBridgeConfig, secretMatches, sendBlueBubblesText, type BridgeConfig } from "../src/server/imessage-bridge";
import { buildDemoScenario, DEFAULT_DEMO_PROFILE } from "../src/domain/demo";
import { createDemoCommandSession, requestDemoCommand } from "../src/domain/demo-commands";

const sender = "+15551234567", recipient = "housemates@example.com", now = Date.UTC(2026, 9, 24);
const config: BridgeConfig = { url: "http://127.0.0.1:1234", password: "test-only-password", webhookSecret: "test-only-secret-not-real-1234567890", allowedSender: sender, recipient };
const event = (text: string, id = "incoming-1", time = now) => ({ type: "new-message", data: { guid: id, text, isFromMe: false, dateCreated: time, handle: { address: sender }, chats: [{ guid: `iMessage;-;${sender}` }], attachments: [] } });
function setup() {
  let clock = now;
  const bridge = new IMessageBridge(() => clock);
  const pair = bridge.create(config).body as { token: string; code: string };
  bridge.receive(event(`PAIR ${pair.code}`, "pair-1"), config);
  return { bridge, pair, advance: (ms: number) => { clock += ms; } };
}
const request = (body: unknown, token?: string, url = "http://localhost:3000/api/imessage", origin = "http://localhost:3000") => new Request(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

test("ingress rejection diagnostics identify only fixed validation categories and preserve strict rejection", () => {
  const logs: unknown[][] = [], previous = console.info;
  console.info = (...values: unknown[]) => { logs.push(values); };
  try {
    const valid = event("private-transcript-marker", "private-guid-marker");
    const cases: Array<[unknown, string]> = [
      [null, "invalid-envelope"], [{ ...valid, type: "private-event-marker" }, "event-type"],
      [{ ...valid, data: null }, "invalid-envelope"],
      ...([
        [{ isFromMe: true }, "self-sent"], [{ isFromMe: undefined }, "direction-invalid"],
        [{ handle: { address: "private-sender@example.com" } }, "sender-mismatch"],
        [{ guid: "private/invalid-guid" }, "message-id"], [{ text: "" }, "text-or-attachment"],
        [{ text: "x".repeat(1201) }, "text-or-attachment"], [{ attachments: [{ private: "attachment-marker" }] }, "text-or-attachment"],
        [{ chats: [{ guid: "iMessage;+;private-group-marker" }] }, "chat-mismatch"],
        [{ dateCreated: now - 300001 }, "timestamp"], [{ dateCreated: "private-timestamp-marker" }, "timestamp"],
      ] as Array<[Record<string, unknown>, string]>).map(([change, category]): [unknown, string] => [{ ...valid, data: { ...valid.data, ...change } }, category]),
    ];
    for (const [payload, category] of cases) {
      logs.length = 0;
      assert.equal(parseBlueBubblesEvent(payload, sender, now), null);
      assert.equal(logs.length, 0, "Pure parser does not emit duplicate diagnostics");
      assert.deepEqual(new IMessageBridge(() => now).receive(payload, config), { status: 200, body: { ignored: true } });
      assert.deepEqual(logs, [[`housemates:imessage-ingress ${JSON.stringify({ category })}`]]);
    }
  } finally { console.info = previous; }
});

test("ingress logs distinguish unmatched pairing, accepted pairing and queued text without identities or capabilities", () => {
  const logs: unknown[][] = [], previous = console.info;
  console.info = (...values: unknown[]) => { logs.push(values); };
  try {
    const bridge = new IMessageBridge(() => now, () => "a".repeat(64));
    const pair = bridge.create(config).body as { token: string; code: string };
    assert.deepEqual(bridge.receive(event("PAIR BBBBBBBBBBBB", "private-unmatched-guid"), config).body, { ignored: true });
    assert.deepEqual(bridge.receive(event(`PAIR ${pair.code}`, "private-pair-guid"), config).body, { paired: true });
    assert.deepEqual(bridge.receive(event("Evie: private-conversation-marker", "private-request-guid"), config).body, { queued: true });
    assert.deepEqual(bridge.receive(event("Evie: private-conversation-marker", "private-request-guid"), config).body, { duplicate: true });
    assert.deepEqual(new IMessageBridge(() => now).receive(event("private-unpaired-text", "private-unpaired-guid"), config).body, { ignored: true });
    assert.deepEqual(logs, ["pair-code-unmatched", "paired", "queued", "duplicate", "unpaired-chat"].map(category => [`housemates:imessage-ingress ${JSON.stringify({ category })}`]));
    const serialized = JSON.stringify(logs);
    for (const privateValue of [pair.token, pair.code, sender, recipient, config.url, config.password, config.webhookSecret, "BBBBBBBBBBBB", "private-"]) assert.equal(serialized.includes(privateValue), false);
  } finally { console.info = previous; }
});

test("webhook authentication and malformed-body diagnostics never log key, URL, origin or body values", async () => {
  const logs: unknown[][] = [], previous = console.info;
  console.info = (...values: unknown[]) => { logs.push(values); };
  try {
    const endpoint = "http://localhost:3000/api/imessage";
    const cases: Array<[Request, number, string]> = [
      [new Request(endpoint, { method: "POST", body: "private-body-marker" }), 403, "webhook-auth-missing"],
      [request(event("private-body-marker"), undefined, `${endpoint}?key=`), 401, "webhook-auth-missing"],
      [request(event("private-body-marker"), undefined, `${endpoint}?key=private-wrong-key`), 401, "webhook-auth-invalid"],
      [request(event("private-body-marker"), undefined, endpoint, "https://private-origin.example"), 403, "request-origin-rejected"],
      [new Request(`${endpoint}?key=${config.webhookSecret}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "private-invalid-json" }), 400, "invalid-json"],
      [request({}, undefined, `${endpoint}?key=${config.webhookSecret}`), 200, "event-type"],
    ];
    for (const [incoming, status, category] of cases) {
      logs.length = 0;
      const response = await handleBridgeRequest(incoming, new IMessageBridge(() => now), config);
      assert.equal(response.status, status);
      assert.deepEqual(logs, [[`housemates:imessage-ingress ${JSON.stringify({ category })}`]]);
    }
    logs.length = 0;
    await handleBridgeRequest(new Request(endpoint), new IMessageBridge(), config);
    await handleBridgeRequest(request({ action: "pair" }), new IMessageBridge(), config);
    assert.deepEqual(logs, [], "Status checks and ordinary browser pairing do not impersonate webhook ingress");
  } finally { console.info = previous; }
});

test("browser pairing uses the requested Host when Next reports an internal bind URL", async () => {
  const pair = (origin: string, host: string, forwarded?: string) => new Request("http://0.0.0.0:3000/api/imessage", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Host: host, ...(forwarded ? { "X-Forwarded-Host": forwarded } : {}) },
    body: JSON.stringify({ action: "pair" }),
  });
  assert.equal((await handleBridgeRequest(pair("http://localhost:3000", "localhost:3000"), new IMessageBridge(), config)).status, 201);
  for (const origin of ["http://evil.example", "https://localhost:3000", "http://localhost:4000", "http://0.0.0.0:3000"]) {
    assert.equal((await handleBridgeRequest(pair(origin, "localhost:3000"), new IMessageBridge(), config)).status, 403);
  }
  assert.equal((await handleBridgeRequest(pair("http://evil.example", "localhost:3000", "evil.example"), new IMessageBridge(), config)).status, 403);
});

test("iMessage remains unavailable without complete safe server-only configuration", async () => {
  assert.equal(readBridgeConfig({}), null);
  const env = { HOUSEMATES_IMESSAGE_URL: config.url, HOUSEMATES_IMESSAGE_PASSWORD: config.password, HOUSEMATES_IMESSAGE_WEBHOOK_SECRET: config.webhookSecret, HOUSEMATES_IMESSAGE_ALLOWED_SENDER: sender, HOUSEMATES_IMESSAGE_RECIPIENT: recipient };
  assert.deepEqual(readBridgeConfig(env), config);
  for (const url of ["http://remote.example.com", "https://u:p@example.com", "https://example.com/a", "https://example.com?key=secret", "file:///tmp/server"]) assert.equal(readBridgeConfig({ ...env, HOUSEMATES_IMESSAGE_URL: url }), null);
  assert.equal(readBridgeConfig({ ...env, HOUSEMATES_IMESSAGE_RECIPIENT: sender }), null, "Same-account loop is not an incoming sender");
  assert.equal(normalizeMessageAddress("PERSON@example.COM"), "person@example.com");
  assert.equal(normalizeMessageAddress("tel:15551234567"), null);
  const response = await handleBridgeRequest(new Request("http://localhost:3000/api/imessage"), new IMessageBridge(), null);
  assert.equal((await response.json()).available, false);
  assert.equal((await handleBridgeRequest(request({ action: "pair" }), new IMessageBridge(), null)).status, 503);
});

test("webhook rejects wrong identity, groups, attachments, loops, stale messages and invalid schemas", () => {
  const valid = event("Evie: cheaper plan");
  assert.ok(parseBlueBubblesEvent(valid, sender, now));
  const bad = [null, {}, { ...valid, type: "updated-message" }, ...[
    { isFromMe: true }, { isFromMe: undefined }, { handle: { address: "+15557654321" } },
    { chats: [{ guid: "iMessage;+;group" }] }, { chats: [{ guid: "SMS;-;+15551234567" }] },
    { chats: [{ guid: "iMessage;-;+15557654321" }] }, { attachments: [{}] },
    { dateCreated: now - 300001 }, { dateCreated: now + 300001 }, { dateCreated: "now" },
    { text: "x".repeat(1201) }, { guid: "../../file" },
  ].map(change => ({ ...valid, data: { ...valid.data, ...change } }))];
  for (const value of bad) assert.equal(parseBlueBubblesEvent(value, sender, now), null);
});

test("pairing requires phone proof, expires, and re-pairing revokes the previous browser", () => {
  let clock = now; const bridge = new IMessageBridge(() => clock);
  const first = bridge.create(config).body as { token: string; code: string };
  assert.equal(bridge.poll(first.token).body.state, "awaiting-pair");
  bridge.receive(event("Evie: cheaper plan"), config);
  assert.deepEqual(bridge.poll(first.token).body.messages, []);
  bridge.receive(event(`PAIR ${first.code}`, "pair-first"), config);
  assert.equal(bridge.poll(first.token).body.state, "paired");
  const second = bridge.create(config).body as { token: string; code: string };
  bridge.receive(event(`PAIR ${second.code}`, "pair-second"), config);
  assert.equal(bridge.poll(first.token).status, 409);
  assert.equal(bridge.poll(first.token).body.error, "session-replaced");
  assert.equal(bridge.poll(second.token).body.state, "paired");
  const third = bridge.create(config).body as { token: string; code: string };
  clock += 300001;
  bridge.receive(event(`PAIR ${third.code}`, "pair-expired", clock), config);
  assert.equal(bridge.poll(third.token).status, 401);
  clock += 2 * 60 * 60_000;
  assert.equal(bridge.poll(second.token).status, 401);
});

test("phone requests use the existing browser planner and cannot approve through text", async () => {
  const { bridge, pair } = setup();
  const scenario = buildDemoScenario({ ...DEFAULT_DEMO_PROFILE, applianceIds: ["evie", "bubbles"] });
  let session = createDemoCommandSession(scenario);
  bridge.receive(event("Evie: Find a cheaper plan", "request-1"), config);
  assert.equal(bridge.receive(event("Evie: Find a cheaper plan", "request-1"), config).body.duplicate, true);
  const messages = bridge.poll(pair.token).body.messages as { id: string; applianceId: "evie"; text: string }[];
  assert.equal(messages.length, 1);
  const computed = requestDemoCommand(session, scenario, messages[0].applianceId, messages[0].text);
  session = computed.session;
  assert.ok(session.pending); assert.equal(session.status, "idle");
  const delivered: string[] = [];
  const send: typeof sendBlueBubblesText = async (_config, chatGuid, text) => { assert.equal(chatGuid, `iMessage;-;${sender}`); delivered.push(text); };
  assert.equal((await bridge.reply(pair.token, messages[0].id, computed.reply, config, send)).status, 200);
  assert.match(delivered[0], /simulation/); assert.ok(delivered[0].includes(computed.reply));
  assert.deepEqual(bridge.poll(pair.token).body.messages, []);
  await bridge.reply(pair.token, messages[0].id, computed.reply, config, send);
  assert.equal(delivered.length, 1);
  bridge.receive(event("Evie: approve", "request-2"), config);
  session = requestDemoCommand(session, scenario, "evie", "approve").session;
  assert.equal(session.status, "idle"); assert.equal(session.approved, null);
  assert.equal((await bridge.reply(pair.token, "forged-id", "anything", config, send)).status, 409);
});

test("delivery uncertainty and concurrent requests never cause automatic duplicate sends", async () => {
  const { bridge, pair } = setup(); bridge.receive(event("Bubbles: Status", "request-1"), config);
  let release!: () => void, sends = 0;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const send: typeof sendBlueBubblesText = async () => { sends++; await blocked; throw Error("timeout after possible delivery"); };
  const first = bridge.reply(pair.token, "request-1", "Computed response", config, send);
  assert.equal((await bridge.reply(pair.token, "request-1", "Changed response", config, send)).status, 409);
  release(); assert.equal((await first).status, 502);
  assert.equal((await bridge.reply(pair.token, "request-1", "Retry", config, send)).status, 409);
  assert.equal(sends, 1); assert.deepEqual(bridge.poll(pair.token).body.messages, []);
  assert.deepEqual(bridge.poll(pair.token).body.diagnostics, { lastInboundAt: now, lastInboundOutcome: "queued", lastReplyAt: now, lastReplyOutcome: "unconfirmed", pendingCount: 0 });
});

test("consecutive phone requests continue after successful replies and expose only bounded diagnostics", async () => {
  const { bridge, pair, advance } = setup();
  assert.deepEqual(bridge.poll(pair.token).body.diagnostics, { lastInboundAt: null, lastInboundOutcome: null, lastReplyAt: null, lastReplyOutcome: null, pendingCount: 0 });
  let sends = 0;
  const send: typeof sendBlueBubblesText = async () => { sends++; };
  for (let index = 1; index <= 3; index++) {
    advance(1000);
    const time = now + index * 1000, id = `consecutive-${index}`;
    assert.equal(bridge.receive(event("Evie: Status", id, time), config).body.queued, true);
    assert.equal((bridge.poll(pair.token).body.diagnostics as { pendingCount: number }).pendingCount, 1);
    assert.equal((await bridge.reply(pair.token, id, "Computed response", config, send)).status, 200);
    assert.deepEqual(bridge.poll(pair.token).body.messages, []);
    assert.deepEqual(bridge.poll(pair.token).body.diagnostics, { lastInboundAt: time, lastInboundOutcome: "queued", lastReplyAt: time, lastReplyOutcome: "accepted", pendingCount: 0 });
    assert.equal(bridge.receive(event("Evie: Status", id, time), config).body.duplicate, true);
    await bridge.reply(pair.token, id, "Computed response", config, send);
  }
  assert.equal(sends, 3);
});

test("private diagnostics distinguish unsupported verified commands without leaking unrelated events", async () => {
  const { bridge, pair, advance } = setup();
  assert.equal(bridge.receive(event("Frost: Status", "missing-prefix"), config).body.ignored, true);
  const expected = { lastInboundAt: now, lastInboundOutcome: "unsupported-command", lastReplyAt: null, lastReplyOutcome: null, pendingCount: 0 };
  assert.deepEqual(bridge.poll(pair.token).body.diagnostics, expected);
  advance(1000);
  const valid = event("Evie: Status", "unrelated", now + 1000);
  const rejected = [
    { ...valid, data: { ...valid.data, handle: { address: "+15557654321" } } },
    { ...valid, data: { ...valid.data, chats: [{ guid: "iMessage;+;group" }] } },
    { ...valid, data: { ...valid.data, isFromMe: true } },
    { ...valid, data: { ...valid.data, attachments: [{}] } },
  ];
  for (const value of rejected) {
    assert.equal(bridge.receive(value, config).body.ignored, true);
    assert.deepEqual(bridge.poll(pair.token).body.diagnostics, expected);
  }
  bridge.receive(event("Frost: Status", "missing-prefix", now + 1000), config);
  assert.deepEqual(bridge.poll(pair.token).body.diagnostics, expected, "duplicate cannot look like a new inbound message");
  const publicStatus = await handleBridgeRequest(new Request("http://localhost:3000/api/imessage"), bridge, config);
  assert.equal("diagnostics" in await publicStatus.json(), false, "diagnostics require the browser capability");
  const waiting = bridge.create(config).body as { token: string };
  assert.deepEqual(bridge.poll(waiting.token).body.diagnostics, { lastInboundAt: null, lastInboundOutcome: null, lastReplyAt: null, lastReplyOutcome: null, pendingCount: 0 }, "diagnostics belong to one paired session");
});

test("expired waiting commands and disconnected sessions never reach the household", () => {
  const { bridge, pair, advance } = setup();
  bridge.receive(event("Chill: Status", "request-1"), config);
  advance(300001);
  assert.deepEqual(bridge.poll(pair.token).body.messages, []);
  bridge.disconnect(pair.token);
  assert.equal(bridge.poll(pair.token).status, 401);
  assert.equal(bridge.receive(event("Evie: cheaper", "request-2", now + 300001), config).body.ignored, true);
});

test("HTTP boundary authenticates webhook and browser capability, checks origin, and bounds bodies", async () => {
  const { bridge, pair } = setup();
  assert.ok(secretMatches(config.webhookSecret, config.webhookSecret)); assert.equal(secretMatches("wrong", config.webhookSecret), false);
  assert.equal((await handleBridgeRequest(request(event("Evie: Status"), undefined, "http://localhost:3000/api/imessage?key=wrong"), bridge, config)).status, 401);
  assert.equal((await handleBridgeRequest(request({ action: "pair" }, undefined, undefined, "https://other.example"), bridge, config)).status, 403);
  assert.equal((await handleBridgeRequest(request({ action: "poll" }), bridge, config)).status, 401);
  assert.equal((await handleBridgeRequest(request({ action: "poll" }, "0".repeat(64)), bridge, config)).status, 401);
  assert.equal((await handleBridgeRequest(request({ action: "poll" }, pair.token), bridge, config)).status, 200);
  assert.equal((await handleBridgeRequest(request({ action: "pair", payload: "x".repeat(25000) }), bridge, config)).status, 400);
  const accepted = await handleBridgeRequest(request(event("Evie: Status", "fresh-1"), undefined, `http://localhost:3000/api/imessage?key=${config.webhookSecret}`), bridge, config);
  assert.equal((await accepted.json()).queued, true);
  assert.equal(accepted.headers.get("cache-control"), "no-store");
});

test("BlueBubbles transport uses verified message schema, fixed chat, timeout and no redirect credential leak", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++; const url = new URL(String(input));
    assert.equal(url.origin, config.url); assert.equal(url.pathname, "/api/v1/message/text");
    assert.equal(url.searchParams.get("password"), config.password); assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
    assert.deepEqual(JSON.parse(String(init?.body)), { chatGuid: `iMessage;-;${sender}`, message: "Computed only", method: "apple-script", tempGuid: "housemates-message-1" });
    return Response.json({ status: 200, data: {} });
  };
  await sendBlueBubblesText(config, `iMessage;-;${sender}`, "Computed only", "message-1", fetcher); assert.equal(calls, 1);
  await assert.rejects(sendBlueBubblesText(config, `iMessage;-;${sender}`, "Computed only", "message-1", async () => Response.json({ status: 500 })));
});

test("plain follow-ups retain the last explicit persona and unsupported prefixes cannot retarget it", async () => {
  const { bridge, pair } = setup();
  for (const [id, message] of [["first", "Hello"], ["switch", "Bubbles: Hello"], ["follow-up", "How about tomorrow?"], ["unsupported", "Frost: status"], ["empty", "Evie:"], ["still-bubbles", "Status"]]) bridge.receive(event(message, id), config);
  assert.deepEqual(bridge.poll(pair.token).body.messages, [
    { id: "first", applianceId: "evie", text: "Hello", expiresAt: now + 300000 },
    { id: "switch", applianceId: "bubbles", text: "Hello", expiresAt: now + 300000 },
    { id: "follow-up", applianceId: "bubbles", text: "How about tomorrow?", expiresAt: now + 300000 },
    { id: "still-bubbles", applianceId: "bubbles", text: "Status", expiresAt: now + 300000 },
  ]);
  const sent: { text: string; id: string }[] = [];
  const send: typeof sendBlueBubblesText = async (_config, chat, text, id) => { assert.equal(chat, `iMessage;-;${sender}`); sent.push({ text, id }); };
  const reply = "Happy to help you think it through.";
  assert.equal((await bridge.reply(pair.token, "follow-up", reply, config, send, "openai")).status, 200);
  assert.equal(sent[0].text, `[Bubbles · AI dialogue · simulation]\n${reply}\nReview and approve any proposal in your open Housemates browser.`);
  assert.equal(sent[0].id, "incoming-follow-up");
  assert.equal((await bridge.reply(pair.token, "first", reply, config, send, "invented-source")).status, 400);
  assert.equal((await bridge.reply(pair.token, "first", reply, config, send)).status, 200);
  assert.match(sent[1].text, /^\[Evie · local planner · simulation\]/);
});

test("polled requests carry fixed per-message expiry even when the browser processes a batch slowly", async () => {
  const { bridge, pair, advance } = setup();
  bridge.receive(event("Hello", "older"), config);
  advance(1000);
  bridge.receive(event("Tell me more", "newer", now + 1000), config);
  const snapshot = bridge.poll(pair.token).body.messages as { id: string; expiresAt: number }[];
  assert.deepEqual(snapshot.map(({ id, expiresAt }) => ({ id, expiresAt })), [
    { id: "older", expiresAt: now + 300000 }, { id: "newer", expiresAt: now + 301000 },
  ]);
  advance(299000);
  const remaining = bridge.poll(pair.token).body.messages as { id: string; expiresAt: number }[];
  assert.deepEqual(remaining.map(({ id, expiresAt }) => ({ id, expiresAt })), [{ id: "newer", expiresAt: now + 301000 }]);
  assert.equal(snapshot[0].expiresAt, now + 300000, "polling must not extend a previously returned request deadline");
  let sends = 0;
  assert.equal((await bridge.reply(pair.token, "older", "Late response", config, async () => { sends++; })).status, 409);
  assert.equal(sends, 0);
  advance(2 * 60 * 60_000 - 301000);
  bridge.receive(event("Nearly expired session", "last-second", now + 2 * 60 * 60_000 - 1000), config);
  const last = bridge.poll(pair.token).body.messages as { id: string; expiresAt: number }[];
  assert.deepEqual(last.map(({ id, expiresAt }) => ({ id, expiresAt })), [{ id: "last-second", expiresAt: now + 2 * 60 * 60_000 }], "a queued request cannot outlive the paired session");
  advance(1000);
  assert.equal(bridge.poll(pair.token).status, 401);
});

test("dismiss consumes canceled inbound requests without sending or allowing later replay", async () => {
  const { bridge, pair } = setup();
  bridge.receive(event("Hello", "cancel-me"), config);
  assert.equal(bridge.dismiss(pair.token, "cancel-me").status, 200);
  assert.deepEqual(bridge.poll(pair.token).body.messages, []);
  assert.equal(bridge.receive(event("Hello", "cancel-me"), config).body.duplicate, true);
  let sends = 0;
  assert.equal((await bridge.reply(pair.token, "cancel-me", "Late reply", config, async () => { sends++; })).status, 409);
  assert.equal(sends, 0);
  assert.equal(bridge.dismiss("wrong", "cancel-me").status, 401);
  assert.equal(bridge.dismiss(pair.token, "../../bad").status, 400);
});

test("web turns mirror exact text once to the proven chat with isolated delivery identity", async () => {
  const { bridge, pair } = setup();
  const turn = { id: "web-turn-1", applianceId: "evie", userText: "Hello from the website", text: "Happy to help you think it through.", source: "openai" };
  const sends: { chat: string; text: string; id: string }[] = [];
  const send: typeof sendBlueBubblesText = async (_config, chat, text, id) => { sends.push({ chat, text, id }); };
  assert.equal((await bridge.publish(pair.token, turn, config, send)).status, 200);
  assert.equal((await bridge.publish(pair.token, { ...turn, text: "Changed duplicate" }, config, send)).body.duplicate, true);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].chat, `iMessage;-;${sender}`);
  assert.equal(sends[0].text, `[You · website]\n${turn.userText}\n\n[Evie · AI dialogue · simulation]\n${turn.text}\nReview and approve any proposal in your open Housemates browser.`);
  assert.match(sends[0].id, /^web-[a-f0-9]{24}-web-turn-1$/);
  assert.ok(!sends[0].id.includes(pair.token));
  assert.deepEqual(bridge.poll(pair.token).body.messages, [], "mirroring must not enqueue an echo or invoke the planner");
  assert.equal((bridge.poll(pair.token).body.diagnostics as { lastReplyOutcome: string }).lastReplyOutcome, "accepted");
  const second = bridge.create(config).body as { token: string; code: string };
  bridge.receive(event(`PAIR ${second.code}`, "second-pair"), config);
  assert.equal((await bridge.publish(pair.token, turn, config, send)).status, 409);
  assert.equal((await bridge.publish(second.token, turn, config, send)).status, 200);
  assert.notEqual(sends[0].id, sends[1].id, "fresh pairing must not collide with an old web turn's delivery ID");
});

test("web sync rejects invalid destinations and payloads, unpaired sessions and foreign origins", async () => {
  const { bridge, pair, advance } = setup();
  const turn = { id: "turn-1", applianceId: "evie", userText: "Hello", text: "Hi there.", source: "local" };
  let sends = 0;
  const send: typeof sendBlueBubblesText = async () => { sends++; };
  const waiting = bridge.create(config).body as { token: string };
  assert.equal((await bridge.publish(waiting.token, turn, config, send)).status, 401);
  for (const bad of [null, { ...turn, chatGuid: "iMessage;-;attacker@example.com" }, { ...turn, source: "unknown" }, { ...turn, applianceId: "frost" }, { ...turn, applianceId: ["evie"] }, { ...turn, id: "bad/id" }, { ...turn, text: " " }, { ...turn, text: "x".repeat(5001) }, { ...turn, userText: "x".repeat(1201) }, { ...turn, text: "bad\u0000" }]) {
    assert.equal((await bridge.publish(pair.token, bad, config, send)).status, 400);
  }
  assert.equal((await handleBridgeRequest(request({ action: "publish", ...turn }, pair.token, undefined, "https://other.example"), bridge, config)).status, 403);
  assert.equal((await handleBridgeRequest(request({ action: "publish", ...turn }), bridge, config)).status, 401);
  assert.equal((await handleBridgeRequest(request({ action: "publish", ...turn, chatGuid: "bad" }, pair.token), bridge, config)).status, 400);
  assert.equal(sends, 0);
  advance(2 * 60 * 60_000);
  assert.equal((await bridge.publish(pair.token, turn, config, send)).status, 401);
});

test("accepted web dialogue sets the phone follow-up persona without overriding newer phone choices", async () => {
  const { bridge, pair } = setup();
  const turn = { id: "web-bubbles", applianceId: "bubbles", userText: "Hello", text: "Hi there.", source: "openai" };
  await bridge.publish(pair.token, turn, config, async () => {});
  bridge.receive(event("Tell me more", "after-web"), config);
  assert.deepEqual((bridge.poll(pair.token).body.messages as { applianceId: string }[]).map(row => row.applianceId), ["bubbles"]);
  await bridge.publish(pair.token, { ...turn, id: "failed-evie", applianceId: "evie" }, config, async () => { throw Error("uncertain"); });
  bridge.receive(event("And then?", "after-failed-web"), config);
  assert.deepEqual((bridge.poll(pair.token).body.messages as { applianceId: string }[]).map(row => row.applianceId), ["bubbles", "bubbles"]);
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const pending = bridge.publish(pair.token, { ...turn, id: "slow-web" }, config, async () => { await blocked; });
  bridge.receive(event("Chill: Hello", "new-phone-target"), config);
  release(); await pending;
  bridge.receive(event("More please", "after-slow-web"), config);
  assert.equal((bridge.poll(pair.token).body.messages as { applianceId: string }[]).at(-1)?.applianceId, "chill");
});

test("concurrent or uncertain web sends never retry, and each pairing has a delivery cap", async () => {
  const { bridge, pair } = setup();
  const turn = { id: "web-1", applianceId: "evie", userText: "Hello", text: "Hi there.", source: "openai" };
  let sends = 0, release!: () => void;
  const block = new Promise<void>(resolve => { release = resolve; });
  const send: typeof sendBlueBubblesText = async () => { sends++; await block; throw Error("uncertain delivery"); };
  const first = bridge.publish(pair.token, turn, config, send);
  assert.equal((await bridge.publish(pair.token, turn, config, send)).status, 409);
  release(); assert.equal((await first).status, 502);
  assert.equal((await bridge.publish(pair.token, turn, config, send)).status, 409);
  assert.equal(sends, 1);
  assert.equal((bridge.poll(pair.token).body.diagnostics as { lastReplyOutcome: string }).lastReplyOutcome, "unconfirmed");
  const counted: typeof sendBlueBubblesText = async () => { sends++; };
  for (let i = 2; i <= 128; i++) assert.equal((await bridge.publish(pair.token, { ...turn, id: `web-${i}` }, config, counted)).status, 200);
  assert.equal((await bridge.publish(pair.token, { ...turn, id: "web-129" }, config, counted)).status, 429);
  assert.equal(sends, 128);
});
