"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseDialogueSuggestion, type DialogueSuggestion } from "@/domain/dialogue-contract";

type Reply = { context: string; suggestion: DialogueSuggestion | null; message: string; loading: boolean };
const empty = (context: string): Reply => ({ context, suggestion: null, message: "", loading: false });
const failureMessages: Record<string, string> = {
  unconfigured: "Optional AI is unconfigured or unavailable. Use the local planner; no model reply was generated.",
  "provider-authentication": "The AI provider rejected the API credentials. Check the server API key.",
  "provider-access-denied": "The AI provider denied access. Check the API key and project permissions.",
  "provider-quota": "The API project has insufficient quota. Check its billing and usage limits.",
  "provider-credit-balance": "The API organization has no prepaid credits remaining. Check API billing.",
  "provider-spend-limit": "An API project or organization spending limit was reached. Check its configured limits.",
  "provider-usage-limit": "The API organization reached its usage limit. Check its approved API allowance.",
  "provider-limit-unknown": "The API provider returned a limit error. Check API billing, usage and rate limits before retrying.",
  "provider-rate-limit": "The AI provider rate limit was reached. Wait before trying again.",
  "provider-request-rejected": "The AI provider rejected the model or request settings. Check the server configuration.",
  "provider-token-limit": "The model reached its output limit before completing a suggestion. No proposal was created.",
  "provider-refused": "The AI provider declined this request. Use the local planner or revise your request.",
  "provider-timeout": "The AI provider timed out. The local planner is still available.",
  "provider-unavailable": "The AI provider could not be reached or is unavailable. The local planner is still available.",
  "invalid-provider-response": "The model reply failed the suggestion checks. Your schedule has not changed.",
  "assistant-busy": "The optional assistant is busy. Wait before trying again.",
  "same-origin-required": "The assistant rejected this page's origin. Reopen the demo using the server's address.",
};

/** Optional interpretation only. This hook never receives a planner or approval callback. */
export function useJudgeDialogue(context: string) {
  const [reply, setReply] = useState<Reply>(() => empty(context));
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(false);
  const cancel = useCallback(() => {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const clear = useCallback(() => { cancel(); setReply(empty(context)); }, [cancel, context]);

  useEffect(() => {
    alive.current = true;
    const hide = () => { if (document.hidden) { cancel(); setReply(empty(context)); } };
    document.addEventListener("visibilitychange", hide);
    return () => { alive.current = false; cancel(); document.removeEventListener("visibilitychange", hide); };
  }, [cancel, context]);

  const request = useCallback(async (text: string) => {
    if (!alive.current || document.hidden || !text.trim()) return;
    cancel();
    const id = sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    const valid = () => alive.current && sequence.current === id && !abort.signal.aborted && !document.hidden;
    setReply({ ...empty(context), loading: true });
    timer.current = setTimeout(() => {
      if (!valid()) return;
      cancel();
      setReply({ ...empty(context), message: "The AI request timed out. The local planner is still available." });
    }, 25_000);
    try {
      const response = await fetch("/api/dialogue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }), signal: abort.signal,
      });
      if (!valid()) return;
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        if (!valid()) return;
        const code = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "";
        const message = Object.prototype.hasOwnProperty.call(failureMessages, code) ? failureMessages[code]
          : response.status === 503 ? failureMessages.unconfigured
          : "The optional assistant request failed. The local planner is still available.";
        setReply({ ...empty(context), message });
        return;
      }
      const body: unknown = await response.json();
      if (!valid()) return;
      const source = body && typeof body === "object" && "source" in body ? body.source : null;
      const parsed = body && typeof body === "object" && "suggestion" in body
        ? parseDialogueSuggestion(body.suggestion) : null;
      const suggestion = source === "openai" || source === "ollama" || (source === "local-guard" && parsed?.kind === "clarify") ? parsed : null;
      setReply({ context, loading: false, suggestion, message: suggestion
        ? source === "local-guard" ? "Local rule clarification; no model was called. Your schedule has not changed."
          : `${source === "openai" ? "OpenAI" : "Local model"} suggestion: review this interpretation before creating a proposal. Your schedule has not changed.`
        : "The reply did not match the allowed suggestion format. Your schedule has not changed." });
    } catch {
      if (valid()) setReply({ ...empty(context), message: "The AI request stopped or timed out. The local planner is still available." });
    } finally {
      if (sequence.current === id) {
        controller.current = null;
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
      }
    }
  }, [cancel, context]);

  return { ...(reply.context === context ? reply : empty(context)), request, clear };
}
