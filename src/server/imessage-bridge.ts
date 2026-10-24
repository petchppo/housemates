import { randomBytes, timingSafeEqual } from "node:crypto";
import type { ApplianceId } from "../domain/appliances";
import { isSameOrigin } from "./request-origin";

export type BridgeConfig = { url: string; password: string; webhookSecret: string; allowedSender: string; recipient: string };
type Incoming = { id: string; applianceId: ApplianceId; text: string; receivedAt: number };
type SessionDiagnostics = { lastInboundAt: number | null; lastInboundOutcome: "queued" | "unsupported-command" | null; lastReplyAt: number | null; lastReplyOutcome: "accepted" | "unconfirmed" | null };
type Session = { token: string; code: string; deliveryId: string; expiresAt: number; pairExpiresAt: number; chatGuid: string | null; activeAppliance: ApplianceId; routingRevision: number; queue: Incoming[]; delivered: Set<string>; sending: Set<string>; attempted: Set<string>; diagnostics: SessionDiagnostics };
export type BridgeResult = { status: number; body: Record<string, unknown> };
const PAIR_MS = 5 * 60_000, SESSION_MS = 2 * 60 * 60_000, MAX_TEXT = 1200, MAX_ATTEMPTS = 128;
const names: Record<ApplianceId, string> = { evie: "Evie", bubbles: "Bubbles", chill: "Chill" };
const validId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,128}$/.test(value);
const validText = (value: unknown, max: number): value is string => typeof value === "string" && !!value.trim() && value.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
const validSource = (value: unknown): value is "openai" | "local" => value === "openai" || value === "local";
const replyHeader = (appliance: ApplianceId, source: "openai" | "local") => `[${names[appliance]} · ${source === "openai" ? "AI dialogue" : "local planner"} · simulation]`;
const result = (status: number, body: Record<string, unknown>): BridgeResult => ({ status, body });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

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

/** Strictly one-to-one iMessage text; webhook credentials and the configured sender are both required. */
export function parseBlueBubblesEvent(value: unknown, sender: string, now: number) {
  if (!record(value) || value.type !== "new-message" || !record(value.data)) return null;
  const data = value.data;
  if (data.isFromMe !== false || !record(data.handle) || normalizeMessageAddress(data.handle.address) !== sender ||
      typeof data.guid !== "string" || !/^[\w-]{1,128}$/.test(data.guid) || typeof data.text !== "string" ||
      !data.text.trim() || data.text.length > MAX_TEXT || !Array.isArray(data.chats) || data.chats.length !== 1 ||
      !record(data.chats[0]) || typeof data.chats[0].guid !== "string" ||
      !data.chats[0].guid.startsWith("iMessage;-;") || normalizeMessageAddress(data.chats[0].guid.slice(11)) !== sender ||
      typeof data.dateCreated !== "number" || !Number.isFinite(data.dateCreated) || Math.abs(now - data.dateCreated) > PAIR_MS ||
      (Array.isArray(data.attachments) && data.attachments.length > 0)) return null;
  return { id: data.guid, text: data.text.trim(), chatGuid: data.chats[0].guid };
}

