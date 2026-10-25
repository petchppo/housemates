import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handleBridgeRequest, IMessageBridge, PAIRING_COOKIE, type BridgeConfig } from "../src/server/imessage-bridge";
import { FilePairingStore, MemoryPairingStore, REMEMBER_MS, type PairingStore } from "../src/server/imessage-pairing-store";

const initial = Date.UTC(2026, 9, 24), contextKey = '{"household":"fixture-home"}';
const config: BridgeConfig = { url: "http://127.0.0.1:1234", password: "test-only-password", webhookSecret: "test-only-secret-not-real-1234567890", allowedSender: "+15551234567", recipient: "fixture@example.test" };
const event = (text: string, id: string, time: number) => ({ type: "new-message", data: { guid: id, text, isFromMe: false, dateCreated: time, handle: { address: config.allowedSender }, chats: [{ guid: `iMessage;-;${config.allowedSender}` }], attachments: [] } });
function fixture(store: PairingStore = new MemoryPairingStore()) {
  let time = initial, bridge = new IMessageBridge(() => time, undefined, store);
  const request = (body: unknown, token?: string, cookie?: string, secure = false, origin?: string) => {
    const base = `${secure ? "https" : "http"}://localhost:3000`;
    return new Request(`${base}/api/imessage`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin ?? base,
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  };
  const call = (body: unknown, token?: string, cookie?: string, settings = config) => handleBridgeRequest(request(body, token, cookie), bridge, settings);
  async function pair(context: unknown = contextKey) {
    const response = await call({ action: "pair", ...(context === undefined ? {} : { contextKey: context }) });
    assert.equal(response.status, 201); assert.equal(response.headers.get("set-cookie"), null);
    const value = await response.json() as { token: string; code: string };
    bridge.receive(event(`PAIR ${value.code}`, `pair-${value.code}`, time), config);
    return value;
  }
  async function remember(token: string, context = contextKey) {
    const response = await call({ action: "remember", contextKey: context }, token);
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\/api\/imessage/); assert.match(cookie, /Max-Age=31536000/);
    return cookie.split(";", 1)[0];
  }
  return { call, request, pair, remember, bridge: () => bridge, advance(ms: number) { time += ms; }, now: () => time,
    restart() { bridge = new IMessageBridge(() => time, undefined, store); }, store };
}

test("phone proof is required before remembering; contextless current pairing may be adopted exactly once", async () => {
  const h = fixture();
  const waiting = await h.call({ action: "pair" }); const value = await waiting.json();
  const denied = await h.call({ action: "remember", contextKey }, value.token);
  assert.equal(denied.status, 409); assert.equal(denied.headers.get("set-cookie"), null);
  h.bridge().receive(event(`PAIR ${value.code}`, "proof", h.now()), config);
  const cookie = await h.remember(value.token);
  assert.equal(h.store.read().length, 1);
  const mismatch = await h.call({ action: "remember", contextKey: "different home" }, value.token, cookie);
  assert.equal(mismatch.status, 409); assert.deepEqual(await mismatch.json(), { error: "remembered-household-mismatch" });
  for (const bad of ["", "x".repeat(16385), {}, null]) assert.equal((await h.call({ action: "pair", contextKey: bad })).status, 400);
  const noCookie = await h.call({ action: "resume", contextKey }); assert.deepEqual(await noCookie.json(), { state: "unpaired" });
});

