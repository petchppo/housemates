import { randomBytes, timingSafeEqual } from "node:crypto";
import type { ApplianceId } from "../domain/appliances";
import { isSameOrigin } from "./request-origin";
import { householdContextHash, MemoryPairingStore, pairingHash, REMEMBER_MS, type PairingStore } from "./imessage-pairing-store";

export type BridgeConfig = { url: string; password: string; webhookSecret: string; allowedSender: string; recipient: string };
type Incoming = { id: string; applianceId: ApplianceId; text: string; receivedAt: number };
type SessionDiagnostics = { lastInboundAt: number | null; lastInboundOutcome: "queued" | "unsupported-command" | null; lastReplyAt: number | null; lastReplyOutcome: "accepted" | "unconfirmed" | null };
type Session = { contextHash: string | null; configFingerprint: string; rememberedHash: string | null; notBefore: number | null; token: string; code: string; deliveryId: string; expiresAt: number; pairExpiresAt: number; chatGuid: string | null; activeAppliance: ApplianceId; routingRevision: number; queue: Incoming[]; delivered: Set<string>; sending: Set<string>; attempted: Set<string>; diagnostics: SessionDiagnostics };
export type BridgeResult = { status: number; body: Record<string, unknown>; cookie?: string | null };
const PAIR_MS = 5 * 60_000, SESSION_MS = 2 * 60 * 60_000, MAX_TEXT = 1200, MAX_ATTEMPTS = 128;
export const PAIRING_COOKIE = "housemates_imessage_device";
const configFingerprint = (config: BridgeConfig) => pairingHash(JSON.stringify([config.url, config.allowedSender, config.recipient, config.webhookSecret, config.password]));
const names: Record<ApplianceId, string> = { evie: "Evie", bubbles: "Bubbles", chill: "Chill" };
const validId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,128}$/.test(value);
const validText = (value: unknown, max: number): value is string => typeof value === "string" && !!value.trim() && value.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
const validSource = (value: unknown): value is "openai" | "local" => value === "openai" || value === "local";
const replyHeader = (appliance: ApplianceId, source: "openai" | "local") => `[${names[appliance]} · ${source === "openai" ? "AI dialogue" : "local planner"} · simulation]`;
const result = (status: number, body: Record<string, unknown>): BridgeResult => ({ status, body });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
class PairingCapacityFailure extends Error {}

export function normalizeMessageAddress(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 254) return null;
  const clean = value.trim().toLowerCase();
  return /^\+[1-9]\d{7,14}$/.test(clean) || /^[^\s@;]+@[^\s@;]+\.[^\s@;]+$/.test(clean) ? clean : null;
}

export function readBridgeConfig(env: Readonly<Record<string, string | undefined>>): BridgeConfig | null {
  const url = env.HOUSEMATES_IMESSAGE_URL, password = env.HOUSEMATES_IMESSAGE_PASSWORD;
  const webhookSecret = env.HOUSEMATES_IMESSAGE_WEBHOOK_SECRET;
  const allowedSender = normalizeMessageAddress(env.HOUSEMATES_IMESSAGE_ALLOWED_SENDER);
  const recipient = normalizeMessageAddress(env.HOUSEMATES_IMESSAGE_RECIPIENT);
  if (!url || !password || password.length > 1024 || !webhookSecret || webhookSecret.length < 32 || webhookSecret.length > 256 || !allowedSender || !recipient || recipient === allowedSender) return null;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" ||
      !(parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)))) return null;
    return { url: parsed.origin, password, webhookSecret, allowedSender, recipient };
  } catch { return null; }
}

