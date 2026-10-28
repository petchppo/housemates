"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApplimonId } from "@/domain/applimon-catalog";
import { parseCharacterReply, type CharacterDialogueTurn } from "@/domain/character-dialogue";

type Status = "checking" | "configured" | "unconfigured";
type Conversation = { scope: string; reply: string | null; loading: boolean; notice: string; history: CharacterDialogueTurn[] };
const empty = (scope: string): Conversation => ({ scope, reply: null, loading: false, notice: "", history: [] });
const failures: Record<string, string> = {
  "public-ai-limit": "Today’s AI demo allowance is used up. Local planning still works.",
  "public-ai-burst-limit": "AI demo limit reached. Try later; local planning still works.",
  "public-ai-unavailable": "AI replies are temporarily unavailable. Local planning still works.",
  "provider-credit-balance": "AI dialogue needs available API credits. Showing the local planner reply.",
  "provider-spend-limit": "The API spending limit was reached. Showing the local planner reply.",
  "provider-usage-limit": "The API usage limit was reached. Showing the local planner reply.",
  "provider-quota": "The API quota is unavailable. Showing the local planner reply.",
  "provider-rate-limit": "AI dialogue is temporarily rate limited. Showing the local planner reply.",
  "provider-limit-unknown": "The API returned a limit error; check billing and limits. Showing the local planner reply.",
  "provider-authentication": "The API key was rejected. Showing the local planner reply.",
  "provider-access-denied": "The API denied access. Showing the local planner reply.",
  "provider-request-rejected": "The API rejected the request settings. Showing the local planner reply.",
  "provider-token-limit": "The AI reply did not finish within its output limit. Showing the local planner reply.",
  "provider-refused": "The AI declined this request. Showing the local planner reply.",
  "provider-timeout": "AI dialogue timed out. Showing the local planner reply.",
  "unsafe-character-reply": "The AI reply failed our fact and action checks. Showing the local planner reply.",
  "invalid-provider-response": "The AI reply could not be validated. Showing the local planner reply.",
};
const fallback = "AI dialogue is unavailable. Showing the local planner reply.";

/** Presentation-only conversation. No planner, approval, persistence or device callbacks. */
export function useCharacterDialogue(character: ApplimonId, contextKey: string, active = true) {
  const scope = `${character}:${contextKey}:${active ? "active" : "hidden"}`;
  const [status, setStatus] = useState<Status>("checking");
  const [conversation, setConversation] = useState<Conversation>(() => empty(scope));
  const alive = useRef(false);
  const currentScope = useRef(scope);
  const sequence = useRef(0);
  const history = useRef<CharacterDialogueTurn[]>([]);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    sequence.current++;
    controller.current?.abort(); controller.current = null;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const clear = useCallback(() => {
    cancel(); history.current = [];
    setConversation(empty(scope));
  }, [cancel, scope]);

  useEffect(() => {
    alive.current = true;
    const configController = new AbortController();
    const configTimer = setTimeout(() => { configController.abort(); if (alive.current) setStatus("unconfigured"); }, 5_000);
    void (async () => {
      try {
        const response = await fetch("/api/character-dialogue", { signal: configController.signal, cache: "no-store" });
        const body: unknown = await response.json();
        if (alive.current && !configController.signal.aborted) setStatus(response.ok && !!body && typeof body === "object" && "status" in body && body.status === "configured" ? "configured" : "unconfigured");
      } catch { if (alive.current && !configController.signal.aborted) setStatus("unconfigured"); }
      finally { clearTimeout(configTimer); }
    })();
    const hide = () => {
      if (!document.hidden) return;
      cancel();
      setConversation(value => value.loading ? { ...value, loading: false, reply: null, notice: "AI reply canceled while the page was hidden. The local planner reply is available." } : value);
    };
    document.addEventListener("visibilitychange", hide);
    return () => { alive.current = false; configController.abort(); clearTimeout(configTimer); cancel(); document.removeEventListener("visibilitychange", hide); };
  }, [cancel]);

  useEffect(() => {
    currentScope.current = scope;
    cancel(); history.current = [];
  }, [scope, cancel]);

  const request = useCallback(async (text: string, plannerReply: string) => {
    if (!alive.current || !active || document.hidden || !text.trim()) return;
    cancel();
    if (status !== "configured" || text.trim().length > 1200 || !plannerReply.trim() || plannerReply.length > 6000) {
      setConversation({ ...empty(scope), history: history.current, notice: status === "checking" ? "AI connection is being checked. Showing the local planner reply." : fallback });
      return;
    }
    const id = sequence.current;
    const abort = new AbortController(); controller.current = abort;
    const valid = () => alive.current && currentScope.current === scope && id === sequence.current && !abort.signal.aborted && !document.hidden;
    const previous = history.current;
    setConversation({ ...empty(scope), history: previous, loading: true });
    timer.current = setTimeout(() => {
      if (!valid()) return;
      cancel();
      setConversation({ ...empty(scope), history: previous, notice: failures["provider-timeout"] });
    }, 25_000);
    try {
      const response = await fetch("/api/character-dialogue", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ character, text: text.trim(), plannerReply, history: previous }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!valid()) return;
      if (!response.ok) {
        const code = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "";
        setConversation({ ...empty(scope), history: previous, notice: Object.prototype.hasOwnProperty.call(failures, code) ? failures[code] : fallback });
        return;
      }
      const reply = body && typeof body === "object" && Object.keys(body).sort().join(",") === "reply,source" && "source" in body && body.source === "openai" && "reply" in body ? parseCharacterReply(body.reply) : null;
      if (!reply) { setConversation({ ...empty(scope), history: previous, notice: failures["unsafe-character-reply"] }); return; }
      const next: CharacterDialogueTurn[] = [...previous, { role: "user", text: text.trim().slice(0, 600) }, { role: "assistant", text: reply }].slice(-6) as CharacterDialogueTurn[];
      history.current = next;
      setConversation({ scope, reply, loading: false, notice: "", history: next });
    } catch { if (valid()) setConversation({ ...empty(scope), history: previous, notice: fallback }); }
    finally {
      if (id === sequence.current) {
        controller.current = null;
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
      }
    }
  }, [active, cancel, character, scope, status]);

  // Reset state while rendering the new identity so an old character cannot flash back on screen.
  if (conversation.scope !== scope) setConversation(empty(scope));
  const visible = conversation.scope === scope ? conversation : empty(scope);
  return { status, reply: visible.reply, loading: visible.loading, notice: visible.notice, history: visible.history, request, clear };
}
