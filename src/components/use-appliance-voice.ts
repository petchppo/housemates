"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ApplianceId } from "@/domain/appliances";

export type ApplianceCallState = "idle" | "ready" | "listening" | "speaking" | "error";
type RecognitionResult = { isFinal: boolean; 0?: { transcript?: string } };
type RecognitionEvent = { results: { length: number; [index: number]: RecognitionResult } };
type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string; maxAlternatives: number;
  onstart: (() => void) | null; onend: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
};
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition; SpeechSynthesisUtterance?: new (text: string) => SpeechSynthesisUtterance };
type VoiceSnapshot = {
  callAppliance: ApplianceId | null; callState: ApplianceCallState; requestingMicrophone: boolean;
  interimTranscript: string; finalTranscript: string; error: string | null; readoutEnabled: boolean;
};
const initialState: VoiceSnapshot = { callAppliance: null, callState: "idle", requestingMicrophone: false, interimTranscript: "", finalTranscript: "", error: null, readoutEnabled: false };
const TRANSCRIPT_LIMIT = 2000;
const SESSION_TIMEOUT_MS = 45_000;
const subscribeCapabilities = () => () => {};
function capabilities() {
  if (typeof window === "undefined") return 0;
  const browser = window as VoiceWindow;
  return (typeof (browser.SpeechRecognition ?? browser.webkitSpeechRecognition) === "function" ? 1 : 0)
    | (browser.speechSynthesis && typeof browser.SpeechSynthesisUtterance === "function" ? 2 : 0);
}
const serverCapabilities = () => 0;
function recognitionError(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return "Microphone or speech recognition permission was denied. You can type instead, or change this site’s browser permission and try Listen again.";
  if (code === "audio-capture") return "No microphone is available. Check your device or type your message instead.";
  if (code === "network") return "The browser’s recognition service could not connect. Try again when connected, or type instead.";
  if (code === "no-speech") return "No speech was heard. Choose Listen to try again, or type instead.";
  if (code === "language-not-supported") return "This browser cannot recognize the selected language. Please type your message instead.";
  return "Browser speech recognition stopped. You can try Listen again or type instead.";
}

/** Browser voice is an optional transport. It never submits text, changes a plan, or starts a microphone automatically.
 * Some recognition engines send audio to their provider: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
 */