export function secretMatches(actual: string | null, expected: string): boolean {
  if (!actual || actual.length > 256) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type EventRejection = "invalid-envelope" | "event-type" | "self-sent" | "direction-invalid" | "sender-mismatch" | "message-id" | "text-or-attachment" | "chat-mismatch" | "timestamp";
type IngressCategory = EventRejection | "webhook-auth-missing" | "webhook-auth-invalid" | "request-origin-rejected" | "invalid-json"
  | "paired" | "pair-code-unmatched" | "queued" | "unpaired-chat" | "duplicate" | "event-capacity" | "pair-rate-limit" | "unsupported-command" | "queue-full";
function logIngress(category: IngressCategory) {
  // Only application-owned categories: never include any event or request fields.
  console.info(`housemates:imessage-ingress ${JSON.stringify({ category })}`);
}

function assessBlueBubblesEvent(value: unknown, sender: string, now: number) {
  const reject = (reason: EventRejection) => ({ event: null, reason });
  if (!record(value)) return reject("invalid-envelope");
  if (value.type !== "new-message") return reject("event-type");
  if (!record(value.data)) return reject("invalid-envelope");
  const data = value.data;
  if (data.isFromMe !== false) return reject(data.isFromMe === true ? "self-sent" : "direction-invalid");
  if (!record(data.handle) || normalizeMessageAddress(data.handle.address) !== sender) return reject("sender-mismatch");
  if (typeof data.guid !== "string" || !/^[\w-]{1,128}$/.test(data.guid)) return reject("message-id");
  if (typeof data.text !== "string" || !data.text.trim() || data.text.length > MAX_TEXT) return reject("text-or-attachment");
  if (!Array.isArray(data.chats) || data.chats.length !== 1 ||
      !record(data.chats[0]) || typeof data.chats[0].guid !== "string" ||
      !data.chats[0].guid.startsWith("iMessage;-;") || normalizeMessageAddress(data.chats[0].guid.slice(11)) !== sender) return reject("chat-mismatch");
  if (typeof data.dateCreated !== "number" || !Number.isFinite(data.dateCreated) || Math.abs(now - data.dateCreated) > PAIR_MS) return reject("timestamp");
  if (Array.isArray(data.attachments) && data.attachments.length > 0) return reject("text-or-attachment");
  return { event: { id: data.guid, text: data.text.trim(), chatGuid: data.chats[0].guid, createdAt: data.dateCreated }, reason: null };
}

/** Strictly one-to-one iMessage text; webhook credentials and the configured sender are both required. */
export function parseBlueBubblesEvent(value: unknown, sender: string, now: number) {
  return assessBlueBubblesEvent(value, sender, now).event;
}

/** Process-local mailbox. It NEVER runs the planner: the paired foreground browser owns that state. */
export class IMessageBridge {
  private sessions = new Map<string, Session>();
  private seen = new Map<string, number>();
  private pairAttempts: number[] = [];
  private replaced = new Map<string, number>();
  constructor(private now = Date.now, private nonce = () => randomBytes(32).toString("hex"), private store: PairingStore = new MemoryPairingStore()) {}
  private revoke(token: string, replaced = true) {
    const session = this.sessions.get(token);
    if (!session) return;
    if (replaced && !this.replaced.has(token) && this.replaced.size >= 128) throw new PairingCapacityFailure();
    this.sessions.delete(token);
    if (replaced) this.replaced.set(token, session.expiresAt);
  }
  private unavailable(token: string): BridgeResult {
    return this.replaced.has(token) ? result(409, { error: "session-replaced" }) : result(401, { error: "Pairing expired or the server restarted. Reconnect this browser." });
  }
  configure(config: BridgeConfig) {
    this.sweep();
    const fingerprint = configFingerprint(config);
    for (const [token, session] of this.sessions) if (session.configFingerprint !== fingerprint) this.revoke(token);
  }
  private sweep() {
    const now = this.now();
    for (const [key, session] of this.sessions) {
      if (session.expiresAt <= now || (!session.chatGuid && session.pairExpiresAt <= now)) this.sessions.delete(key);
      else session.queue = session.queue.filter(item => now - item.receivedAt < PAIR_MS);
    }
    for (const [id, expiry] of this.seen) if (expiry <= now) this.seen.delete(id);
    this.pairAttempts = this.pairAttempts.filter(time => now - time < 60_000);
    for (const [token, expiry] of this.replaced) if (expiry <= now) this.replaced.delete(token);
  }
  create(config: BridgeConfig, contextKey?: unknown): BridgeResult {
    this.sweep();
    const contextHash = contextKey === undefined ? null : householdContextHash(contextKey);
    if (contextKey !== undefined && !contextHash) return result(400, { error: "invalid-household-context" });
    if (this.sessions.size >= 16) return result(429, { error: "Too many pairing sessions. Wait for unused codes to expire." });
    const token = this.nonce(), code = this.nonce().slice(0, 12).toUpperCase();
    const session: Session = { contextHash, configFingerprint: configFingerprint(config), rememberedHash: null, notBefore: null, token, code, deliveryId: randomBytes(12).toString("hex"), expiresAt: this.now() + SESSION_MS, pairExpiresAt: this.now() + PAIR_MS, chatGuid: null, activeAppliance: "evie", routingRevision: 0, queue: [], delivered: new Set(), sending: new Set(), attempted: new Set(), diagnostics: { lastInboundAt: null, lastInboundOutcome: null, lastReplyAt: null, lastReplyOutcome: null } };
    this.sessions.set(token, session);
    return result(201, { token, code, recipient: config.recipient, expiresAt: session.pairExpiresAt });
  }
  poll(token: string): BridgeResult {
    this.sweep();
    const session = this.sessions.get(token);
    if (!session) return this.unavailable(token);
    // A waiting command cannot silently act on a household hours later.
    session.queue = session.queue.filter(item => this.now() - item.receivedAt < PAIR_MS);
    return result(200, { state: session.chatGuid ? "paired" : "awaiting-pair", expiresAt: session.expiresAt, messages: session.queue.map(({ id, applianceId, text, receivedAt }) => ({ id, applianceId, text, expiresAt: Math.min(receivedAt + PAIR_MS, session.expiresAt) })), diagnostics: { ...session.diagnostics, pendingCount: session.queue.length } });
  }
  detach(token: string): BridgeResult { this.revoke(token, false); return result(200, { detached: true }); }
  disconnect(token: string, credential: string | null = null): BridgeResult {
    const session = this.sessions.get(token);
    const hash = credential ? pairingHash(credential) : session?.rememberedHash;
    const bindings = this.store.read();
    const chats = new Set(bindings.filter(item => item.credentialHash === hash).map(item => item.chatGuid));
    if (session?.chatGuid) chats.add(session.chatGuid);
    this.store.write(bindings.filter(item => !chats.has(item.chatGuid) && item.credentialHash !== hash));
    for (const [key, active] of this.sessions) if (key === token || (active.chatGuid && chats.has(active.chatGuid))) this.revoke(key, false);
    return { ...result(200, { disconnected: true }), cookie: null };
  }
  remember(token: string, contextKey: unknown, config: BridgeConfig, credential: string | null): BridgeResult {
    this.sweep(); this.configure(config);
    const session = this.sessions.get(token);
    if (!session) return this.unavailable(token);
    if (!session.chatGuid) return result(409, { error: "phone-proof-required" });
    const contextHash = householdContextHash(contextKey);
    if (!contextHash) return result(400, { error: "invalid-household-context" });
    if (session.contextHash && session.contextHash !== contextHash) return result(409, { error: "remembered-household-mismatch" });
    const current = this.store.read();
    // A live token cannot replace another household's cookie by supplying a different context.
    const old = credential ? current.find(item => item.credentialHash === pairingHash(credential)) : undefined;
    if (old && old.contextHash !== contextHash) return result(409, { error: "remembered-household-mismatch" });
    const nextCredential = randomBytes(32).toString("hex"), credentialHash = pairingHash(nextCredential);
    const bindings = current.filter(item => item.expiresAt > this.now() && item.chatGuid !== session.chatGuid && item.credentialHash !== old?.credentialHash);
    if (bindings.length >= 16) return result(429, { error: "pairing-capacity" });
    this.store.write([...bindings, { credentialHash, contextHash, configFingerprint: session.configFingerprint, chatGuid: session.chatGuid, createdAt: this.now(), expiresAt: this.now() + REMEMBER_MS }]);
    session.contextHash = contextHash; session.rememberedHash = credentialHash;
    return { ...result(200, { remembered: true }), cookie: nextCredential };
  }
  resume(credential: string | null, contextKey: unknown, config: BridgeConfig): BridgeResult {
    this.sweep(); this.configure(config);
    const contextHash = householdContextHash(contextKey);
    if (!contextHash) return result(400, { error: "invalid-household-context" });
    if (!credential) return result(200, { state: "unpaired" });
    const bindings = this.store.read();
    const binding = bindings.find(item => item.credentialHash === pairingHash(credential));
    if (!binding) return { ...result(200, { state: "unpaired" }), cookie: null };
    if (binding.expiresAt <= this.now() || binding.configFingerprint !== configFingerprint(config) || binding.chatGuid !== `iMessage;-;${config.allowedSender}`) {
      this.store.write(bindings.filter(item => item !== binding));
      for (const [token, active] of this.sessions) if (active.rememberedHash === binding.credentialHash) this.revoke(token);
      return { ...result(200, { state: "unpaired" }), cookie: null };
    }
    if (binding.contextHash !== contextHash) return result(409, { error: "remembered-household-mismatch" });
    if (this.sessions.size >= 16 && ![...this.sessions.values()].some(item => item.chatGuid === binding.chatGuid)) return result(429, { error: "pairing-capacity" });
    this.store.write(bindings.map(item => item === binding ? { ...item, expiresAt: this.now() + REMEMBER_MS } : item));
    for (const [token, active] of this.sessions) if (active.chatGuid === binding.chatGuid) this.revoke(token);
    const created = this.create(config, contextKey);
    const token = created.body.token as string, session = this.sessions.get(token)!;
    session.chatGuid = binding.chatGuid; session.code = ""; session.rememberedHash = binding.credentialHash; session.notBefore = this.now();
    return { ...result(200, { token, code: "", recipient: config.recipient, expiresAt: session.expiresAt, state: "paired", remembered: true }), cookie: credential };
  }
  receive(value: unknown, config: BridgeConfig): BridgeResult {
    this.sweep();
    const finish = (category: IngressCategory, response: BridgeResult) => { logIngress(category); return response; };
    const assessment = assessBlueBubblesEvent(value, config.allowedSender, this.now());
    const event = assessment.event;
    if (!event) return finish(assessment.reason!, result(200, { ignored: true }));
    if (this.seen.has(event.id)) return finish("duplicate", result(200, { duplicate: true }));
    if (this.seen.size >= 2048) return finish("event-capacity", result(429, { error: "Event capacity reached. Try later." }));
    this.seen.set(event.id, this.now() + SESSION_MS);
    const pairing = /^PAIR ([A-F0-9]{12})$/i.exec(event.text);
    if (pairing) {
      if (this.pairAttempts.length >= 10) return finish("pair-rate-limit", result(429, { error: "Too many pairing attempts." }));
      this.pairAttempts.push(this.now());
      const session = [...this.sessions.values()].find(item => !item.chatGuid && item.code === pairing[1].toUpperCase() && item.pairExpiresAt > this.now());
      if (!session) return finish("pair-code-unmatched", result(200, { ignored: true }));
      // One phone controls one browser household at a time. Re-pair explicitly revokes the old capability.
      for (const [key, other] of this.sessions) if (other.chatGuid === event.chatGuid) this.revoke(key);
      const remembered = this.store.read();
      if (remembered.some(item => item.chatGuid === event.chatGuid)) this.store.write(remembered.filter(item => item.chatGuid !== event.chatGuid));
      session.chatGuid = event.chatGuid;
      return finish("paired", result(200, { paired: true }));
    }
    const session = [...this.sessions.values()].find(item => item.chatGuid === event.chatGuid);
    if (!session) return finish("unpaired-chat", result(200, { ignored: true }));
    if (session.notBefore !== null && event.createdAt <= session.notBefore) return finish("timestamp", result(200, { ignored: true }));
    const command = /^(evie|bubbles|chill)\s*:\s*([\s\S]+)$/i.exec(event.text);
    if (!command && /^[a-z][\w -]{0,30}\s*:/i.test(event.text)) {
      session.diagnostics.lastInboundAt = this.now();
      session.diagnostics.lastInboundOutcome = "unsupported-command";
      return finish("unsupported-command", result(200, { ignored: true }));
    }
    if (session.queue.length >= 20) return finish("queue-full", result(429, { error: "The paired browser has too many waiting requests." }));
    const applianceId = command ? command[1].toLowerCase() as ApplianceId : session.activeAppliance;
    const text = command ? command[2].trim() : event.text;
    if (!text) return finish("text-or-attachment", result(200, { ignored: true }));
    session.activeAppliance = applianceId;
    session.routingRevision++;
    session.queue.push({ id: event.id, applianceId, text, receivedAt: this.now() });
    session.diagnostics.lastInboundAt = this.now();
    session.diagnostics.lastInboundOutcome = "queued";
    return finish("queued", result(200, { queued: true }));
  }
  dismiss(token: string, id: unknown): BridgeResult {
    this.sweep();
    const session = this.sessions.get(token);
    if (!session) return this.unavailable(token);
    if (!session.chatGuid) return result(401, { error: "Pair this browser before dismissing a request." });
    if (!validId(id)) return result(400, { error: "Invalid request ID." });
    if (session.sending.has(id)) return result(409, { error: "Delivery is already in progress." });
    session.queue = session.queue.filter(item => item.id !== id);
    return result(200, { dismissed: true });
  }
  async reply(token: string, id: unknown, text: unknown, config: BridgeConfig, send: typeof sendBlueBubblesText = sendBlueBubblesText, source: unknown = "local"): Promise<BridgeResult> {
    this.sweep();
    const session = this.sessions.get(token);
    if (!session) return this.unavailable(token);
    if (!session.chatGuid) return result(401, { error: "Pair this browser before replying." });
    if (!validId(id) || !validText(text, 5000) || !validSource(source)) return result(400, { error: "Invalid reply." });
    if (session.delivered.has(id)) return result(200, { delivered: true, duplicate: true });
    const incoming = session.queue.find(item => item.id === id);
    if (!incoming) return result(409, { error: "That request is no longer waiting." });
    if (session.sending.has(id) || session.attempted.has(id)) return result(409, { error: "Delivery already attempted. Check Messages; no automatic resend to avoid duplicates." });
    if (session.attempted.size >= MAX_ATTEMPTS) return result(429, { error: "This pairing reached its delivery limit. Pair again." });
    session.sending.add(id); session.attempted.add(id);
    try {
      await send(config, session.chatGuid, `${replyHeader(incoming.applianceId, source)}\n${text}\nReview and approve any proposal in your open Housemates browser.`, `incoming-${id}`);
      session.delivered.add(id); session.queue = session.queue.filter(item => item.id !== id);
      session.diagnostics.lastReplyAt = this.now();
      session.diagnostics.lastReplyOutcome = "accepted";
      return result(200, { delivered: true });
    } catch {
      // A timeout may have delivered; leave no automatic retry that could duplicate a real message.
      session.queue = session.queue.filter(item => item.id !== id);
      session.diagnostics.lastReplyAt = this.now();
      session.diagnostics.lastReplyOutcome = "unconfirmed";
      return result(502, { error: "Reply delivery was not confirmed. Check Messages. The web proposal remains available; no automatic resend was made." });
    } finally { session.sending.delete(id); }
  }
  /** Mirror a completed web turn, using only the chat proven by this session's phone pairing. */
  async publish(token: string, value: unknown, config: BridgeConfig, send: typeof sendBlueBubblesText = sendBlueBubblesText): Promise<BridgeResult> {
    this.sweep();
    const session = this.sessions.get(token);
    if (!session) return this.unavailable(token);
    if (!session.chatGuid) return result(401, { error: "Pair this browser before syncing a conversation." });
    if (!record(value) || Object.keys(value).sort().join(",") !== "applianceId,id,source,text,userText" ||
        !validId(value.id) || typeof value.applianceId !== "string" || !Object.prototype.hasOwnProperty.call(names, value.applianceId) ||
        !validText(value.userText, MAX_TEXT) || !validText(value.text, 5000) || !validSource(value.source)) return result(400, { error: "Invalid conversation turn." });
    const applianceId = value.applianceId as ApplianceId;
    const id = `web:${value.id}`;
    if (session.delivered.has(id)) return result(200, { delivered: true, duplicate: true });
    if (session.sending.has(id) || session.attempted.has(id)) return result(409, { error: "Delivery already attempted. Check Messages; no automatic resend to avoid duplicates." });
    if (session.attempted.size >= MAX_ATTEMPTS) return result(429, { error: "This pairing reached its delivery limit. Pair again." });
    session.sending.add(id); session.attempted.add(id);
    const routingRevision = ++session.routingRevision;
    try {
      await send(config, session.chatGuid, `[You · website]\n${value.userText}\n\n${replyHeader(applianceId, value.source)}\n${value.text}\nReview and approve any proposal in your open Housemates browser.`, `web-${session.deliveryId}-${value.id}`);
      session.delivered.add(id);
      // A later explicit phone target must not be overwritten by a slower web delivery.
      if (session.routingRevision === routingRevision) session.activeAppliance = applianceId;
      session.diagnostics.lastReplyAt = this.now(); session.diagnostics.lastReplyOutcome = "accepted";
      return result(200, { delivered: true });
    } catch {
      session.diagnostics.lastReplyAt = this.now(); session.diagnostics.lastReplyOutcome = "unconfirmed";
      return result(502, { error: "Conversation sync delivery was not confirmed. Check Messages; no automatic resend was made." });
    } finally { session.sending.delete(id); }
  }
}

export async function sendBlueBubblesText(config: BridgeConfig, chatGuid: string, text: string, id: string, fetcher: typeof fetch = fetch) {
  const url = new URL("/api/v1/message/text", config.url);
  url.searchParams.set("password", config.password);
  const response = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatGuid, message: text, method: "apple-script", tempGuid: `housemates-${id}` }), signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!response.ok) throw new Error("Bridge delivery failed");
  const body: unknown = await response.json();
  if (!record(body) || body.status !== 200) throw new Error("Bridge did not confirm delivery");
}

