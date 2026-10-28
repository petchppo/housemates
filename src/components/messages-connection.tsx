"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ApplianceId } from "@/domain/appliances";
import type { MessageConversationHandler, MessageConversationReply, MessageSyncTurn } from "@/domain/message-conversation";
import "./messages-connection.css";

type Props = { contextKey: string; applianceIds: readonly ApplianceId[]; onCommand: MessageConversationHandler; outboundTurns?: readonly MessageSyncTurn[] };
type Pairing = { token: string; code: string; recipient: string; expiresAt: number };
type Diagnostics = { lastInboundAt: number | null; lastInboundOutcome: "queued" | "unsupported-command" | null; lastReplyAt: number | null; lastReplyOutcome: "accepted" | "unconfirmed" | null; pendingCount: number };
class BridgeClientError extends Error { constructor(message: string, readonly status: number) { super(message); } }
type ApiResult = { status?: string; available?: boolean; message?: string; error?: string; token?: string; code?: string; recipient?: string; expiresAt?: number; state?: string; remembered?: boolean; diagnostics?: Diagnostics; messages?: Array<{ id: string; applianceId: ApplianceId; text: string; expiresAt: number }> };

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
        const response = await fetch("/api/imessage", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", ...(capability ? { Authorization: `Bearer ${capability}` } : {}) }, body: JSON.stringify({ action, ...extra }), signal: controller.signal });
        const data = await response.json() as ApiResult;
        if (!response.ok) throw new BridgeClientError(data.error ?? "Messaging request failed.", response.status);
        return data;
      })()]);
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }


/** A household change unmounts the old capability; no phone request can leak into another world. */
export function MessagesConnection({ contextKey, ...props }: Props) { return <MessagesSession key={contextKey} contextKey={contextKey} {...props}/>; }

