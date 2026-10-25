"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ApplianceId } from "@/domain/appliances";
import { parseCharacterReply, type CharacterDialogueTurn } from "@/domain/character-dialogue";
import { casualFallback } from "@/domain/casual-dialogue";
import type { MessageConversationReply, MessageSyncTurn } from "@/domain/message-conversation";

export type SharedConversationView = {
  status: "checking" | "configured" | "unconfigured";
  reply: string | null;
  source: "openai" | "local" | null;
  loading: boolean;
  notice: string;
  history: Array<{ role: "user" | "assistant"; text: string; source?: "openai" | "local"; origin?: "web" | "imessage" }>;
};
export type HouseholdConversationOptions = { origin: "web" | "imessage"; signal?: AbortSignal; messageId?: string; source?: "text" | "voice" };
type CharacterView = Omit<SharedConversationView, "status">;
type Planner = (id: ApplianceId, text: string, source: "text" | "voice") => string | void;
type Job = {
  id: string; character: ApplianceId; text: string; origin: "web" | "imessage"; source: "text" | "voice";
  context: string; generation: number; abort: AbortController; settled: boolean;
  resolve: (reply: MessageConversationReply | undefined) => void; detach: () => void;
};
const fresh = (): CharacterView => ({ reply: null, source: null, loading: false, notice: "", history: [] });
const freshViews = (): Record<ApplianceId, CharacterView> => ({ evie: fresh(), bubbles: fresh(), chill: fresh() });
const fallback = "AI dialogue is unavailable. Showing a local reply.";
const failures: Record<string, string> = {
  "provider-credit-balance": "AI dialogue needs available API credits. Showing a local reply.",
  "provider-spend-limit": "The API spending limit was reached. Showing a local reply.",
  "provider-usage-limit": "The API usage limit was reached. Showing a local reply.",
  "provider-quota": "The API quota is unavailable. Showing a local reply.",
  "provider-rate-limit": "AI dialogue is temporarily rate limited. Showing a local reply.",
  "provider-limit-unknown": "The API returned a limit error. Showing a local reply.",
  "provider-authentication": "The API key was rejected. Showing a local reply.",
  "provider-access-denied": "The API denied access. Showing a local reply.",
  "provider-request-rejected": "The API rejected the request settings. Showing a local reply.",
  "provider-token-limit": "The AI reply did not finish within its output limit. Showing a local reply.",
  "provider-refused": "The AI declined this request. Showing a local reply.",
  "provider-timeout": "AI dialogue timed out. Showing a local reply.",
  "unsafe-character-reply": "The AI reply failed our fact and action checks. Showing a local reply.",
  "invalid-provider-response": "The AI reply could not be validated. Showing a local reply.",
};
const safeText = (value: unknown, limit: number): value is string => typeof value === "string" && !!value.trim() && value.length <= limit && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
const isCharacter = (id: unknown): id is ApplianceId => id === "evie" || id === "bubbles" || id === "chill";
let nextControllerId = 0;

