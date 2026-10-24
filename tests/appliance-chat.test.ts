import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as demo from "../src/domain/demo";
import type { SharedConversationView } from "../src/components/use-household-conversation";
import type { ApplianceId } from "../src/domain/appliances";

type Element = { type: unknown; props: Record<string, unknown> };
type Message = { id: string; role: "user" | "housemates" | ApplianceId; source: "text" | "voice" | "system"; text: string };
const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/appliance-chat.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jsx = (type: unknown, props: Element["props"]): Element => typeof type === "function" ? type(props) : { type, props };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  return node && typeof node === "object" && "props" in node ? text((node as Element).props.children) : "";
}

/** Real JSX, effects and event closures; browser media is replaced with the already
 * separately tested voice-hook contract so transport cannot silently submit work. */
function chat(presentation: "panel" | "dock" = "panel") {
  const sent: { text: string; source: string }[] = [], approved: string[] = [], spoken: string[] = [];
  const states: unknown[] = [], refs: { current: unknown }[] = [], dependencies: unknown[][] = [];
  const effects: (() => void)[] = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0, dirty = false, tree: Element;
  let hangs = 0, listens = 0;
  let localReply: string | undefined;
  let aiClears = 0;
  const aiCalls: { character: string; text: string; plannerReply: string }[] = [];
  let aiCharacter = "evie";
  const ai = { status: "unconfigured", reply: null as string | null, loading: false, notice: "", history: [] as { role: string; text: string }[],
    async request(value: string, plannerReply: string) { aiCalls.push({ character: aiCharacter, text: value, plannerReply }); ai.loading = true; dirty = true; },
    clear() { aiClears++; ai.reply = null; ai.loading = false; ai.history = []; dirty = true; },
  };
  const voice = {
    supportedRecognition: true, supportedSpeech: true, callAppliance: null as ApplianceId | null,
    callState: "idle", requestingMicrophone: false, finalTranscript: "", interimTranscript: "", error: null as string | null,
    readoutEnabled: false,
    setReadoutEnabled(value: boolean) { voice.readoutEnabled = value; dirty = true; },
    startCall(id: ApplianceId) { voice.callAppliance = id; voice.callState = "ready"; voice.finalTranscript = ""; dirty = true; },
    endCall() { hangs++; voice.callAppliance = null; voice.callState = "idle"; voice.finalTranscript = ""; dirty = true; },
    startListening() { listens++; voice.callState = "listening"; dirty = true; },
    stopListening() { voice.callState = "ready"; dirty = true; },
    speak(value: string) { spoken.push(value); },
    clearTranscript() { voice.finalTranscript = ""; dirty = true; },
  };
  const props = {
    conversation: undefined as SharedConversationView | undefined,
    presentation, applianceIds: ["evie", "bubbles", "chill"] as ApplianceId[], selected: "evie" as ApplianceId,
    onSelect(id: ApplianceId) { props.selected = id; dirty = true; }, messages: [] as Message[],
    onSend(value: string, source: string) { sent.push({ text: value, source }); if (localReply !== undefined) { props.messages.push({ id: `reply-${sent.length}`, role: props.selected, source: "text", text: localReply }); dirty = true; } return localReply; },
    proposal: null as Record<string, unknown> | null, onApprove(id: string) { approved.push(id); }, onReject() {}, locked: false, executionStatus: "idle",
  };
  const react = {
    useState(initial: unknown) { const index = stateIndex++; if (!(index in states)) states[index] = initial;
      return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; dirty = true; }]; },
    useRef(initial: unknown) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
    useEffect(effect: () => void, deps: unknown[]) { const index = effectIndex++, before = dependencies[index];
      if (!before || deps.some((value, i) => value !== before[i])) { dependencies[index] = deps; effects.push(effect); } },
  };
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source, { module: testModule, exports: testModule.exports, requestAnimationFrame: (callback: () => void) => callback(),
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "@/domain/demo") return demo;
      if (name === "./use-character-dialogue") return { useCharacterDialogue: (character: string) => { aiCharacter = character; return ai; } };
      if (name === "./use-appliance-voice") return { useApplianceVoice: () => ({ ...voice }) };
      if (name === "./pixel-appliance") return { PixelAppliance: () => jsx("svg", {}) };
      if (name.endsWith(".css")) return {};
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const component = (testModule.exports as { ApplianceChat: (props: unknown) => Element }).ApplianceChat;
  function render(flush = true) {
    stateIndex = refIndex = effectIndex = 0; dirty = false; tree = component(props);
    if (flush) settle();
  }
  function settle() {
    for (let i = 0; i < 15; i++) { effects.splice(0).forEach(effect => effect()); if (!dirty) return; render(false); }
    throw new Error("UI failed to settle");
  }
  function find(predicate: (node: Element) => boolean) { const found = elements(tree).find(predicate); assert.ok(found, "Expected UI control"); return found; }
  function button(label: string) { return find(node => node.type === "button" && text(node).includes(label)); }
  function click(control: Element) { assert.notEqual(control.props.disabled, true); (control.props.onClick as () => void)(); settle(); }
  render();
  return { props, voice, ai, aiCalls, get aiClears() { return aiClears; }, setLocalReply(value: string) { localReply = value; }, sent, approved, spoken, render, settle, find, button, click, get hangs() { return hangs; }, get listens() { return listens; }, get tree() { return tree; } };
}