/** Process-local mailbox. It NEVER runs the planner: the paired foreground browser owns that state. */
export class IMessageBridge {
  private sessions = new Map<string, Session>();
  private seen = new Map<string, number>();
  private pairAttempts: number[] = [];
  constructor(private now = Date.now, private nonce = () => randomBytes(32).toString("hex")) {}
  private sweep() {
    const now = this.now();
    for (const [key, session] of this.sessions) {
      if (session.expiresAt <= now || (!session.chatGuid && session.pairExpiresAt <= now)) this.sessions.delete(key);
      else session.queue = session.queue.filter(item => now - item.receivedAt < PAIR_MS);
    }
    for (const [id, expiry] of this.seen) if (expiry <= now) this.seen.delete(id);
    this.pairAttempts = this.pairAttempts.filter(time => now - time < 60_000);
  }
  create(config: BridgeConfig): BridgeResult {
    this.sweep();
    if (this.sessions.size >= 16) return result(429, { error: "Too many pairing sessions. Wait for unused codes to expire." });
    const token = this.nonce(), code = this.nonce().slice(0, 12).toUpperCase();
    const session: Session = { token, code, deliveryId: randomBytes(12).toString("hex"), expiresAt: this.now() + SESSION_MS, pairExpiresAt: this.now() + PAIR_MS, chatGuid: null, activeAppliance: "evie", routingRevision: 0, queue: [], delivered: new Set(), sending: new Set(), attempted: new Set(), diagnostics: { lastInboundAt: null, lastInboundOutcome: null, lastReplyAt: null, lastReplyOutcome: null } };
    this.sessions.set(token, session);
    return result(201, { token, code, recipient: config.recipient, expiresAt: session.pairExpiresAt });
  }
  poll(token: string): BridgeResult {
    this.sweep();
    const session = this.sessions.get(token);
    if (!session) return result(401, { error: "Pairing expired or the server restarted. Pair again." });
    // A waiting command cannot silently act on a household hours later.
    session.queue = session.queue.filter(item => this.now() - item.receivedAt < PAIR_MS);
    return result(200, { state: session.chatGuid ? "paired" : "awaiting-pair", expiresAt: session.expiresAt, messages: session.queue.map(({ id, applianceId, text, receivedAt }) => ({ id, applianceId, text, expiresAt: Math.min(receivedAt + PAIR_MS, session.expiresAt) })), diagnostics: { ...session.diagnostics, pendingCount: session.queue.length } });
  }
  disconnect(token: string): BridgeResult { this.sessions.delete(token); return result(200, { disconnected: true }); }
  receive(value: unknown, config: BridgeConfig): BridgeResult {
    this.sweep();
    const event = parseBlueBubblesEvent(value, config.allowedSender, this.now());
    if (!event) return result(200, { ignored: true });
    if (this.seen.has(event.id)) return result(200, { duplicate: true });
    if (this.seen.size >= 2048) return result(429, { error: "Event capacity reached. Try later." });
    this.seen.set(event.id, this.now() + SESSION_MS);
    const pairing = /^PAIR ([A-F0-9]{12})$/i.exec(event.text);
    if (pairing) {
      if (this.pairAttempts.length >= 10) return result(429, { error: "Too many pairing attempts." });
      this.pairAttempts.push(this.now());
      const session = [...this.sessions.values()].find(item => !item.chatGuid && item.code === pairing[1].toUpperCase() && item.pairExpiresAt > this.now());
      if (!session) return result(200, { ignored: true });
      // One phone controls one browser household at a time. Re-pair explicitly revokes the old capability.
      for (const [key, other] of this.sessions) if (other.chatGuid === event.chatGuid) this.sessions.delete(key);
      session.chatGuid = event.chatGuid;
      return result(200, { paired: true });
    }
    const session = [...this.sessions.values()].find(item => item.chatGuid === event.chatGuid);
    if (!session) return result(200, { ignored: true });
    const command = /^(evie|bubbles|chill)\s*:\s*([\s\S]+)$/i.exec(event.text);
    if (!command && /^[a-z][\w -]{0,30}\s*:/i.test(event.text)) {
      session.diagnostics.lastInboundAt = this.now();
      session.diagnostics.lastInboundOutcome = "unsupported-command";
      return result(200, { ignored: true });
    }
    if (session.queue.length >= 20) return result(429, { error: "The paired browser has too many waiting requests." });
    const applianceId = command ? command[1].toLowerCase() as ApplianceId : session.activeAppliance;
    const text = command ? command[2].trim() : event.text;
    if (!text) return result(200, { ignored: true });
    session.activeAppliance = applianceId;
    session.routingRevision++;
    session.queue.push({ id: event.id, applianceId, text, receivedAt: this.now() });
    session.diagnostics.lastInboundAt = this.now();
    session.diagnostics.lastInboundOutcome = "queued";
    return result(200, { queued: true });
  }
  dismiss(token: string, id: unknown): BridgeResult {
    this.sweep();
    const session = this.sessions.get(token);
    if (!session?.chatGuid) return result(401, { error: "Pair this browser before dismissing a request." });
    if (!validId(id)) return result(400, { error: "Invalid request ID." });
    if (session.sending.has(id)) return result(409, { error: "Delivery is already in progress." });
    session.queue = session.queue.filter(item => item.id !== id);
    return result(200, { dismissed: true });
  }
  async reply(token: string, id: unknown, text: unknown, config: BridgeConfig, send: typeof sendBlueBubblesText = sendBlueBubblesText, source: unknown = "local"): Promise<BridgeResult> {
    this.sweep();
    const session = this.sessions.get(token);
    if (!session?.chatGuid) return result(401, { error: "Pair this browser before replying." });
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
    if (!session?.chatGuid) return result(401, { error: "Pair this browser before syncing a conversation." });
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
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 24_000) { await reader.cancel(); throw new Error("Body too large"); } chunks.push(next.value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

export async function handleBridgeRequest(request: Request, bridge: IMessageBridge, config: BridgeConfig | null): Promise<Response> {
  const respond = ({ status, body }: BridgeResult) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  if (request.method === "GET") return respond(result(200, { available: !!config, provider: "BlueBubbles", message: config ? "Bridge configured; pair your phone to enable delivery." : "iMessage is not connected. A configured Mac messaging bridge is required. In-app chat works now." }));
  if (!config) return respond(result(503, { error: "iMessage bridge is not configured." }));
  const url = new URL(request.url);
  const webhook = url.searchParams.has("key");
  if (webhook) {
    if (!secretMatches(url.searchParams.get("key"), config.webhookSecret)) return respond(result(401, { error: "Unauthorized webhook." }));
  } else if (!isSameOrigin(request)) return respond(result(403, { error: "Same-origin browser request required." }));
  let body: unknown;
  try { body = await readLimitedJson(request); } catch { return respond(result(400, { error: "Invalid or oversized JSON." })); }
  if (webhook) return respond(bridge.receive(body, config));
  if (!record(body)) return respond(result(400, { error: "Invalid request." }));
  if (body.action === "pair") return respond(bridge.create(config));
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!/^[a-f0-9]{64}$/.test(token)) return respond(result(401, { error: "Missing browser pairing capability." }));
  if (body.action === "poll") return respond(bridge.poll(token));
  if (body.action === "disconnect") return respond(bridge.disconnect(token));
  if (body.action === "reply") return respond(await bridge.reply(token, body.id, body.text, config, undefined, body.source === undefined ? "local" : body.source));
  if (body.action === "dismiss") return respond(bridge.dismiss(token, body.id));
  if (body.action === "publish") {
    const turn = { ...body }; delete turn.action;
    return respond(await bridge.publish(token, turn, config));
  }
  return respond(result(400, { error: "Unknown action." }));
}