/** One ephemeral conversation queue owns both transports. The model never invokes the planner. */
export function useHouseholdConversation(contextKey: string, onPlannerSend: Planner) {
  const [instance] = useState(() => ++nextControllerId);
  const [status, setStatus] = useState<SharedConversationView["status"]>("checking");
  const [snapshot, setSnapshot] = useState(() => ({ context: contextKey, views: freshViews(), outbound: [] as MessageSyncTurn[] }));
  const planner = useRef(onPlannerSend);
  const runtime = useRef({ alive: false, context: contextKey, generation: 0, sequence: 0, status: "checking" as SharedConversationView["status"],
    queue: [] as Job[], running: null as Job | null, views: freshViews(), outbound: [] as MessageSyncTurn[],
    seen: new Map<string, { character: ApplianceId; text: string; source: string; promise: Promise<MessageConversationReply | undefined> }>(),
  });
  useLayoutEffect(() => { planner.current = onPlannerSend; }, [onPlannerSend]);

  const publish = useCallback(() => {
    const state = runtime.current;
    if (state.alive) setSnapshot({ context: state.context, views: { ...state.views }, outbound: [...state.outbound] });
  }, []);
  const settle = useCallback((job: Job, value?: MessageConversationReply) => {
    if (job.settled) return;
    job.settled = true; job.detach(); job.resolve(value);
  }, []);
  const cancel = useCallback((clear: boolean) => {
    const state = runtime.current;
    state.generation++;
    const jobs = [...state.queue, ...(state.running ? [state.running] : [])];
    state.queue = [];
    for (const job of jobs) { job.abort.abort(); settle(job); }
    if (clear) { state.views = freshViews(); state.outbound = []; state.seen.clear(); }
    else {
      for (const id of ["evie", "bubbles", "chill"] as const) {
        const view = state.views[id];
        if (view.loading) state.views[id] = { ...view, loading: false, history: view.history.at(-1)?.role === "user" ? view.history.slice(0, -1) : view.history, notice: "Pending reply canceled. Send again when ready." };
      }
    }
    publish();
  }, [publish, settle]);
  const invalidate = useCallback(() => cancel(true), [cancel]);

  useLayoutEffect(() => {
    const state = runtime.current; state.alive = true;
    return () => { state.alive = false; cancel(true); };
  }, [cancel]);
  useEffect(() => {
    const state = runtime.current;
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); if (state.alive) { state.status = "unconfigured"; setStatus("unconfigured"); } }, 5_000);
    void (async () => {
      try {
        const response = await fetch("/api/character-dialogue", { signal: controller.signal, cache: "no-store" });
        const body: unknown = await response.json();
        if (!state.alive || controller.signal.aborted) return;
        state.status = response.ok && !!body && typeof body === "object" && "status" in body && body.status === "configured" ? "configured" : "unconfigured";
        setStatus(state.status);
      } catch { if (state.alive && !controller.signal.aborted) { state.status = "unconfigured"; setStatus("unconfigured"); } }
      finally { clearTimeout(timer); }
    })();
    const hide = () => { if (document.hidden) cancel(false); };
    document.addEventListener("visibilitychange", hide);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", hide); };
  }, [cancel]);
  // Invalidate during commit, before passive effects or a saved event handler can run.
  useLayoutEffect(() => {
    const state = runtime.current;
    if (state.context !== contextKey) { state.context = contextKey; cancel(true); }
  }, [contextKey, cancel]);

  const pump = useCallback(async () => {
    const state = runtime.current;
    if (state.running) return;
    while (state.queue.length) {
      const job = state.queue.shift()!; state.running = job;
      const valid = () => state.alive && !document.hidden && state.context === job.context && state.generation === job.generation && !job.abort.signal.aborted;
      const previous = state.views[job.character];
      let timer: ReturnType<typeof setTimeout> | undefined;
      let removeAbort = () => {};
      try {
        if (!valid()) { settle(job); continue; }
        let local: string | void;
        try { local = planner.current(job.character, job.text, job.source); }
        catch { local = undefined; }
        if (!valid()) { settle(job); continue; }
        const usable = safeText(local, 5000);
        const localText = safeText(local, 5000) ? local : "Review the household planner in the web app for this request. A shareable planner reply is unavailable.";
        let reply: MessageConversationReply = { text: casualFallback(job.character, job.text) ?? localText, source: "local", notice: state.status === "checking" ? "AI connection is being checked. Showing a local reply." : fallback };
        state.views[job.character] = { ...previous, reply: null, source: null, loading: true, notice: "", history: [...previous.history, { role: "user" as const, text: job.text, origin: job.origin }].slice(-30) };
        publish();
        if (usable && state.status === "configured") {
          const history: CharacterDialogueTurn[] = previous.history.slice(-6).map(turn => ({ role: turn.role, text: turn.text.slice(0, 600) }));
          const aborted = new Promise<never>((_, reject) => {
            const abort = () => reject(new Error("canceled"));
            job.abort.signal.addEventListener("abort", abort, { once: true });
            removeAbort = () => job.abort.signal.removeEventListener("abort", abort);
          });
          const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 25_000); });
          try {
            const result = await Promise.race([
              (async () => {
                const response = await fetch("/api/character-dialogue", { method: "POST", headers: { "Content-Type": "application/json" }, signal: job.abort.signal,
                  body: JSON.stringify({ character: job.character, text: job.text, plannerReply: localText, history }) });
                const body: unknown = await response.json().catch(() => null);
                return { response, body };
              })(), aborted, timeout,
            ]);
            if (!valid()) { settle(job); continue; }
            const { body, response } = result;
            const generated = response.ok && body && typeof body === "object" && Object.keys(body).sort().join(",") === "reply,source" && "source" in body && body.source === "openai" && "reply" in body ? parseCharacterReply(body.reply) : null;
            if (generated) reply = { text: generated, source: "openai" };
            else {
              const code = !response.ok && body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "unsafe-character-reply";
              reply.notice = Object.prototype.hasOwnProperty.call(failures, code) ? failures[code] : fallback;
            }
          } catch (error) {
            if (!valid()) { settle(job); continue; }
            reply.notice = error instanceof Error && error.message === "timeout" ? failures["provider-timeout"] : fallback;
            // Stop the timed-out transport, but still complete this valid turn with its exact local reply.
            if (error instanceof Error && error.message === "timeout") { removeAbort(); job.abort.abort(); }
          }
        } else if (!usable) reply.notice = "A shareable local planner reply is unavailable. No AI request was made.";
        if (!state.alive || document.hidden || state.context !== job.context || state.generation !== job.generation || job.settled) { settle(job); continue; }
        const history: SharedConversationView["history"] = [...previous.history, { role: "user", text: job.text, origin: job.origin }, { role: "assistant", text: reply.text, source: reply.source, origin: job.origin }].slice(-30) as SharedConversationView["history"];
        state.views[job.character] = { reply: reply.text, source: reply.source, loading: false, notice: reply.notice ?? "", history };
        state.outbound = [...state.outbound, { id: job.id, applianceId: job.character, userText: job.text, reply, origin: job.origin }].slice(-60);
        publish(); settle(job, reply);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        removeAbort();
        if (!job.settled) settle(job);
        if (job.abort.signal.aborted && state.alive && state.context === job.context && state.generation === job.generation && state.views[job.character].loading) {
          state.views[job.character] = previous; publish();
        }
        state.running = null;
      }
    }
  }, [publish, settle]);

  const dispatch = useCallback((id: ApplianceId, text: string, options: HouseholdConversationOptions): Promise<MessageConversationReply | undefined> => {
    const state = runtime.current;
    if (!state.alive || document.hidden || state.context !== contextKey || !isCharacter(id) || !safeText(text, 1200) || !options ||
      (options.origin !== "web" && options.origin !== "imessage") || (options.source !== undefined && options.source !== "text" && options.source !== "voice") ||
      (options.messageId !== undefined && (typeof options.messageId !== "string" || !/^[\w-]{1,128}$/.test(options.messageId))) ||
      (options.signal !== undefined && (!options.signal || typeof options.signal.aborted !== "boolean" || typeof options.signal.addEventListener !== "function" || typeof options.signal.removeEventListener !== "function")) || options.signal?.aborted) return Promise.resolve(undefined);
    const clean = text.trim(), source = options.source ?? "text", key = options.messageId ? `${options.origin}:${options.messageId}` : null;
    const seen = key ? state.seen.get(key) : null;
    if (seen) {
      if (seen.character !== id || seen.text !== clean || seen.source !== source) return Promise.resolve(undefined);
      const signal = options.signal;
      if (!signal) return seen.promise;
      // A duplicate subscriber has its own deadline; it must not cancel the original owner.
      return new Promise(resolve => {
        const abort = () => { signal.removeEventListener("abort", abort); resolve(undefined); };
        signal.addEventListener("abort", abort, { once: true });
        void seen.promise.then(reply => { signal.removeEventListener("abort", abort); resolve(signal.aborted ? undefined : reply); });
      });
    }
    if (state.queue.length + (state.running ? 1 : 0) >= 16) {
      state.views[id] = { ...state.views[id], notice: "The conversation queue is full. Please send your message again after a reply arrives." };
      publish(); return Promise.resolve(undefined);
    }
    let resolve!: Job["resolve"];
    const promise = new Promise<MessageConversationReply | undefined>(done => { resolve = done; });
    const job: Job = { id: `${options.origin}-${instance}-${++state.sequence}`, character: id, text: clean, origin: options.origin, source, context: contextKey, generation: state.generation,
      abort: new AbortController(), settled: false, resolve, detach: () => {} };
    if (options.signal) {
      const abort = () => { job.abort.abort(); settle(job); if (state.running !== job) state.queue = state.queue.filter(queued => queued !== job); };
      options.signal.addEventListener("abort", abort, { once: true });
      job.detach = () => options.signal?.removeEventListener("abort", abort);
    }
    if (key) { state.seen.set(key, { character: id, text: clean, source, promise }); while (state.seen.size > 120) state.seen.delete(state.seen.keys().next().value!); }
    state.queue.push(job); void pump(); return promise;
  }, [contextKey, instance, publish, pump, settle]);
  const forCharacter = useCallback((id: ApplianceId): SharedConversationView => ({ status, ...(snapshot.context === contextKey && isCharacter(id) ? snapshot.views[id] : fresh()) }), [contextKey, snapshot, status]);
  return { forCharacter, dispatch, outboundTurns: snapshot.context === contextKey ? snapshot.outbound : [], invalidate };
}