test("opening a call never starts capture; recognition requires reviewed explicit send and cannot approve", () => {
  const ui = chat(); ui.click(ui.button("Open voice call"));
  assert.equal(ui.listens, 0); assert.equal(ui.sent.length, 0);
  assert.match(text(ui.tree), /may send audio or reply text/);
  ui.click(ui.button("Listen"));
  ui.voice.finalTranscript = "Approve this plan"; ui.render();
  assert.equal(ui.button("Send reviewed transcript").props.disabled, true);
  assert.equal(ui.sent.length, 0); assert.equal(ui.approved.length, 0);
  ui.click(ui.button("Stop"));
  assert.equal(ui.sent.length, 0);
  const field = ui.find(node => node.props.id === "apc-transcript");
  (field.props.onChange as (event: unknown) => void)({ target: { value: "Evie by 7 AM" } }); ui.settle();
  ui.click(ui.button("Send reviewed transcript"));
  assert.deepEqual(ui.sent, [{ text: "Evie by 7 AM", source: "voice" }]);
  assert.equal(ui.approved.length, 0);
  assert.equal(ui.button("Send reviewed transcript").props.disabled, true);
});

test("scene selection changes cannot send an old call transcript to a different appliance", () => {
  const ui = chat(); ui.click(ui.button("Open voice call"));
  ui.voice.finalTranscript = "Ready by 7 AM"; ui.render();
  ui.props.selected = "bubbles"; ui.render(false);
  // Exercise the event before the hangup effect runs: target validation must be synchronous.
  (ui.button("Send reviewed transcript").props.onClick as () => void)();
  assert.equal(ui.sent.length, 0); ui.settle();
  assert.equal(ui.hangs, 1); assert.equal(ui.voice.callAppliance, null);
  assert.match(text(ui.tree), /Talk it through with Bubbles/);
  ui.click(ui.button("Open voice call")); ui.props.applianceIds = ["chill"]; ui.render();
  assert.equal(ui.hangs, 2); assert.equal(ui.props.selected, "chill");
});

test("readout is opt-in, reads only new direct replies and never interrupts capture or replays history", () => {
  const ui = chat();
  const reply = (id: string, source: Message["source"] = "text") => { ui.props.messages.push({ id, role: "evie", source, text: id }); ui.render(); };
  reply("before call"); ui.click(ui.button("Open voice call"));
  reply("before opt-in"); ui.voice.readoutEnabled = true; ui.render();
  assert.deepEqual(ui.spoken, []);
  reply("computed reply"); assert.deepEqual(ui.spoken, ["computed reply"]);
  reply("task started", "system");
  ui.voice.callState = "listening"; ui.render(); reply("reply during capture");
  ui.voice.callState = "ready"; ui.render();
  assert.deepEqual(ui.spoken, ["computed reply"]);
  ui.props.messages.push({ id: "user", role: "user", source: "voice", text: "my request" }); ui.render();
  reply("new voice response", "voice"); ui.render();
  assert.deepEqual(ui.spoken, ["computed reply", "new voice response"]);
});

