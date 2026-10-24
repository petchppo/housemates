import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { useApplianceVoice } from "../src/components/use-appliance-voice";

type Voice = ReturnType<typeof useApplianceVoice>;
type ResultEvent = { results: { isFinal: boolean; 0: { transcript: string } }[] };
function harness(options: { recognition?: boolean; speech?: boolean; prefixed?: boolean; startThrows?: boolean } = {}) {
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  const callbacks: { deps: unknown[]; value: unknown }[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  const pending: (() => void)[] = [];
  const listeners = new Map<string, () => void>();
  const timers = new Map<number, { fn: () => void; delay: number }>();
  const instances: Recognition[] = [], spoken: Utterance[] = [];
  const events: string[] = [];
  let stateIndex = 0, refIndex = 0, callbackIndex = 0, effectIndex = 0, timerId = 0, writes = 0;
  class Recognition {
    continuous = true; interimResults = false; lang = ""; maxAlternatives = 0;
    onstart: (() => void) | null = null; onend: (() => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onresult: ((event: ResultEvent) => void) | null = null;
    starts = 0; stops = 0; aborts = 0;
    constructor() { instances.push(this); }
    start() { this.starts++; events.push("recognition-start"); if (options.startThrows) throw new Error("NotAllowedError"); }
    stop() { this.stops++; events.push("recognition-stop"); }
    abort() { this.aborts++; events.push("recognition-abort"); }
  }
  class Utterance {
    onstart: (() => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null;
    lang = ""; rate = 1; pitch = 1; voice: unknown;
    constructor(public text: string) {}
  }
  const document = { hidden: false, addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) };
  const browser = {
    ...(options.recognition === false ? {} : options.prefixed ? { webkitSpeechRecognition: Recognition } : { SpeechRecognition: Recognition }),
    ...(options.speech === false ? {} : { SpeechSynthesisUtterance: Utterance, speechSynthesis: {
      cancel() { events.push("speech-cancel"); },
      speak(value: Utterance) { spoken.push(value); events.push("speech-start"); },
      getVoices: () => [{ lang: "en-US", name: "Remote", localService: false }, { lang: "en-US", name: "Local", localService: true }],
    } }),
  };
  const react = {
    useState(initial: unknown) { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; writes++; }]; },
    useRef(initial: unknown) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
    useCallback(value: unknown, deps: unknown[]) { const index = callbackIndex++, old = callbacks[index]; if (!old || deps.some((dep, i) => dep !== old.deps[i])) callbacks[index] = { deps, value }; return callbacks[index].value; },
    useEffect(effect: () => void | (() => void), deps: unknown[]) { const index = effectIndex++, old = effects[index]; if (!old || deps.some((dep, i) => dep !== old.deps[i])) pending.push(() => { old?.cleanup?.(); effects[index] = { deps, cleanup: effect() || undefined }; }); },
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => number) => snapshot(),
  };
  const testModule = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/use-appliance-voice.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: testModule, exports: testModule.exports, window: browser, document,
    setTimeout: (fn: () => void, delay: number) => { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
    require: (name: string) => { if (name === "react") return react; throw new Error(name); },
  });
  const hook = (testModule.exports as { useApplianceVoice: () => Voice }).useApplianceVoice;
  function render() { stateIndex = refIndex = callbackIndex = effectIndex = 0; const value = hook(); pending.splice(0).forEach(effect => effect()); return value; }
  function fireTimer(delay: number) { const timer = [...timers].find(([, value]) => value.delay === delay); assert.ok(timer, `Missing ${delay}ms timer`); timers.delete(timer[0]); timer[1].fn(); }
  return { render, instances, spoken, events, timers, document, listeners, fireTimer, writes: () => writes, unmount: () => effects.forEach(effect => effect.cleanup?.()) };
}
const result = (...parts: [string, boolean][]): ResultEvent => ({ results: parts.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })) });

