"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ApplianceId } from "@/domain/appliances";
import type { MessageConversationHandler, MessageConversationReply, MessageSyncTurn } from "@/domain/message-conversation";
import "./messages-connection.css";

type Props = { contextKey: string; applianceIds: readonly ApplianceId[]; onCommand: MessageConversationHandler; outboundTurns?: readonly MessageSyncTurn[] };
type Pairing = { token: string; code: string; recipient: string; expiresAt: number };
type Diagnostics = { lastInboundAt: number | null; lastInboundOutcome: "queued" | "unsupported-command" | null; lastReplyAt: number | null; lastReplyOutcome: "accepted" | "unconfirmed" | null; pendingCount: number };
class BridgeClientError extends Error { constructor(message: string, readonly status: number) { super(message); } }
type ApiResult = { available?: boolean; message?: string; error?: string; token?: string; code?: string; recipient?: string; expiresAt?: number; state?: string; diagnostics?: Diagnostics; messages?: Array<{ id: string; applianceId: ApplianceId; text: string; expiresAt: number }> };

/** A household change unmounts the old capability; no phone request can leak into another world. */
export function MessagesConnection({ contextKey, ...props }: Props) { return <MessagesSession key={contextKey} {...props}/>; }

function MessagesSession({ applianceIds, onCommand, outboundTurns }: Omit<Props, "contextKey">) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [paired, setPaired] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Checking the optional messaging bridge…");
  const current = useRef({ applianceIds, onCommand });
  const token = useRef<string | null>(null);
  const seen = useRef(new Set<string>());
  const generation = useRef(0);
  const pollingFailed = useRef(false);
  const activeConversation = useRef<AbortController | null>(null);
  const mirrored = useRef(new Set<string>());
  const outbound = useRef<MessageSyncTurn[]>([]);
  const sharedTurns = useRef(outboundTurns);
  const commitWaiter = useRef<{ check: () => void; cancel: () => void } | null>(null);

  useLayoutEffect(() => { current.current = { applianceIds, onCommand }; }, [applianceIds, onCommand]);
  useLayoutEffect(() => {
    const previous = sharedTurns.current;
    sharedTurns.current = outboundTurns;
    const authoritative = new Set(outboundTurns?.map(turn => turn.id));
    outbound.current = outbound.current.filter(turn => authoritative.has(turn.id));
    if (previous?.length && !outboundTurns?.length) commitWaiter.current?.cancel();
    for (const turn of (outboundTurns ?? []).slice(-60)) {
      if (mirrored.current.has(turn.id)) continue;
      mirrored.current.add(turn.id);
      if (!paired || turn.origin !== "web") continue;
      if (outbound.current.length >= 20) {
        setNotice("Messages sync queue is full. This turn remains on the website; it was not sent to your phone.");
        continue;
      }
      outbound.current.push(turn);
    }
    // The shared conversation is bounded; old rendered history must not become a delivery backlog.
    if (mirrored.current.size > 256) mirrored.current = new Set([...mirrored.current].slice(-128));
    if (!paired) outbound.current = [];
    commitWaiter.current?.check();
  }, [outboundTurns, paired]);
  useEffect(() => {
    const abort = new AbortController();
    const invalidate = () => { generation.current++; };
    fetch("/api/imessage", { cache: "no-store", signal: abort.signal }).then(async response => {
      const data = await response.json() as ApiResult;
      if (abort.signal.aborted) return;
      setAvailable(response.ok && data.available === true);
      setNotice(data.message ?? "Messaging bridge is unavailable. In-app chat still works.");
    }).catch(() => { if (!abort.signal.aborted) { setAvailable(false); setNotice("Messaging bridge could not be reached. In-app chat still works."); } });
    return () => {
      abort.abort(); invalidate();
      activeConversation.current?.abort();
      commitWaiter.current?.cancel();
      const old = token.current; token.current = null;
      if (old) void fetch("/api/imessage", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", Authorization: `Bearer ${old}` }, body: JSON.stringify({ action: "disconnect" }) }).catch(() => {});
    };
  }, []);

  async function api(action: string, capability?: string, extra: Record<string, string> = {}, signal?: AbortSignal) {
    const controller = new AbortController();
    let timer: number | undefined;
    let cancel = () => {};
    const deadline = new Promise<never>((_resolve, reject) => {
      cancel = () => { controller.abort(); reject(new Error("Messaging request cancelled.")); };
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) { cancel(); return; }
      timer = window.setTimeout(() => {
        controller.abort();
        reject(new Error(action === "reply" || action === "publish"
          ? "Reply delivery timed out. Check Messages; no automatic resend was made. Listening for new requests will resume."
          : action === "poll" ? "Messaging connection timed out. Retrying the connection automatically; keep this tab visible."
          : action === "pair" ? "Pairing request timed out. Select Pair my iPhone to try again."
          : "Messaging request timed out."));
      }, 20_000);
    });
    try {
      return await Promise.race([deadline, (async () => {
        const response = await fetch("/api/imessage", { method: "POST", headers: { "Content-Type": "application/json", ...(capability ? { Authorization: `Bearer ${capability}` } : {}) }, body: JSON.stringify({ action, ...extra }), signal: controller.signal });
        const data = await response.json() as ApiResult;
        if (!response.ok) throw new BridgeClientError(data.error ?? "Messaging request failed.", response.status);
        return data;
      })()]);
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }

  async function conversationReply(id: ApplianceId, text: string, messageId: string, expiresAt: number, parentSignal: AbortSignal) {
    const controller = new AbortController();
    activeConversation.current = controller;
    let timer: number | undefined;
    let cancel = () => {};
    const deadline = new Promise<never>((_resolve, reject) => {
      cancel = () => { controller.abort(); reject(new Error("Phone conversation canceled. Send again when this household is visible.")); };
      parentSignal.addEventListener("abort", cancel, { once: true });
      controller.signal.addEventListener("abort", () => reject(new Error("Phone conversation canceled. Send again when this household is visible.")), { once: true });
      if (parentSignal.aborted) { cancel(); return; }
      // The shared dispatcher bounds each model call; this deadline also allows time
      // waiting behind earlier web turns without exceeding the mailbox lifetime.
      timer = window.setTimeout(() => { reject(new Error("The shared conversation request expired. No reply was sent; send a new message to try again.")); controller.abort(); }, Math.max(0, expiresAt - Date.now()));
    });
    try {
      if (controller.signal.aborted) return;
      const value = await Promise.race([deadline, Promise.resolve(current.current.onCommand(id, text, { signal: controller.signal, messageId }))]);
      if (controller.signal.aborted || parentSignal.aborted || document.hidden || Date.now() >= expiresAt || value === undefined) return;
      const reply: MessageConversationReply = typeof value === "string" ? { text: value, source: "local" } : value;
      if (!reply || typeof reply.text !== "string" || !reply.text.trim() || reply.text.length > 5000 || !["openai", "local"].includes(reply.source)) throw new Error("The shared conversation returned no valid reply. No text was sent.");
      return reply;
    } finally {
      window.clearTimeout(timer);
      parentSignal.removeEventListener("abort", cancel);
      if (activeConversation.current === controller) activeConversation.current = null;
    }
  }

  function waitForSharedCommit(message: { applianceId: ApplianceId; text: string; expiresAt: number }, reply: MessageConversationReply, baseline: Set<string>, signal: AbortSignal): Promise<{ before: Set<string>; id: string } | undefined> {
    if (sharedTurns.current === undefined) return Promise.resolve(undefined);
    return new Promise((resolve, reject) => {
      const clear = () => { window.clearTimeout(timer); signal.removeEventListener("abort", cancel); if (commitWaiter.current?.check === check) commitWaiter.current = null; };
      const cancel = () => { clear(); reject(new Error("Shared conversation changed before sync. No phone reply was sent.")); };
      const check = () => {
        const turns = sharedTurns.current ?? [];
        const index = turns.findIndex(turn => !baseline.has(turn.id) && turn.origin === "imessage" && turn.applianceId === message.applianceId && turn.userText.trim() === message.text.trim() && turn.reply.text === reply.text && turn.reply.source === reply.source);
        if (index < 0) return;
        const before = new Set(turns.slice(0, index).filter(turn => turn.origin === "web").map(turn => turn.id));
        clear(); resolve({ before, id: turns[index].id });
      };
      commitWaiter.current = { check, cancel };
      signal.addEventListener("abort", cancel, { once: true });
      const timer = window.setTimeout(cancel, Math.min(5_000, Math.max(0, message.expiresAt - Date.now())));
      if (signal.aborted || document.hidden) cancel(); else check();
    });
  }

  useEffect(() => {
    if (!pairing) return;
    const abort = new AbortController();
    let inFlight = false;
    const publishQueued = async (before?: Set<string>) => {
      while (outbound.current.length && !document.hidden && !abort.signal.aborted && token.current === pairing.token) {
        if (before && !before.has(outbound.current[0].id)) break;
        const turn = outbound.current.shift()!;
        if (!current.current.applianceIds.includes(turn.applianceId)) continue;
        try {
          await api("publish", pairing.token, { id: turn.id, applianceId: turn.applianceId, userText: turn.userText, text: turn.reply.text, source: turn.reply.source }, abort.signal);
          if (!abort.signal.aborted) setNotice("Website conversation sent to BlueBubbles. Check your phone for receipt.");
        } catch (error) {
          if (!abort.signal.aborted) setNotice(error instanceof Error ? error.message : "Website turn delivery was not confirmed. No automatic resend was made.");
        }
      }
    };
    const poll = async () => {
      if (inFlight || document.hidden || abort.signal.aborted) return;
      inFlight = true;
      try {
        const data = await api("poll", pairing.token, {}, abort.signal);
        if (abort.signal.aborted || document.hidden) return;
        setPaired(data.state === "paired");
        if (pollingFailed.current) {
          pollingFailed.current = false;
          setNotice("Connection restored. Listening for phone requests while this tab is visible.");
        }
        setConnectionError(false);
        setDiagnostics(data.diagnostics ?? null);
        for (const message of data.messages ?? []) {
          if (document.hidden) break;
          if (abort.signal.aborted || token.current !== pairing.token || seen.current.has(message.id)) continue;
          await publishQueued();
          if (abort.signal.aborted || token.current !== pairing.token || document.hidden) break;
          seen.current.add(message.id);
          if (!Number.isFinite(message.expiresAt) || message.expiresAt <= Date.now()) {
            await api("dismiss", pairing.token, { id: message.id }, abort.signal);
            setNotice("An old phone request expired before processing. Send a new message to continue.");
            continue;
          }
          try {
            const baseline = new Set(sharedTurns.current?.map(turn => turn.id));
            const recruited = current.current.applianceIds.includes(message.applianceId);
            const reply = recruited
              ? await conversationReply(message.applianceId, message.text, message.id, message.expiresAt, abort.signal)
              : { text: "That appliance is not in this household. Add it in the web demo first.", source: "local" as const };
            if (abort.signal.aborted || token.current !== pairing.token) break;
            if (!reply || document.hidden) {
              await api("dismiss", pairing.token, { id: message.id }, abort.signal);
              setNotice("Phone conversation canceled. No reply was sent; send again when this household is ready.");
              continue;
            }
            if (recruited) {
              const committed = await waitForSharedCommit(message, reply, baseline, abort.signal);
              await publishQueued(committed?.before);
              if (committed && !sharedTurns.current?.some(turn => turn.id === committed.id)) throw new Error("Shared conversation changed before delivery. No phone reply was sent.");
            }
            if (abort.signal.aborted || token.current !== pairing.token || document.hidden) break;
            if (Date.now() >= message.expiresAt) {
              await api("dismiss", pairing.token, { id: message.id }, abort.signal);
              setNotice("Phone request expired before delivery. Its website reply remains available.");
              continue;
            }
            await api("reply", pairing.token, { id: message.id, text: reply.text, source: reply.source }, abort.signal);
            if (!abort.signal.aborted) setNotice("Phone request added to this household conversation. Reply accepted by the bridge; review any proposal here.");
          } catch (error) {
            if (!abort.signal.aborted) setNotice(error instanceof Error ? error.message : "Reply delivery was not confirmed. Check Messages; the web proposal remains available.");
            if (!abort.signal.aborted && token.current === pairing.token) await api("dismiss", pairing.token, { id: message.id }, abort.signal).catch(() => {});
          }
        }
        if (data.state === "paired") await publishQueued();
      } catch (error) {
        if (!abort.signal.aborted) {
          setConnectionError(true);
          pollingFailed.current = true;
          if (error instanceof BridgeClientError && error.status === 401) { token.current = null; setPairing(null); setPaired(false); }
          setNotice(error instanceof Error ? error.message : "Pairing needs attention. Disconnect and pair again.");
        }
      } finally { inFlight = false; }
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 2500);
    const visibility = () => { if (document.hidden) { activeConversation.current?.abort(); commitWaiter.current?.cancel(); } else void poll(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { abort.abort(); activeConversation.current?.abort(); commitWaiter.current?.cancel(); window.clearInterval(interval); document.removeEventListener("visibilitychange", visibility); };
  }, [pairing]);

  async function pair() {
    if (busy || !available) return;
    const epoch = ++generation.current; setBusy(true);
    try {
      const data = await api("pair");
      if (!data.token || !data.code || !data.recipient || !data.expiresAt) throw new Error("The bridge returned an incomplete pairing response.");
      if (epoch !== generation.current) { void api("disconnect", data.token).catch(() => {}); return; }
      token.current = data.token;
      setPairing({ token: data.token, code: data.code, recipient: data.recipient, expiresAt: data.expiresAt });
      pollingFailed.current = false;
      setPaired(false); setConnectionError(false); setDiagnostics(null); seen.current.clear(); setNotice("Send the pairing code from your configured phone. Codes expire in five minutes.");
    } catch (error) { if (epoch === generation.current) setNotice(error instanceof Error ? error.message : "Pairing failed."); }
    finally { if (epoch === generation.current) setBusy(false); }
  }
  async function disconnect() {
    const old = token.current; token.current = null; const epoch = ++generation.current;
    activeConversation.current?.abort(); commitWaiter.current?.cancel(); outbound.current = [];
    pollingFailed.current = false;
    setPairing(null); setPaired(false); setConnectionError(false); setDiagnostics(null); setBusy(false); seen.current.clear();
    setNotice("Disconnected in this browser. In-app chat remains available.");
    if (old) try { await api("disconnect", old); } catch { if (epoch === generation.current) setNotice("This browser stopped processing messages. Server revocation was not confirmed; its session will expire automatically."); }
  }

  return <section className="hm-messages-connect" aria-labelledby="hm-messages-title">
    <div><p className="hm-messages-kicker">TAKE YOUR TEAM WITH YOU</p><h2 id="hm-messages-title">Your applimon, in Messages.</h2><p>One conversation on the website and your phone. AI uses the web chat’s persona and recent context; your open household stays in charge of every approval.</p><p>Pairing enables phone text and new website turns to use this shared conversation. When AI is configured, text, planner details and recent chat go to OpenAI; API charges may apply. No photos or audio are sent to the model.</p></div>
    <span className={`hm-messages-badge${paired && !connectionError ? " is-paired" : ""}`}>{connectionError && pairing ? "CONNECTION INTERRUPTED · RETRYING" : paired ? "PAIRED TO THIS TAB" : available ? "READY TO PAIR" : "NOT CONNECTED"}</span>
    <p className="hm-messages-notice" role="status">{notice}</p>
    {paired && diagnostics && <p className="hm-messages-diagnostics">{diagnostics.lastInboundAt === null ? "No phone request received in this pairing yet." : `Last verified phone request: ${new Date(diagnostics.lastInboundAt).toLocaleTimeString()}. ${diagnostics.lastInboundOutcome === "unsupported-command" ? "Unknown teammate prefix. Use Evie:, Bubbles: or Chill:." : "Request queued for this household."}`} {diagnostics.lastReplyAt !== null && `Last reply: ${new Date(diagnostics.lastReplyAt).toLocaleTimeString()} — ${diagnostics.lastReplyOutcome === "accepted" ? "accepted by BlueBubbles; phone receipt not confirmed" : "delivery unconfirmed"}.`} {diagnostics.pendingCount > 0 && `${diagnostics.pendingCount} waiting.`}</p>}
    {pairing ? <><div className="hm-messages-pair"><p>{paired ? "Phone connected. Try sending:" : <>In Messages, send to <strong>{pairing.recipient}</strong>:</>}</p><code>{paired ? "Evie: Find a cheaper plan" : `PAIR ${pairing.code}`}</code>{!paired && <p>Use the phone configured by your bridge administrator. A code alone does not grant access from another sender.</p>}</div><button type="button" onClick={disconnect}>Disconnect Messages</button></> : <button type="button" disabled={!available || busy} onClick={pair}>{busy ? "Creating pairing code…" : "Pair my iPhone"}</button>}
    <details><summary>How this connection works</summary><ol><li>Configure a BlueBubbles server on a Mac and one allowed iMessage sender. No bridge account is currently provided by Housemates.</li><li>Pair this browser with your phone using the code. Keep this tab open and visible.</li><li>Text <code>Evie:</code>, <code>Bubbles:</code> or <code>Chill:</code> to choose a teammate. Plain follow-ups stay with the last teammate; a new pairing starts with Evie. Replies use the same web conversation.</li><li>Review and approve proposals here. Sending “approve” in Messages never starts a task.</li></ol><p>Text travels through Apple, your Mac bridge and this app server. The mailbox is temporary; unprocessed requests expire after five minutes. Refreshing, changing households or restarting the server requires pairing again. New website turns also sync while paired; earlier history is not replayed. No photos, attachments, group chats or automatic background execution.</p></details>
  </section>;
}