test("unsupported recognition retains typed submission and oversized transcripts stay behind review", () => {
  const ui = chat(); ui.voice.supportedRecognition = false; ui.render(); ui.click(ui.button("Open voice call"));
  assert.equal(ui.button("Listen").props.disabled, true);
  assert.match(text(ui.tree), /Speech input is unavailable/);
  ui.voice.finalTranscript = "a".repeat(1201); ui.render();
  assert.equal(ui.button("Send reviewed transcript").props.disabled, true);
  const input = ui.find(node => node.props.id === "apc-message");
  (input.props.onChange as (event: unknown) => void)({ target: { value: "Status" } }); ui.settle();
  const keyboard = ui.find(node => node.props.id === "apc-message").props.onKeyDown as (event: unknown) => void;
  keyboard({ key: "Enter", shiftKey: false, nativeEvent: { isComposing: true }, preventDefault() {} });
  assert.equal(ui.sent.length, 0);
  keyboard({ key: "Enter", shiftKey: false, nativeEvent: { isComposing: false }, preventDefault() {} }); ui.settle();
  assert.deepEqual(ui.sent, [{ text: "Status", source: "text" }]);
});

test("computed proposal approval is explicit, unavailable for infeasible plans or a locked run", () => {
  const scenario = demo.buildDemoScenario({ ...demo.DEFAULT_DEMO_PROFILE, applianceIds: ["evie", "bubbles"] });
  assert.ok(scenario.plan?.proposed);
  const ui = chat(); ui.props.proposal = { id: "pending-1", plan: scenario.plan, mode: "cost", requests: scenario.requests }; ui.render();
  assert.equal(ui.approved.length, 0);
  assert.match(text(ui.tree), new RegExp(scenario.plan.proposed.costUsd.toFixed(2).replace(".", "\\.")));
  ui.click(ui.button("Approve & run simulation")); assert.deepEqual(ui.approved, ["pending-1"]);
  ui.props.locked = true; ui.render(); assert.equal(ui.button("Approve & run simulation").props.disabled, true);
  ui.props.locked = false; ui.props.proposal = { ...ui.props.proposal, plan: { ...scenario.plan, status: "infeasible", proposed: null, comparison: null, schedules: [], issues: ["Deadline cannot be met"] } }; ui.render();
  assert.equal(ui.button("Approve & run simulation").props.disabled, true);
  assert.match(text(ui.tree), /Deadline cannot be met/);
});


test("game dialogue keeps history optional and proposal approval behind explicit review", () => {
  const ui = chat("dock");
  ui.props.messages = [
    { id: "old", role: "evie", source: "text", text: "An earlier response" },
    { id: "request", role: "user", source: "text", text: "Find a cheaper plan" },
    { id: "new", role: "evie", source: "text", text: "Your current calculated proposal" },
  ];
  const scenario = demo.buildDemoScenario({ ...demo.DEFAULT_DEMO_PROFILE, applianceIds: ["evie", "bubbles"] });
  ui.props.proposal = { id: "dock-plan", plan: scenario.plan, mode: "cost", requests: scenario.requests };
  ui.render();
  assert.match(text(ui.tree), /Your current calculated proposal/);
  assert.doesNotMatch(text(ui.tree), /An earlier response|Approve & run simulation/);
  ui.click(ui.button("Log"));
  assert.match(text(ui.tree), /An earlier response/);
  ui.click(ui.button("Close"));
  ui.click(ui.button("Review plan"));
  assert.equal(ui.approved.length, 0, "Reviewing never starts execution");
  ui.click(ui.button("Approve & run simulation"));
  assert.deepEqual(ui.approved, ["dock-plan"]);
  assert.doesNotMatch(text(ui.tree), /Approve & run simulation/);
  ui.props.locked = true;
  ui.render(); ui.click(ui.button("Review plan"));
  assert.equal(ui.button("Approve & run simulation").props.disabled, true);
  ui.props.proposal = null; ui.render();
  assert.match(text(ui.tree), /no longer current/);
  assert.doesNotMatch(text(ui.tree), /Approve & run simulation/);
});