test("voice is explicitly opt-in: starting a call opens no microphone, transcripts remain unsent drafts", () => {
  const h = harness(); let voice = h.render();
  assert.equal(voice.supportedRecognition, true); assert.equal(voice.supportedSpeech, true);
  voice.startListening(); voice.speak("No active call"); assert.equal(h.instances.length, 0); assert.equal(h.spoken.length, 0);
  voice.startCall("evie"); voice = h.render(); assert.equal(voice.callState, "ready"); assert.equal(h.instances.length, 0);
  voice.startListening(); const rec = h.instances[0]; voice = h.render();
  assert.equal(rec.starts, 1); assert.equal(rec.continuous, false); assert.equal(voice.requestingMicrophone, true); assert.equal(voice.callState, "ready");
  voice.startListening(); assert.equal(h.instances.length, 1, "A pending permission request cannot create a second listener");
  rec.onstart?.(); rec.onresult?.(result(["finish by seven", false])); voice = h.render();
  assert.equal(voice.callState, "listening"); assert.equal(voice.interimTranscript, "finish by seven"); assert.equal(voice.finalTranscript, "");
  rec.onresult?.(result(["Finish by seven.", true], ["Save money", false])); voice = h.render();
  assert.equal(voice.finalTranscript, "Finish by seven."); assert.equal(voice.interimTranscript, "Save money");
  rec.onend?.(); voice = h.render(); assert.equal(voice.callState, "ready"); assert.equal(voice.finalTranscript, "Finish by seven.");
  assert.equal(h.instances.length, 1, "Recognition must never auto-restart"); assert.equal(h.spoken.length, 0); assert.equal(h.timers.size, 0);
  h.unmount();
});

test("permission denial, service errors and synchronous startup failure keep a typed fallback with no retries", () => {
  for (const error of ["not-allowed", "service-not-allowed", "network", "audio-capture", "no-speech", "language-not-supported", "unknown"]) {
    const h = harness(); h.render().startCall("bubbles"); h.render().startListening(); const rec = h.instances[0]; const late = rec.onresult;
    rec.onerror?.({ error }); const voice = h.render(); assert.equal(voice.callState, "error"); assert.equal(voice.requestingMicrophone, false); assert.ok(voice.error?.includes("type"));
    late?.(result(["Injected late result", true])); assert.equal(h.render().finalTranscript, ""); assert.equal(h.instances.length, 1); assert.equal(h.timers.size, 0); h.unmount();
  }
  const h = harness({ startThrows: true }); h.render().startCall("chill"); h.render().startListening();
  assert.equal(h.render().callState, "error"); assert.equal(h.render().requestingMicrophone, false); assert.equal(h.timers.size, 0); h.unmount();
});

test("stopping allows a final transcript but late start/interim events cannot reopen the microphone UI", () => {
  const h = harness(); h.render().startCall("evie"); h.render().startListening(); const rec = h.instances[0]; const lateStart = rec.onstart;
  h.render().stopListening(); assert.equal(rec.stops, 1); lateStart?.(); assert.equal(h.render().callState, "ready");
  rec.onresult?.(result(["Charge overnight", true], ["late noise", false])); assert.equal(h.render().finalTranscript, "Charge overnight"); assert.equal(h.render().interimTranscript, "");
  const stale = rec.onresult; h.fireTimer(2000); stale?.(result(["Too late", true])); assert.equal(h.render().finalTranscript, "Charge overnight");
  h.render().clearTranscript(); assert.equal(h.render().finalTranscript, ""); h.unmount();
});