test("refresh and server restart resume an empty private mailbox with a fresh token and renewed cookie", async () => {
  const dir = mkdtempSync(join(tmpdir(), "housemates-resume-test-"));
  try {
    const file = join(dir, "pairings.json"), h = fixture(new FilePairingStore(file));
    const pair = await h.pair(), cookie = await h.remember(pair.token);
    h.bridge().receive(event("private prior transcript", "old-message", h.now()), config);
    await h.call({ action: "detach" }, pair.token, cookie);
    assert.equal(h.store.read().length, 1);
    h.advance(1000); h.restart();
    const resumed = await h.call({ action: "resume", contextKey }, undefined, cookie);
    assert.equal(resumed.status, 200);
    const value = await resumed.json();
    assert.equal(value.state, "paired"); assert.equal(value.remembered, true); assert.equal(value.code, ""); assert.notEqual(value.token, pair.token);
    assert.equal(value.expiresAt, h.now() + 2 * 60 * 60_000);
    assert.deepEqual(h.bridge().poll(value.token).body.messages, []);
    assert.equal(h.bridge().receive(event("private prior transcript", "old-message", initial), config).body.ignored, true);
    h.advance(1);
    assert.equal(h.bridge().receive(event("new request", "new-message", h.now()), config).body.queued, true);
    const raw = readFileSync(file, "utf8");
    for (const secret of [pair.token, pair.code, cookie.split("=")[1], contextKey, config.password, config.webhookSecret, "private prior transcript", "new request"]) assert.equal(raw.includes(secret), false);
    assert.equal(h.store.read()[0].expiresAt, initial + 1000 + REMEMBER_MS);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("newest tab wins once, old capability gets stable409 and cannot remember over the replacement", async () => {
  const h = fixture(), pair = await h.pair(), cookie = await h.remember(pair.token);
  const resumed = await (await h.call({ action: "resume", contextKey }, undefined, cookie)).json();
  const old = await h.call({ action: "poll" }, pair.token);
  assert.equal(old.status, 409); assert.deepEqual(await old.json(), { error: "session-replaced" });
  const staleRemember = await h.call({ action: "remember", contextKey }, pair.token, cookie);
  assert.equal(staleRemember.status, 409); assert.equal(staleRemember.headers.get("set-cookie"), null);
  assert.equal(h.bridge().poll(resumed.token).body.state, "paired");
  const other = await h.pair();
  assert.equal(h.store.read().length, 0, "a new phone proof revokes the remembered old browser");
  assert.equal(h.bridge().poll(resumed.token).status, 409);
  assert.deepEqual(await (await h.call({ action: "resume", contextKey }, undefined, cookie)).json(), { state: "unpaired" });
  assert.equal(h.bridge().poll(other.token).body.state, "paired");
});

test("replacement limits retain every live tombstone instead of making old tabs look restarted", async () => {
  const h = fixture(), pair = await h.pair(), cookie = await h.remember(pair.token);
  let current = pair.token;
  for (let index = 0; index < 128; index++) {
    const response = await h.call({ action: "resume", contextKey }, undefined, cookie);
    assert.equal(response.status, 200);
    current = (await response.json()).token;
  }
  const limited = await h.call({ action: "resume", contextKey }, undefined, cookie);
  assert.equal(limited.status, 429); assert.deepEqual(await limited.json(), { error: "pairing-capacity" });
  assert.equal(h.bridge().poll(current).body.state, "paired");
  assert.equal(h.bridge().poll(pair.token).status, 409, "oldest replaced token cannot turn into an auto-resumable401");
  h.advance(2 * 60 * 60_000 + 1);
  assert.equal((await h.call({ action: "resume", contextKey }, undefined, cookie)).status, 200);
});

test("wrong household, expired credentials and changed bridge identity/configuration never attach", async () => {
  const h = fixture(), pair = await h.pair(), cookie = await h.remember(pair.token);
  const wrong = await h.call({ action: "resume", contextKey: "other household" }, undefined, cookie);
  assert.equal(wrong.status, 409); assert.deepEqual(await wrong.json(), { error: "remembered-household-mismatch" });
  assert.equal(wrong.headers.get("set-cookie"), null, "mismatch preserves binding until explicit disconnect");
  for (const changed of ["allowedSender", "recipient", "webhookSecret", "password", "url"] as const) {
    const own = fixture(), paired = await own.pair(), saved = await own.remember(paired.token);
    const response = await own.call({ action: "resume", contextKey }, undefined, saved, { ...config, [changed]: `${config[changed]}-changed` });
    assert.deepEqual(await response.json(), { state: "unpaired" }); assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
    assert.equal(own.store.read().length, 0); assert.equal(own.bridge().poll(paired.token).status, 409);
  }
  h.advance(REMEMBER_MS + 1);
  assert.deepEqual(await (await h.call({ action: "resume", contextKey }, undefined, cookie)).json(), { state: "unpaired" });
});

test("explicit disconnect forgets even after token expiry; detach retains remembered binding", async () => {
  const h = fixture(), pair = await h.pair(), cookie = await h.remember(pair.token);
  const detached = await h.call({ action: "detach" }, pair.token, cookie);
  assert.equal(detached.headers.get("set-cookie"), null); assert.equal(h.store.read().length, 1);
  const resumed = await (await h.call({ action: "resume", contextKey }, undefined, cookie)).json();
  h.advance(2 * 60 * 60_000 + 1);
  const forgotten = await h.call({ action: "disconnect" }, undefined, cookie);
  assert.equal(forgotten.status, 200); assert.match(forgotten.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal(h.store.read().length, 0); assert.equal(h.bridge().poll(resumed.token).status, 401);
  assert.deepEqual(await (await h.call({ action: "resume", contextKey }, undefined, cookie)).json(), { state: "unpaired" });
});

test("remembered cookie actions enforce origin/schema and never disclose raw credential in JSON", async () => {
  const h = fixture(), pair = await h.pair(), cookie = await h.remember(pair.token);
  for (const action of ["remember", "resume", "disconnect", "detach"]) {
    const denied = await handleBridgeRequest(h.request({ action, contextKey }, pair.token, cookie, false, "https://attacker.test"), h.bridge(), config);
    assert.equal(denied.status, 403); assert.equal(denied.headers.get("set-cookie"), null);
  }
  const response = await handleBridgeRequest(h.request({ action: "remember", contextKey }, pair.token, cookie, true), h.bridge(), config);
  assert.match(response.headers.get("set-cookie")!, /; Secure/); assert.deepEqual(await response.json(), { remembered: true });
  assert.equal((await h.call({ action: "resume", contextKey, recipient: "attacker@example.test" }, undefined, cookie)).status, 400);
  assert.equal((await h.call({ action: "remember", contextKey, chatGuid: "attacker" }, pair.token, cookie)).status, 400);
  const duplicate = `${cookie}; ${PAIRING_COOKIE}=${"a".repeat(64)}`;
  assert.deepEqual(await (await h.call({ action: "resume", contextKey }, undefined, duplicate)).json(), { state: "unpaired" });
  assert.equal((await h.call({ action: "pair", contextKey: "家".repeat(16_384) })).status, 201, "UTF-8 body cap supports the documented character bound");
  assert.equal((await h.call({ action: "pair", contextKey: "家".repeat(40_000) })).status, 400);
});

test("storage failures fail closed with fixed error and no cookie or identity leakage", async () => {
  const h = fixture({ read() { throw new Error("private-file-password-marker"); }, write() { throw new Error("private-file-password-marker"); } });
  const response = await h.call({ action: "resume", contextKey }, undefined, `${PAIRING_COOKIE}=${"a".repeat(64)}`);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "pairing-storage-unavailable" });
  assert.equal(response.headers.get("set-cookie"), null);
});