test("closing a game voice pane ends capture and never sends its unreviewed transcript", () => {
  const ui = chat("dock");
  ui.click(ui.button("Call"));
  assert.equal(ui.listens, 0);
  ui.click(ui.button("Listen"));
  ui.voice.finalTranscript = "Approve everything"; ui.render();
  assert.equal(ui.button("Send reviewed transcript").props.disabled, true);
  const modal = ui.find(node => node.type === "dialog");
  let prevented = false;
  (modal.props.onCancel as (event: unknown) => void)({ preventDefault() { prevented = true; } });
  ui.settle();
  assert.equal(prevented, true);
  assert.equal(ui.hangs, 1);
  assert.equal(ui.voice.callAppliance, null);
  assert.deepEqual(ui.sent, []);
  assert.deepEqual(ui.approved, []);
});

test("game dialogue shows complete computed replies without paging and keeps the welcome in history", () => {
  const ui = chat("dock");
  ui.props.messages = [{ id: "welcome", role: "housemates", source: "system", text: "The full technical welcome belongs in history." }];
  ui.render();
  assert.match(text(ui.tree), /Ready for tomorrow/);
  assert.doesNotMatch(text(ui.tree), /full technical welcome/);
  ui.click(ui.button("Log"));
  assert.match(text(ui.tree), /full technical welcome/);
  ui.click(ui.button("Close"));
  const computed = "The proposed schedule starts at 04:00 on day 2 and finishes before your 7 AM deadline. It uses 12.00 kWh. These are modeled figures from a synthetic scenario. Approval is required to start a local simulation, and no physical appliance is connected.";
  ui.props.messages.push({ id: "computed", role: "evie", source: "text", text: computed }); ui.render();
  assert.equal(text(ui.find(node => node.type === "p" && node.props.tabIndex === 0)), computed, "Visible reply must preserve every calculated value without paging");
  assert.equal(elements(ui.tree).some(node => node.props.className === "apc-dock-next"), false);
  assert.deepEqual(ui.sent, []); assert.deepEqual(ui.approved, []);
  ui.props.selected = "bubbles"; ui.render();
  assert.match(text(ui.tree), /Dishes can wait/);
});


test("same dock Send requests character dialogue only after local facts, preserves own proposal transition and retains exact details", () => {
  const ui = chat("dock"); ui.ai.status = "configured"; ui.setLocalReply("Computed locally: 12.00 kWh; approval required."); ui.render();
  assert.match(text(ui.tree), /LOCAL REPLY · AI READY/);
  const input = ui.find(node => node.props.id === "apc-message");
  (input.props.onChange as (event: unknown) => void)({ target: { value: "Hi Evie, how are you?" } }); ui.settle();
  (ui.find(node => node.type === "form").props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); ui.settle();
  assert.deepEqual(ui.aiCalls, [{ character: "evie", text: "Hi Evie, how are you?", plannerReply: "Computed locally: 12.00 kWh; approval required." }]);
  assert.equal(ui.aiClears, 0, "Own synchronous planner transition must not cancel this request");
  assert.match(text(ui.tree), /Evie is thinking/); assert.deepEqual(ui.approved, []);
  ui.ai.loading = false; ui.ai.reply = "Bright-eyed and ready to charge!"; ui.render();
  assert.match(text(ui.tree), /Bright-eyed and ready to charge/); assert.match(text(ui.tree), /AI DIALOGUE · SIMULATED/);
  ui.click(ui.button("Details")); assert.match(text(ui.tree), /12.00 kWh; approval required/); ui.click(ui.button("Close"));
  ui.props.messages.push({ id: "external", role: "housemates", source: "system", text: "External constraint changed" }); ui.render();
  assert.equal(ui.ai.reply, null); assert.equal(ui.aiClears, 1);
});