export async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("Expected JSON");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 80_000) { await reader.cancel(); throw new Error("Body too large"); } chunks.push(next.value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

export async function handleBridgeRequest(request: Request, bridge: IMessageBridge, config: BridgeConfig | null): Promise<Response> {
  const respond = ({ status, body, cookie }: BridgeResult) => {
    const headers: Record<string, string> = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
    if (cookie !== undefined) headers["Set-Cookie"] = `${PAIRING_COOKIE}=${cookie ?? ""}; Path=/api/imessage; HttpOnly; SameSite=Strict; Max-Age=${cookie === null ? 0 : REMEMBER_MS / 1000}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
    return Response.json(body, { status, headers });
  };
  if (request.method === "GET") return respond(result(200, { available: !!config, provider: "BlueBubbles", message: config ? "Bridge configured; pair your phone to enable delivery." : "iMessage is not connected. A configured Mac messaging bridge is required. In-app chat works now." }));
  if (!config) return respond(result(503, { error: "iMessage bridge is not configured." }));
  if (request.method !== "POST") return respond(result(405, { error: "method-not-allowed" }));
  const url = new URL(request.url);
  const webhook = url.searchParams.has("key");
  if (webhook) {
    if (!secretMatches(url.searchParams.get("key"), config.webhookSecret)) {
      logIngress(url.searchParams.get("key") ? "webhook-auth-invalid" : "webhook-auth-missing");
      return respond(result(401, { error: "Unauthorized webhook." }));
    }
  } else if (!isSameOrigin(request)) {
    logIngress(request.headers.has("origin") ? "request-origin-rejected" : "webhook-auth-missing");
    return respond(result(403, { error: "Same-origin browser request required." }));
  }
  let body: unknown;
  try { body = await readLimitedJson(request); } catch {
    if (webhook) logIngress("invalid-json");
    return respond(result(400, { error: "Invalid or oversized JSON." }));
  }
  try {
    bridge.configure(config);
    if (webhook) return respond(bridge.receive(body, config));
    if (!record(body)) return respond(result(400, { error: "Invalid request." }));
    const keys = Object.keys(body).sort().join(",");
    const cookieValues = (request.headers.get("cookie") ?? "").split(";").map(item => item.trim()).filter(item => item.startsWith(`${PAIRING_COOKIE}=`));
    const rawCookie = cookieValues.length === 1 ? cookieValues[0].slice(PAIRING_COOKIE.length + 1) : null;
    const credential = rawCookie && /^[a-f0-9]{64}$/.test(rawCookie) ? rawCookie : null;
    if (body.action === "pair") {
      if (keys !== "action" && keys !== "action,contextKey") return respond(result(400, { error: "Invalid pairing request." }));
      return respond(bridge.create(config, body.contextKey));
    }
    if (body.action === "resume") {
      if (keys !== "action,contextKey") return respond(result(400, { error: "invalid-household-context" }));
      return respond(bridge.resume(credential, body.contextKey, config));
    }
    const auth = request.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
    if (body.action === "disconnect" && keys === "action") return respond(bridge.disconnect(/^[a-f0-9]{64}$/.test(token) ? token : "", credential));
    if (!/^[a-f0-9]{64}$/.test(token)) return respond(result(401, { error: "Missing browser pairing capability." }));
    if (body.action === "remember") {
      if (keys !== "action,contextKey") return respond(result(400, { error: "invalid-household-context" }));
      return respond(bridge.remember(token, body.contextKey, config, credential));
    }
    if (body.action === "detach" && keys === "action") return respond(bridge.detach(token));
    if (body.action === "poll") return respond(bridge.poll(token));
    if (body.action === "reply") return respond(await bridge.reply(token, body.id, body.text, config, undefined, body.source === undefined ? "local" : body.source));
    if (body.action === "dismiss") return respond(bridge.dismiss(token, body.id));
    if (body.action === "publish") {
      const turn = { ...body }; delete turn.action;
      return respond(await bridge.publish(token, turn, config));
    }
    return respond(result(400, { error: "Unknown action." }));
  } catch (error) {
    // No paths, identities, credentials or raw filesystem errors leave the server.
    if (error instanceof PairingCapacityFailure) return respond(result(429, { error: "pairing-capacity" }));
    return respond(result(503, { error: "pairing-storage-unavailable" }));
  }
}