function MessagesSession({ contextKey, applianceIds, onCommand, outboundTurns }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [beta, setBeta] = useState(false);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [paired, setPaired] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreBlocked, setRestoreBlocked] = useState<"household" | "elsewhere" | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Checking the optional messaging bridge…");
  const current = useRef({ applianceIds, onCommand });
  const token = useRef<string | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const pollingAbort = useRef<AbortController | null>(null);
  const recovered = useRef(false);
  const rememberAttempted = useRef<string | null>(null);
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
  const adopt = useCallback((data: ApiResult, restored: boolean) => {
    if (typeof data.token !== "string" || !/^[a-f0-9]{64}$/.test(data.token) || typeof data.code !== "string" ||
      (!restored && !/^[A-F0-9]{12}$/.test(data.code)) || typeof data.recipient !== "string" || !data.recipient || data.recipient.length > 254 ||
      typeof data.expiresAt !== "number" || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now() ||
      (restored && (data.state !== "paired" || data.remembered !== true))) throw new Error("The bridge returned an incomplete pairing response.");
    token.current = data.token;
    setPairing({ token: data.token, code: data.code, recipient: data.recipient, expiresAt: data.expiresAt });
    setPaired(restored); setRemembered(restored); setRestoreBlocked(null); setConnectionError(false); setDiagnostics(null);
    pollingFailed.current = false; rememberAttempted.current = restored ? data.token : null;
    outbound.current = [];
    // Reattachment never replays history or an uncertain delivery from the previous session.
    for (const turn of sharedTurns.current ?? []) mirrored.current.add(turn.id);
    if (!restored) seen.current.clear();
    setNotice(restored ? "Your remembered phone is connected again. Keep this household tab open and visible for replies." : "Send the pairing code from your configured phone. Codes expire in five minutes.");
  }, []);

  const restore = useCallback(async (signal: AbortSignal, epoch: number) => {
    setRestoring(true); setBusy(true); setNotice("Restoring your remembered phone connection…");
    try {
      const data = await api("resume", undefined, { contextKey }, signal);
      if (signal.aborted || epoch !== generation.current) return;
      if (data.state === "paired") adopt(data, true);
      else if (data.state === "unpaired") {
        setRemembered(false); setRestoreBlocked(null);
        setNotice("No remembered phone for this browser. Pair once to reconnect automatically on future visits.");
      } else throw new Error("The bridge returned an invalid connection state.");
    } catch (error) {
      if (signal.aborted || epoch !== generation.current) return;
      if (error instanceof BridgeClientError && error.status === 409) {
        setRestoreBlocked("household");
        setNotice("Your remembered phone belongs to another household. It has not been connected here. Return to that household or disconnect the remembered phone before pairing here.");
      } else setNotice("Could not restore the remembered phone connection. Your saved pairing was not removed. Try refreshing when the bridge is available, or pair manually.");
    } finally { if (!signal.aborted && epoch === generation.current) { setRestoring(false); setBusy(false); } }
  }, [adopt, contextKey]);

  useLayoutEffect(() => {
    const abort = new AbortController(); lifecycle.current = abort;
    const invalidate = () => { generation.current++; };
    return () => {
      invalidate(); abort.abort(); pollingAbort.current?.abort();
      activeConversation.current?.abort(); commitWaiter.current?.cancel();
      const old = token.current; token.current = null;
      if (old) void fetch("/api/imessage", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json", Authorization: `Bearer ${old}` }, body: JSON.stringify({ action: "detach" }) }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    const abort = lifecycle.current!;
    const epoch = generation.current;
    void (async () => {
      try {
        const response = await fetch("/api/imessage", { cache: "no-store", signal: abort.signal });
        const data = await response.json() as ApiResult;
        if (abort.signal.aborted || epoch !== generation.current) return;
        const isBeta = data.status === "beta";
        setBeta(isBeta);
        const configured = response.ok && data.available === true && !isBeta;
        setAvailable(configured);
        setNotice(data.message ?? "Messaging bridge is unavailable. In-app chat still works.");
        if (configured) await restore(abort.signal, epoch);
      } catch { if (!abort.signal.aborted && epoch === generation.current) { setAvailable(false); setNotice("Messaging bridge could not be reached. In-app chat still works."); } }
    })();
  }, [restore]);


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
    const abort = new AbortController(); pollingAbort.current = abort;
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
        // A proven healthy replacement ends this recovery episode; an immediately
        // rejected replacement must not trigger another resume loop.
        if (data.state === "paired") recovered.current = false;
        if (data.state === "paired" && rememberAttempted.current !== pairing.token) {
          rememberAttempted.current = pairing.token;
          try {
            const saved = await api("remember", pairing.token, { contextKey }, abort.signal);
            if (abort.signal.aborted || token.current !== pairing.token) return;
            if (saved.remembered !== true) throw new Error("Remembering this pairing was not confirmed.");
            setRemembered(true);
            setNotice("Phone paired and remembered in this browser. Refresh will reconnect automatically; keep a household tab visible for replies.");
          } catch {
            if (abort.signal.aborted || token.current !== pairing.token) return;
            setRemembered(false);
            setNotice("Phone connected for now, but remembering this pairing was not confirmed. You may need to pair again after refresh.");
          }
        }
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
          if (error instanceof BridgeClientError && (error.status === 401 || error.status === 409)) {
            token.current = null; setPairing(null); setPaired(false); outbound.current = [];
            activeConversation.current?.abort(); commitWaiter.current?.cancel();
            if (error.status === 409) {
              setRestoreBlocked("elsewhere"); setConnectionError(false);
              setNotice("This phone is linked in another tab. Continue there, or pair this tab explicitly. Automatic reconnect is stopped here.");
            } else if (!recovered.current && lifecycle.current && !lifecycle.current.signal.aborted) {
              recovered.current = true;
              await restore(lifecycle.current.signal, ++generation.current);
            } else setNotice("The phone session ended. Automatic reconnect was already attempted for this interruption; pair manually or refresh to try again.");
          } else setNotice(error instanceof Error ? error.message : "Pairing needs attention. Disconnect and pair again.");
        }
      } finally { inFlight = false; }
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 2500);
    const visibility = () => { if (document.hidden) { activeConversation.current?.abort(); commitWaiter.current?.cancel(); } else void poll(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { abort.abort(); activeConversation.current?.abort(); commitWaiter.current?.cancel(); window.clearInterval(interval); document.removeEventListener("visibilitychange", visibility); };
  }, [pairing, contextKey, restore]);

  async function pair() {
    if (busy || !available || !lifecycle.current || lifecycle.current.signal.aborted) return;
    const epoch = ++generation.current; setBusy(true);
    try {
      const data = await api("pair", undefined, { contextKey }, lifecycle.current.signal);
      if (epoch !== generation.current) { if (data.token) void api("detach", data.token).catch(() => {}); return; }
      adopt(data, false);
    } catch (error) { if (epoch === generation.current) setNotice(error instanceof Error ? error.message : "Pairing failed."); }
    finally { if (epoch === generation.current) setBusy(false); }
  }

  async function disconnect() {
    const old = token.current; token.current = null; const epoch = ++generation.current;
    pollingAbort.current?.abort(); activeConversation.current?.abort(); commitWaiter.current?.cancel(); outbound.current = [];
    pollingFailed.current = false;
    setPairing(null); setPaired(false); setRemembered(false); setRestoreBlocked(null); setRestoring(false); setConnectionError(false); setDiagnostics(null); setBusy(false); seen.current.clear();
    setNotice("Disconnected here. Forgetting the remembered phone pairing…");
    try { await api("disconnect", old ?? undefined); if (epoch === generation.current) setNotice("Disconnected and forgot the remembered phone pairing. In-app chat remains available."); } catch { if (epoch === generation.current) { setRestoreBlocked("household"); setNotice("This tab stopped processing messages, but forgetting the saved pairing was not confirmed. Use Disconnect remembered phone to retry before refreshing."); } }
  }

  if (beta) return <section className="hm-messages-connect hm-messages-beta" aria-labelledby="hm-messages-title">
    <p className="hm-messages-kicker">TAKE YOUR TEAM WITH YOU</p>
    <h2 id="hm-messages-title">Your applimon, in Messages.</h2>
    <span className="hm-messages-badge">BETA · FEATURE PREVIEW</span>
    <p className="hm-messages-notice" role="status">Phone pairing is not available on this public demo. Your household chat still works here.</p>
    <ol className="hm-messages-beta-features">
      <li><strong>One shared conversation</strong><span>Text naturally and continue with the same teammate on your phone and the website.</span></li>
      <li><strong>A remembered phone link</strong><span>In a privately configured local installation, pair once and reconnect on your next visit.</span></li>
      <li><strong>You stay in charge</strong><span>Review proposals in the household. A text never approves a plan or starts a task.</span></li>
    </ol>
    <p className="hm-messages-beta-boundary">This preview does not receive or send iMessages. The local beta needs a configured Mac bridge and an open household tab; no real devices are controlled.</p>
  </section>;

  return <section className="hm-messages-connect" aria-labelledby="hm-messages-title">
    <div><p className="hm-messages-kicker">TAKE YOUR TEAM WITH YOU</p><h2 id="hm-messages-title">Your applimon, in Messages.</h2><p>One conversation on the website and your phone. AI uses the web chat’s persona and recent context; your open household stays in charge of every approval.</p><p>Pairing enables phone text and new website turns to use this shared conversation. When AI is configured, text, planner details and recent chat go to OpenAI; API charges may apply. No photos or audio are sent to the model.</p></div>
    <span className={`hm-messages-badge${paired && !connectionError ? " is-paired" : ""}`}>{restoring ? "RESTORING PHONE LINK" : restoreBlocked === "elsewhere" ? "LINKED IN ANOTHER TAB" : connectionError && pairing ? "CONNECTION INTERRUPTED · RETRYING" : paired ? remembered ? "PAIRED · REMEMBERED" : "PAIRED TO THIS TAB" : available ? "READY TO PAIR" : "NOT CONNECTED"}</span>
    <p className="hm-messages-notice" role="status">{notice}</p>
    {paired && diagnostics && <p className="hm-messages-diagnostics">{diagnostics.lastInboundAt === null ? "No phone request received in this pairing yet." : `Last verified phone request: ${new Date(diagnostics.lastInboundAt).toLocaleTimeString()}. ${diagnostics.lastInboundOutcome === "unsupported-command" ? "That teammate is not available in Messages. Keep chatting normally, or say hi to Evie, Bubbles or Chill." : "Request queued for this household."}`} {diagnostics.lastReplyAt !== null && `Last reply: ${new Date(diagnostics.lastReplyAt).toLocaleTimeString()} — ${diagnostics.lastReplyOutcome === "accepted" ? "accepted by BlueBubbles; phone receipt not confirmed" : "delivery unconfirmed"}.`} {diagnostics.pendingCount > 0 && `${diagnostics.pendingCount} waiting.`}</p>}
    {pairing ? <><div className="hm-messages-pair"><p>{paired ? "Phone connected. Just text naturally, for example:" : <>In Messages, send to <strong>{pairing.recipient}</strong>:</>}</p><code>{paired ? "Find a cheaper plan" : `PAIR ${pairing.code}`}</code>{paired ? <p>No name or special format needed. You can say hi, laugh, ask a question or talk about your plan.</p> : <p>Use the phone configured by your bridge administrator. A code alone does not grant access from another sender.</p>}</div><button type="button" onClick={disconnect}>Disconnect Messages</button></> : available === null ? null : <button type="button" disabled={!available || busy} onClick={pair}>{restoring ? "Restoring phone connection…" : busy ? "Creating pairing code…" : "Pair my iPhone"}</button>}
    {restoreBlocked && !pairing && <button type="button" onClick={disconnect}>Disconnect remembered phone</button>}
    <details><summary>How this connection works</summary><ol><li>Configure a BlueBubbles server on a Mac and one allowed iMessage sender. No bridge account is currently provided by Housemates.</li><li>Pair this browser with your phone using the code. The remembered pairing reconnects after refresh; keep a household tab open and visible for replies.</li><li>Just text normally. A new or restored session starts with Evie; follow-ups stay with the current teammate. To switch, try <code>Hey Bubbles, how are you?</code> or <code>Chill: hi</code>. Names are optional for ordinary messages. Replies use the same web conversation.</li><li>Review and approve proposals here. Sending “approve” in Messages never starts a task.</li></ol><p>Text travels through Apple, your Mac bridge and this app server. The mailbox is temporary; unprocessed requests expire after five minutes. A protected browser cookie remembers this phone for this household. Refreshing or restarting the app server can restore it automatically; a different household never attaches silently. Disconnect forgets the pairing. No replies are generated while the browser is closed or offline. Reopen the household and send a new request; old requests are not replayed. New website turns also sync while paired; earlier history is not replayed. No photos, attachments, group chats or automatic background execution.</p></details>
  </section>;
}