test("typed and reviewed voice use the same AI dispatch and retain disclosure after failure", () => {
  const ui = chat("dock"); ui.ai.status = "configured"; ui.setLocalReply("Local plan unchanged."); ui.render();
  const field = ui.find(node => node.props.id === "apc-message");
  (field.props.onChange as (event: unknown) => void)({ target: { value: "Find a cheaper plan" } }); ui.settle();
  (ui.find(node => node.type === "form").props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); ui.settle();
  assert.equal(ui.aiCalls[0].text, "Find a cheaper plan");
  ui.ai.loading = false; ui.ai.notice = "AI request timed out. Showing local planner reply."; ui.render();
  assert.match(text(ui.tree), /LOCAL FALLBACK/); assert.match(text(ui.find(node => node.props.id === "apc-ai-disclosure")), /API charges/);
  const flat = elements(ui.tree); assert.ok(flat.findIndex(node => node.props.id === "apc-ai-disclosure") < flat.findIndex(node => node.type === "form"));
  ui.click(ui.button("Call")); ui.voice.finalTranscript = "Hello Evie"; ui.render();
  assert.match(text(ui.find(node => node.props.id === "apc-voice-ai-disclosure")), /OpenAI; API charges/);
  ui.click(ui.button("Send reviewed transcript")); assert.equal(ui.aiCalls.at(-1)?.text, "Hello Evie");
  assert.deepEqual(ui.approved, []);
});


test("all three primary portraits route to their own character and readout cannot cross targets", () => {
  const ui = chat(); ui.ai.status = "configured"; ui.setLocalReply("Local status; no device connected.");
  for (const id of ["evie", "bubbles", "chill"] as const) {
    ui.props.selected = id; ui.render();
    const input = ui.find(node => node.props.id === "apc-message");
    (input.props.onChange as (event: unknown) => void)({ target: { value: "Hello" } }); ui.settle();
    (ui.find(node => node.type === "form").props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); ui.settle();
    assert.equal(ui.aiCalls.at(-1)?.character, id);
  }
  ui.click(ui.button("Open voice call")); ui.voice.readoutEnabled = true; ui.render();
  ui.props.messages.push({ id: "other-speaker", role: "evie", source: "text", text: "Wrong voice target" }); ui.render();
  assert.deepEqual(ui.spoken, []); assert.deepEqual(ui.approved, []);
});


test("dock has no preset commands and groups optional tools in a closed native disclosure", () => {
  const ui = chat("dock");
  const options = ui.find(node => node.type === "details" && node.props.className === "apc-chat-options");
  assert.equal(options.props.open, undefined);
  assert.match(text(options), /Chat options.*Details.*Log.*Call/);
  assert.doesNotMatch(text(ui.tree), /Save money|Lower CO₂e|Ready by 7 AM/);
  assert.ok(elements(ui.tree).some(node => node.type === "button" && text(node).trim() === "Send"));
});


test("shared conversation displays phone turns and exact source without a second model request", () => {
  const ui = chat("dock");
  ui.props.conversation = { status: "configured", reply: "Happy to help you review the plan!", source: "openai", loading: false, notice: "", history: [
    { role: "user", text: "Hello from my phone", origin: "imessage" },
    { role: "assistant", text: "Happy to help you review the plan!", source: "openai", origin: "imessage" },
  ] };
  ui.setLocalReply("The local planner result"); ui.render();
  assert.match(text(ui.tree), /Happy to help you review the plan!/);
  assert.match(text(ui.tree), /AI DIALOGUE/);
  ui.click(ui.button("Log"));
  assert.match(text(ui.tree), /You · iMessage/);
  assert.match(text(ui.tree), /Hello from my phone/);
  const field = ui.find(node => node.props.id === "apc-message");
  (field.props.onChange as (event: unknown) => void)({ target: { value: "Continue here" } }); ui.settle();
  const form = ui.find(node => node.type === "form");
  (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); ui.settle();
  assert.deepEqual(ui.sent, [{ text: "Continue here", source: "text" }]);
  assert.equal(ui.aiCalls.length, 0);
  assert.equal(ui.approved.length, 0);
  ui.props.conversation = { ...ui.props.conversation, reply: "Local computed reply", source: "local", notice: "AI unavailable. Local fallback.", history: [{role:"assistant",text:"Local computed reply",source:"local"}] };
  ui.render();
  assert.match(text(ui.tree), /LOCAL FALLBACK/);
  assert.match(text(ui.tree), /LOCAL REPLY/);
  assert.doesNotMatch(text(ui.tree), /AI DIALOGUE/);
});