export function useApplianceVoice() {
  const capability = useSyncExternalStore(subscribeCapabilities, capabilities, serverCapabilities);
  const [state, setState] = useState<VoiceSnapshot>(initialState);
  const latest = useRef(initialState);
  const live = useRef(true);
  const generation = useRef(0);
  const recognition = useRef<Recognition | null>(null);
  const recognitionStopping = useRef(false);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emit = useCallback((patch: Partial<VoiceSnapshot>) => {
    if (!live.current) return;
    latest.current = { ...latest.current, ...patch };
    setState(latest.current);
  }, []);
  const clearTimer = useCallback(() => {
    if (timeout.current !== null) clearTimeout(timeout.current);
    timeout.current = null;
  }, []);
  const cancelMedia = useCallback(() => {
    generation.current++;
    clearTimer();
    const current = recognition.current;
    recognition.current = null;
    if (current) {
      current.onstart = current.onend = current.onresult = current.onerror = null;
      try { current.abort(); } catch { /* An already-ended browser session is safe to discard. */ }
    }
    const spoken = utterance.current;
    utterance.current = null;
    if (spoken) {
      spoken.onstart = spoken.onend = spoken.onerror = null;
      try { window.speechSynthesis?.cancel(); } catch { /* Typed interaction remains available. */ }
    }
  }, [clearTimer]);
  const endCall = useCallback(() => {
    cancelMedia();
    emit({ callAppliance: null, callState: "idle", requestingMicrophone: false, interimTranscript: "", finalTranscript: "", error: null });
  }, [cancelMedia, emit]);
  useEffect(() => {
    live.current = true;
    const hide = () => { if (document.hidden) endCall(); };
    document.addEventListener("visibilitychange", hide);
    return () => { live.current = false; cancelMedia(); document.removeEventListener("visibilitychange", hide); };
  }, [cancelMedia, endCall]);
  const startCall = useCallback((id: ApplianceId) => {
    if (!live.current || !["evie", "bubbles", "chill"].includes(id) || document.hidden) return;
    cancelMedia();
    emit({ callAppliance: id, callState: "ready", requestingMicrophone: false, interimTranscript: "", finalTranscript: "", error: null });
  }, [cancelMedia, emit]);
  const clearTranscript = useCallback(() => {
    cancelMedia();
    emit({ finalTranscript: "", interimTranscript: "", requestingMicrophone: false, callState: latest.current.callAppliance ? "ready" : "idle", error: null });
  }, [cancelMedia, emit]);
  const startListening = useCallback(() => {
    if (!live.current || !latest.current.callAppliance || document.hidden || recognition.current) return;
    cancelMedia();
    const browser = window as VoiceWindow;
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) { emit({ callState: "error", error: "Speech recognition is unavailable in this browser. You can type your message instead." }); return; }
    const token = generation.current;
    const valid = () => live.current && token === generation.current && latest.current.callAppliance !== null;
    try {
      const current = new Constructor();
      recognition.current = current;
      recognitionStopping.current = false;
      current.continuous = false; current.interimResults = true; current.maxAlternatives = 1; current.lang = "en-US";
      emit({ callState: "ready", requestingMicrophone: true, finalTranscript: "", interimTranscript: "", error: null });
      current.onstart = () => { if (valid() && !recognitionStopping.current) emit({ callState: "listening", requestingMicrophone: false }); };
      current.onresult = event => {
        if (!valid()) return;
        let final = "", interim = "";
        const count = Math.min(64, Number.isFinite(event.results?.length) ? event.results.length : 0);
        for (let index = 0; index < count; index++) {
          const result = event.results[index], text = result?.[0]?.transcript;
          if (typeof text !== "string") continue;
          if (result.isFinal) final = `${final} ${text.slice(0, TRANSCRIPT_LIMIT)}`.slice(0, TRANSCRIPT_LIMIT);
          else interim = `${interim} ${text.slice(0, TRANSCRIPT_LIMIT)}`.slice(0, TRANSCRIPT_LIMIT);
        }
        emit({ finalTranscript: final.trim(), interimTranscript: recognitionStopping.current ? "" : interim.trim() });
      };
      current.onerror = event => {
        if (!valid()) return;
        cancelMedia(); emit({ callState: "error", requestingMicrophone: false, interimTranscript: "", error: recognitionError(event.error) });
      };
      current.onend = () => {
        if (!valid()) return;
        cancelMedia(); emit({ callState: "ready", requestingMicrophone: false, interimTranscript: "" });
      };
      timeout.current = setTimeout(() => {
        if (!valid()) return;
        cancelMedia(); emit({ callState: "error", requestingMicrophone: false, interimTranscript: "", error: "Listening timed out. Review any transcript, then choose Listen again or type instead." });
      }, SESSION_TIMEOUT_MS);
      current.start();
    } catch {
      cancelMedia(); emit({ callState: "error", requestingMicrophone: false, error: "This browser could not start speech recognition. Check microphone permissions or type instead." });
    }
  }, [cancelMedia, emit]);
  const stopListening = useCallback(() => {
    const current = recognition.current;
    if (!current) return;
    recognitionStopping.current = true;
    // stop() permits a final result; abort/endCall invalidate pending callbacks instead.
    try {
      current.stop();
      emit({ callState: "ready", requestingMicrophone: false, interimTranscript: "" });
      clearTimer();
      const token = generation.current;
      timeout.current = setTimeout(() => {
        if (!live.current || token !== generation.current) return;
        cancelMedia(); emit({ callState: "ready", requestingMicrophone: false, interimTranscript: "" });
      }, 2000);
    } catch { cancelMedia(); emit({ callState: "ready", requestingMicrophone: false, interimTranscript: "" }); }
  }, [cancelMedia, clearTimer, emit]);
  const speak = useCallback((text: string) => {
    if (!live.current || !latest.current.callAppliance || !latest.current.readoutEnabled || document.hidden || typeof text !== "string" || !text.trim()) return;
    cancelMedia(); // Recognition must be off before playback to avoid transcribing the appliance.
    const browser = window as VoiceWindow;
    if (!browser.speechSynthesis || !browser.SpeechSynthesisUtterance) { emit({ callState: "error", requestingMicrophone: false, error: "Spoken replies are unavailable here. The reply is still readable on screen." }); return; }
    const token = generation.current;
    const valid = () => live.current && token === generation.current && latest.current.callAppliance !== null;
    try {
      const spoken = new browser.SpeechSynthesisUtterance(text.trim().slice(0, TRANSCRIPT_LIMIT));
      utterance.current = spoken;
      spoken.lang = "en-US";
      const id = latest.current.callAppliance;
      spoken.rate = id === "chill" ? 0.92 : id === "evie" ? 1.06 : 1;
      spoken.pitch = id === "bubbles" ? 1.15 : id === "chill" ? 0.9 : 1.05;
      const voices = browser.speechSynthesis.getVoices().filter(voice => /^en(?:-|$)/i.test(voice.lang)).sort((a, b) => Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name));
      if (voices.length) spoken.voice = voices[0];
      spoken.onend = () => { if (valid()) { clearTimer(); generation.current++; spoken.onend = spoken.onerror = null; utterance.current = null; emit({ callState: "ready" }); } };
      spoken.onerror = () => { if (valid()) { cancelMedia(); emit({ callState: "error", error: "The browser could not read this reply aloud. You can read it on screen." }); } };
      emit({ callState: "speaking", requestingMicrophone: false, interimTranscript: "", error: null });
      timeout.current = setTimeout(() => { if (valid()) { cancelMedia(); emit({ callState: "ready" }); } }, SESSION_TIMEOUT_MS);
      browser.speechSynthesis.speak(spoken);
    } catch { cancelMedia(); emit({ callState: "error", requestingMicrophone: false, error: "The browser could not read this reply aloud. You can read it on screen." }); }
  }, [cancelMedia, clearTimer, emit]);
  const setReadoutEnabled = useCallback((enabled: boolean) => {
    if (typeof enabled !== "boolean") return;
    if (!enabled && utterance.current) { cancelMedia(); emit({ callState: latest.current.callAppliance ? "ready" : "idle" }); }
    emit({ readoutEnabled: enabled });
  }, [cancelMedia, emit]);
  return { ...state, supportedRecognition: Boolean(capability & 1), supportedSpeech: Boolean(capability & 2), startCall, endCall, startListening, stopListening, speak, clearTranscript, setReadoutEnabled };
}