test("switching calls and hanging up invalidate delayed recognition callbacks and clear transcripts", () => {
  const h = harness(); h.render().startCall("evie"); h.render().startListening(); const rec = h.instances[0]; const late = rec.onresult, lateError = rec.onerror;
  rec.onresult?.(result(["Evie draft", true])); h.render().startCall("bubbles"); late?.(result(["Stale Evie draft", true])); lateError?.({ error: "network" });
  assert.equal(h.render().callAppliance, "bubbles"); assert.equal(h.render().callState, "ready"); assert.equal(h.render().finalTranscript, ""); assert.equal(rec.aborts, 1);
  h.render().startListening(); const second = h.instances[1], lateSecond = second.onresult; h.render().endCall(); lateSecond?.(result(["Stale Bubbles draft", true]));
  assert.equal(h.render().callState, "idle"); assert.equal(h.render().callAppliance, null); assert.equal(h.render().finalTranscript, ""); assert.equal(h.timers.size, 0); h.unmount();
});

test("spoken replies require opt-in, abort recognition first, and never automatically listen afterward", () => {
  const h = harness(); h.render().startCall("chill"); h.render().speak("Read this"); assert.equal(h.spoken.length, 0);
  h.render().setReadoutEnabled(true); h.render().startListening(); const rec = h.instances[0], stale = rec.onresult;
  h.render().speak("A calculated reply"); assert.equal(h.render().callState, "speaking"); assert.equal(rec.aborts, 1);
  assert.ok(h.events.indexOf("recognition-abort") < h.events.indexOf("speech-start"));
  assert.equal(h.spoken[0].text, "A calculated reply"); assert.equal((h.spoken[0].voice as { name: string }).name, "Local");
  stale?.(result(["Voice echo", true])); assert.equal(h.render().finalTranscript, "");
  const lateError = h.spoken[0].onerror; h.spoken[0].onend?.(); lateError?.(); assert.equal(h.render().callState, "ready"); assert.equal(h.instances.length, 1);
  h.render().speak("Second reply"); const delayed = h.spoken[1].onend; h.render().setReadoutEnabled(false); delayed?.();
  assert.equal(h.render().callState, "ready"); assert.equal(h.render().readoutEnabled, false); assert.ok(h.events.includes("speech-cancel")); assert.equal(h.timers.size, 0); h.unmount();
});

test("unsupported and prefixed browsers are detected without claiming a microphone has worked", () => {
  const h = harness({ recognition: false, speech: false }); let voice = h.render(); assert.equal(voice.supportedRecognition, false); assert.equal(voice.supportedSpeech, false);
  voice.startCall("evie"); voice = h.render(); assert.equal(voice.callState, "ready"); voice.startListening(); assert.match(h.render().error!, /unavailable/);
  h.render().setReadoutEnabled(true); h.render().speak("Readable fallback"); assert.match(h.render().error!, /readable/); assert.equal(h.instances.length, 0); h.unmount();
  const prefixed = harness({ prefixed: true }); assert.equal(prefixed.render().supportedRecognition, true); prefixed.render().startCall("bubbles"); prefixed.render().startListening(); assert.equal(prefixed.instances.length, 1); prefixed.unmount();
});

test("hidden pages, unmount and timeouts stop capture/playback and ignore stale asynchronous events", () => {
  const h = harness(); h.render().startCall("evie"); h.render().startListening(); const late = h.instances[0].onresult;
  h.document.hidden = true; h.listeners.get("visibilitychange")?.(); late?.(result(["Hidden page", true])); assert.equal(h.render().callState, "idle"); assert.equal(h.timers.size, 0);
  h.document.hidden = false; h.render().startCall("evie"); h.render().startListening(); h.fireTimer(45000); assert.match(h.render().error!, /timed out/); assert.equal(h.instances.length, 2);
  h.render().setReadoutEnabled(true); h.render().speak("Ending the call"); const lateSpeech = h.spoken[0].onend;
  const oldActions = h.render(); h.unmount(); const count = h.writes(); lateSpeech?.(); late?.(result(["Unmounted", true]));
  oldActions.startCall("bubbles"); oldActions.startListening(); oldActions.speak("Stale caller after unmount");
  assert.equal(h.instances.length, 2); assert.equal(h.spoken.length, 1); assert.equal(h.writes(), count); assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0); assert.ok(h.events.includes("speech-cancel"));
});
