"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ApplianceId } from "@/domain/appliances";
import type { HouseholdPlan, OptimizationMode, SchedulingRequest } from "@/domain/scheduling";
import { formatDemoHour } from "@/domain/demo";
import { PixelAppliance } from "./pixel-appliance";
import { useApplianceVoice } from "./use-appliance-voice";
import { useCharacterDialogue } from "./use-character-dialogue";
import type { SharedConversationView } from "./use-household-conversation";
import "./appliance-chat.css";

export type ApplianceChatMessage = {
  id: string;
  role: "user" | ApplianceId | "housemates";
  text: string;
  source: "text" | "voice" | "system";
};
export type ApplianceChatProposal = {
  id: string;
  plan: HouseholdPlan;
  mode: OptimizationMode;
  requests: readonly SchedulingRequest[];
};
export type ApplianceChatProps = {
  applianceIds: readonly ApplianceId[];
  selected: ApplianceId;
  onSelect: (id: ApplianceId) => void;
  messages: readonly ApplianceChatMessage[];
  onSend: (text: string, source: "text" | "voice") => string | void;
  proposal?: ApplianceChatProposal | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  locked: boolean;
  executionStatus: string;
  presentation?: "panel" | "dock";
  dialogueContext?: string;
  conversation?: SharedConversationView;
};
const names = { evie: "Evie", bubbles: "Bubbles", chill: "Chill", housemates: "Housemates", user: "You" };
const ignoreManagedClear = () => {};
const roles: Record<ApplianceId, string> = { evie: "Your early bird", bubbles: "Your cleanup crew", chill: "Your comfort guard" };
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (value: number) => Number.isFinite(value) ? usd.format(value) : "—";
const carbon = (grams: number) => Number.isFinite(grams) ? `${(grams / 1000).toFixed(3)} kg` : "—";
const isAppliance = (role: ApplianceChatMessage["role"]): role is ApplianceId => role === "evie" || role === "bubbles" || role === "chill";
const limit = 1200;

function PlanReview({ proposal, locked, onApprove, onReject }: { proposal: ApplianceChatProposal; locked: boolean; onApprove: (id: string) => void; onReject: (id: string) => void }) {
  const { plan } = proposal;
  const feasible = plan.status === "feasible" && plan.proposed !== null && plan.comparison !== null;
  const labels = { cost: "Cost first", carbon: "Carbon first", balanced: "Balanced" };
  return <section className={`apc-proposal ${feasible ? "" : "apc-proposal-invalid"}`} aria-label="Review the proposed schedule">
    <div className="apc-proposal-heading"><div><p className="apc-eyebrow">{feasible ? "A PLAN TO CONSIDER" : "THIS PLAN NEEDS A CHANGE"}</p><h3>{feasible ? "Your crew’s proposal" : "No feasible schedule yet"}</h3></div><span className="apc-mode">{labels[proposal.mode]}</span></div>
    {plan.issues.length > 0 && <ul className="apc-issues">{plan.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
    {plan.baseline && plan.proposed && <div className="apc-comparison"><div><span>Original cost</span><strong>{money(plan.baseline.costUsd)}</strong></div><div><span>Proposed cost</span><strong>{money(plan.proposed.costUsd)}</strong></div><div><span>Original modeled CO₂e</span><strong>{carbon(plan.baseline.carbonGrams)}</strong></div><div><span>Proposed modeled CO₂e</span><strong>{carbon(plan.proposed.carbonGrams)}</strong></div></div>}
    {plan.comparison && <p className="apc-tradeoff"><span>{plan.comparison.costSavingsUsd === 0 ? "No estimated cost change." : `${money(Math.abs(plan.comparison.costSavingsUsd))} estimated cost ${plan.comparison.costSavingsUsd > 0 ? "reduction" : "increase"}.`}</span><span>{plan.comparison.carbonReductionGrams === 0 ? "No modeled carbon change." : `${carbon(Math.abs(plan.comparison.carbonReductionGrams))} modeled CO₂e ${plan.comparison.carbonReductionGrams > 0 ? "reduction" : "increase"}.`}</span></p>}
    {!plan.baselineFeasible && plan.baseline && <p className="apc-note">The original schedule does not meet the updated constraints. It remains the fixed comparison reference.</p>}
    {plan.schedules.length > 0 && <ul className="apc-plan-schedules">{plan.schedules.map(schedule => <li key={schedule.applianceId}><PixelAppliance id={schedule.applianceId}/><div><b>{names[schedule.applianceId]}</b><span>{formatDemoHour(schedule.startHour)} → {formatDemoHour(schedule.endHour)}</span></div><strong>{schedule.energyKwh.toFixed(2)} kWh</strong></li>)}</ul>}
    <details className="apc-constraints"><summary>Check deadlines, windows & assumptions</summary><ul>{proposal.requests.map(request => {
      const appliance = request.appliance;
      const deadline = appliance.kind === "ev" ? appliance.constraints.readyByHour : appliance.constraints.finishByHour;
      return <li key={appliance.id}><b>{appliance.name}:</b> finish by {formatDemoHour(deadline)}; allowed starts {formatDemoHour(request.startWindow.earliestHour)} to {formatDemoHour(request.startWindow.latestHour)}.</li>;
    })}{plan.assumptions.map((assumption, index) => <li key={`assumption-${index}`}>{assumption}</li>)}</ul></details>
    <div className="apc-approval-actions"><button type="button" className="apc-primary" disabled={!feasible || locked} onClick={() => onApprove(proposal.id)}>Approve & run simulation</button><button type="button" className="apc-secondary" disabled={locked} onClick={() => onReject(proposal.id)}>Reject proposal</button></div>
    <p className="apc-note">Approval starts only the local simulation. Prices and activity are synthetic; no appliance is connected. Chill is excluded from optimized savings.</p>
  </section>;
}

/** The caller owns validated plans/execution. Optional character dialogue renders alongside exact planner details. */
export function ApplianceChat({ applianceIds, selected, onSelect, messages, onSend, proposal, onApprove, onReject, locked, executionStatus, presentation = "panel", dialogueContext = "household", conversation }: ApplianceChatProps) {
  const [draft, setDraft] = useState("");
  const [dockPane, setDockPane] = useState<"history" | "voice" | "proposal" | "planner" | null>(null);
  const dockDialog = useRef<HTMLDialogElement>(null);
  const dockComposer = useRef<HTMLTextAreaElement>(null);
  const [voiceEdit, setVoiceEdit] = useState<{ original: string; text: string } | null>(null);
  const voice = useApplianceVoice();
  const log = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const callPanel = useRef<HTMLElement>(null);
  const callHeading = useRef<HTMLHeadingElement>(null);
  const lastMessage = messages.at(-1);
  const lastSpokenId = useRef(lastMessage?.id);
  const current = applianceIds.includes(selected) ? selected : applianceIds[0];
  const localDialogue = useCharacterDialogue(current ?? "evie", `${dialogueContext}:${locked}:${executionStatus}`, !conversation);
  const dialogue = conversation ?? { ...localDialogue, source: localDialogue.reply ? "openai" as const : null };
  const clearDialogue = conversation ? ignoreManagedClear : localDialogue.clear;
  const latestReply = [...messages].reverse().find(message => message.id !== "welcome" && (message.role === current || message.role === "housemates"));
  const revision = `${proposal?.id ?? "none"}:${lastMessage?.id ?? "none"}`;
  const previousRevision = useRef(revision);
  const expectedLocalReply = useRef<{ text: string; beforeId: string | undefined } | null>(null);
  const activeCall = voice.callAppliance !== null;
  const callId = voice.callAppliance ?? current ?? "evie";
  const listening = voice.callState === "listening";
  const transcript = voiceEdit?.original === voice.finalTranscript ? voiceEdit.text : voice.finalTranscript;
  const spokenText = transcript.trim();
  const busyMicrophone = listening || voice.requestingMicrophone;
  const { speak, endCall, callAppliance, readoutEnabled } = voice;

  useEffect(() => {
    if (conversation || previousRevision.current === revision) return;
    previousRevision.current = revision;
    const expected = expectedLocalReply.current;
    expectedLocalReply.current = null;
    // Our own synchronous planner result is the context of the just-started request.
    // External edits, approvals, resets and simulation events invalidate old dialogue.
    if (expected && latestReply?.text === expected.text && latestReply.id !== expected.beforeId) return;
    clearDialogue();
  }, [revision, latestReply?.text, latestReply?.id, clearDialogue, conversation]);
  useEffect(() => {
    const dialog = dockDialog.current;
    if (presentation !== "dock" || !dockPane || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [dockPane, presentation]);

  useEffect(() => {
    if (current && current !== selected) onSelect(current);
  }, [current, selected, onSelect]);
  useEffect(() => {
    if (callAppliance && callAppliance !== current) endCall();
  }, [callAppliance, current, endCall]);
  useEffect(() => {
    if (log.current && followMessages.current) log.current.scrollTop = log.current.scrollHeight;
  }, [lastMessage?.id]);
  useEffect(() => {
    if (!lastMessage || lastSpokenId.current === lastMessage.id) return;
    lastSpokenId.current = lastMessage.id;
    if ((lastMessage.role === callAppliance || lastMessage.role === "housemates") && lastMessage.source !== "system" && callAppliance && callAppliance === current && readoutEnabled && !busyMicrophone) speak(lastMessage.text);
  }, [lastMessage, callAppliance, current, readoutEnabled, busyMicrophone, speak]);

  function select(id: ApplianceId) {
    clearDialogue(); expectedLocalReply.current = null;
    if (activeCall && voice.callAppliance !== id) voice.endCall();
    onSelect(id);
  }
  function dispatch(text: string, source: "text" | "voice") {
    if (!current || !text.trim() || text.length > limit) return;
    followMessages.current = true;
    const plannerReply = onSend(text, source);
    if (conversation) return;
    if (typeof plannerReply === "string") {
      expectedLocalReply.current = { text: plannerReply, beforeId: latestReply?.id };
      void localDialogue.request(text, plannerReply);
    } else {
      expectedLocalReply.current = null;
      clearDialogue();
    }
  }
  function openCall() {
    if (!current) return;
    voice.startCall(current); setVoiceEdit(null);
    if (presentation === "dock") setDockPane("voice");
    requestAnimationFrame(() => { callHeading.current?.focus({ preventScroll: true }); callPanel.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); });
  }
  function sendText(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || text.length > limit || !current) return;
    dispatch(text, "text"); setDraft("");
  }
  function composerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendText(); }
  }
  function sendVoice() {
    if (!spokenText || spokenText.length > limit || busyMicrophone || !current || callAppliance !== current) return;
    dispatch(spokenText, "voice"); voice.clearTranscript(); setVoiceEdit(null);
  }
  const callStatus = voice.requestingMicrophone ? "Waiting for microphone permission" : voice.callState === "listening" ? "Listening — stop when you’re ready" : voice.callState === "speaking" ? "Reading the computed reply" : voice.callState === "error" ? "Voice needs your attention" : "Ready when you are";

  function closeDockPane() {
    if (dockPane === "voice") voice.endCall();
    dockDialog.current?.close();
    setDockPane(null);
  }
  const voicePanel = (    <aside className={`apc-call-panel ${activeCall ? "apc-call-active" : ""}`} ref={callPanel} aria-label="Optional browser voice call">
      <p className="apc-eyebrow">VOICE LINK / OPTIONAL</p><div className={`apc-call-portrait ${listening || voice.callState === "speaking" ? "apc-call-pulsing" : ""}`}><i aria-hidden="true"/><i aria-hidden="true"/><PixelAppliance id={callId}/></div><h3 ref={callHeading} tabIndex={-1}>{activeCall ? `On the line with ${names[callId]}` : `Talk it through with ${names[callId]}.`}</h3>
      <p className="apc-call-caption">Browser speech · local planner + optional AI</p>
      {!activeCall ? <><p className="apc-call-copy">Speak a request, review the transcript, then send it to the same planner. This browser voice call does not dial a phone.</p><button type="button" className="apc-primary apc-open-call" disabled={!current} onClick={openCall}>Open voice call</button><p className="apc-note">Opening the call does not turn on your microphone.</p></> : <>
        <p className="apc-call-status" role="status"><i aria-hidden="true"/>{callStatus}</p>
        <p className="apc-privacy">Press Listen to request microphone access. Browser voice may send audio or reply text to its speech provider. Review transcripts before sending; voice is not guaranteed to stay on your device.</p>
        {!voice.supportedRecognition && <p className="apc-voice-error">Speech input is unavailable in this browser. You can keep typing in the conversation.</p>}
        {voice.error && <p className="apc-voice-error" role="alert">{voice.error}</p>}
        <div className="apc-voice-controls"><button type="button" className="apc-primary" disabled={!voice.supportedRecognition || busyMicrophone} onClick={voice.startListening}>Listen</button><button type="button" className="apc-secondary" disabled={!busyMicrophone} onClick={voice.stopListening}>Stop</button><button type="button" className="apc-end-call" onClick={voice.endCall}>End call</button></div>
        <label className="apc-readout"><input type="checkbox" checked={voice.readoutEnabled} disabled={!voice.supportedSpeech} onChange={event => voice.setReadoutEnabled(event.target.checked)}/> Read new planner replies aloud</label>
        <div className="apc-transcript"><label htmlFor="apc-transcript">Review before sending</label><p className="apc-interim" aria-live="polite">{voice.interimTranscript || (busyMicrophone ? "Listening for your words…" : "Your transcript stays here until you send it.")}</p><textarea id="apc-transcript" rows={3} readOnly={busyMicrophone} maxLength={limit} value={transcript} onChange={event => setVoiceEdit({ original: voice.finalTranscript, text: event.target.value })} placeholder="Your final transcript appears here…"/>{spokenText.length > limit && <p className="apc-voice-error">Please shorten this request to {limit} characters before sending.</p>}<p className="apc-ai-disclosure" id="apc-voice-ai-disclosure">{dialogue.status === "configured" ? "Sending this reviewed text shares it, planner details and recent chat with OpenAI; API charges may apply. The AI request contains no photos or audio." : "AI is unavailable; this reviewed text uses the local planner."}</p><button type="button" className="apc-secondary" aria-describedby="apc-voice-ai-disclosure" disabled={!spokenText || spokenText.length > limit || busyMicrophone} onClick={sendVoice}>Send reviewed transcript</button><p className="apc-note">Speech never submits a message or approves a schedule automatically.</p></div>
      </>}
    </aside>);
  const localMessages = messages.map(message => <article key={message.id} className={`apc-message ${message.role === "user" ? "apc-message-user" : ""}`}><div className="apc-message-author">{isAppliance(message.role) && <PixelAppliance id={message.role}/>}<b>{names[message.role]}</b>{message.source === "voice" && message.role === "user" && <span>VOICE · REVIEWED</span>}</div><p>{message.text}</p></article>);
  const plannerDetails = <details className="apc-planner-details"><summary>Planner details & local activity</summary><p className="apc-note">Exact calculated replies. AI dialogue cannot change these facts or approve a run.</p>{localMessages}</details>;
  const historyLog = <div className="apc-messages" ref={log} role="log" aria-label="Household conversation" aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={event => { const panel = event.currentTarget; followMessages.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 60; }}>
    {dialogue.history.length > 0 ? <>{dialogue.history.map((message,index) => <article key={index} className={`apc-message ${message.role === "user" ? "apc-message-user" : ""}`}><div className="apc-message-author">{message.role === "assistant" && current && <PixelAppliance id={current}/>}<b>{message.role === "user" ? ("origin" in message && message.origin === "imessage" ? "You · iMessage" : "You") : current ? names[current] : "Your crew"}</b>{message.role === "assistant" && <span>{"source" in message && message.source === "local" ? "LOCAL REPLY · SIMULATED" : "AI DIALOGUE · SIMULATED"}</span>}</div><p>{message.text}</p></article>)}{plannerDetails}</> : messages.length ? localMessages : <div className="apc-empty"><div className="apc-empty-portraits">{applianceIds.map(id => <PixelAppliance key={id} id={id}/>)}</div><h3>Your crew is ready.</h3><p>{current ? "Say hello, ask about a plan, or share what your day looks like." : "Recruit an appliance to start a conversation."}</p></div>}
  </div>;
  const greeting = current === "chill" ? "Comfort comes first. Ask me about my modeled cooling activity." : current === "bubbles" ? "Dishes can wait for a better hour. When should I finish?" : current === "evie" ? "Ready for tomorrow! Let’s find a good time to charge." : "Recruit a teammate to open a conversation.";
  const dockMessage = dialogue.loading ? `${current ? names[current] : "Your teammate"} is thinking… Your planner result is ready in Details.` : dialogue.reply ?? latestReply?.text ?? greeting;
  const paneTitle = dockPane === "voice" ? "Voice link" : dockPane === "proposal" ? "Review your crew’s plan" : dockPane === "planner" ? "Planner details" : "Conversation log";
  const aiLabel = dialogue.loading ? "AI THINKING · SIMULATED" : dialogue.reply && dialogue.source === "openai" ? "AI DIALOGUE · SIMULATED" : dialogue.notice || dialogue.status === "unconfigured" ? "LOCAL FALLBACK · SIMULATED" : dialogue.status === "checking" ? "CHECKING AI · LOCAL READY" : "LOCAL REPLY · AI READY";
  const aiDisclosure = <p className="apc-ai-disclosure" id="apc-ai-disclosure">{dialogue.status === "configured" ? "Send shares text, planner details & recent chat with OpenAI; API charges may apply. No photos/audio in AI requests." : dialogue.status === "checking" ? "Checking AI connection. Local planner stays available." : "AI unavailable. Send uses the local planner; no model reply is invented."}</p>;
  if (presentation === "dock") return <section className="apc-shell apc-dock" id="demo-appliance-chat" aria-label="Appliance dialogue">
    <div className="apc-dock-portrait" aria-hidden="true">{current && <PixelAppliance id={current}/>}<span>PARTY LINK</span></div>
    <div className="apc-dock-main">
      <header className="apc-dock-heading"><h2>{current ? names[current] : "Your crew"}</h2><span>{aiLabel}</span><details className="apc-chat-options"><summary>Chat options</summary><div><button type="button" onClick={() => setDockPane("planner")} aria-label="Open planner details">Details</button><button type="button" onClick={() => setDockPane("history")} aria-label="Open conversation history">Log</button><button type="button" disabled={!current} onClick={openCall} aria-label={`Call ${current ? names[current] : "a teammate"}`}>Call</button></div></details></header>
      <div className="apc-dock-reply" role="log" aria-live="polite" aria-label="Latest household reply" tabIndex={0}><p tabIndex={0}>{dockMessage}</p></div>
      <div className="apc-dock-ai-note">{aiDisclosure}{dialogue.notice && <p className="apc-ai-notice" role="status">{dialogue.notice} Local reply in Details.</p>}</div>
      {proposal && <div className="apc-dock-commands"><button type="button" className="apc-dock-review" onClick={() => setDockPane("proposal")}>Review plan</button></div>}

      <form className="apc-composer apc-dock-composer" onSubmit={sendText}><label className="apc-sr-only" htmlFor="apc-message">Message {current ? names[current] : "your crew"}</label><div><textarea ref={dockComposer} id="apc-message" rows={1} maxLength={limit} disabled={!current} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={composerKey} placeholder={`Talk to ${current ? names[current] : "your crew"}…`}/><button type="submit" disabled={!current || !draft.trim()} aria-label="Send message" aria-describedby="apc-ai-disclosure">Send</button></div></form>
    </div>
    {dockPane && <dialog className="apc-dock-dialog" ref={dockDialog} aria-labelledby="apc-dock-dialog-title" onCancel={event => { event.preventDefault(); closeDockPane(); }}>
      <header className="apc-dock-dialog-heading"><h2 id="apc-dock-dialog-title">{paneTitle}</h2><button type="button" onClick={closeDockPane} aria-label={`Close ${paneTitle.toLowerCase()}`}>Close</button></header>
      {dockPane === "history" && <>{historyLog}<p className="apc-note">AI dialogue and local activity stay in this session. Conversation is not saved.</p></>}
      {dockPane === "planner" && <div className="apc-messages"><p className="apc-note">Exact local planner results. AI dialogue never changes a schedule or approves execution.</p>{localMessages.length ? localMessages : <p className="apc-note">No planner request yet.</p>}</div>}
      {dockPane === "voice" && voicePanel}
      {dockPane === "proposal" && (proposal ? <PlanReview proposal={proposal} locked={locked} onApprove={id => { clearDialogue(); onApprove(id); closeDockPane(); }} onReject={id => { clearDialogue(); onReject(id); closeDockPane(); }}/> : <p className="apc-note">This proposal is no longer current. Send a new request to calculate a plan.</p>)}
    </dialog>}
  </section>;

  return <section className="apc-shell" id="demo-appliance-chat" aria-labelledby="apc-heading">
    <header className="apc-header"><div><p className="apc-eyebrow">PARTY LINK / HOUSEHOLD CHANNEL</p><h2 id="apc-heading">Make a plan together.</h2><p>Talk to your crew. The local planner calculates every schedule; changes still wait for your approval.</p></div><span className="apc-local-badge"><i aria-hidden="true"/> {aiLabel}</span></header>
    <div className="apc-tabs" aria-label="Choose an appliance to talk to">{applianceIds.map(id => <button key={id} type="button" aria-pressed={current === id} onClick={() => select(id)}><PixelAppliance id={id}/><span><strong>{names[id]}</strong><small>{roles[id]}</small></span><span className="apc-tab-arrow" aria-hidden="true">↗</span></button>)}</div>
    <div className="apc-body"><div className="apc-chat-column">
      <div className="apc-channel-heading"><span>{current ? `${names[current]} & the household` : "Your household"}</span></div>
      {historyLog}
      {dialogue.loading && <p className="apc-thinking" role="status">{current ? names[current] : "Your teammate"} is thinking…</p>}{dialogue.notice && <p className="apc-ai-notice" role="status">{dialogue.notice}</p>}
      <div className="apc-panel-disclosure">{aiDisclosure}</div>

      <form className="apc-composer" onSubmit={sendText}><label htmlFor="apc-message">Message {current ? names[current] : "your crew"}</label><div><textarea id="apc-message" rows={2} maxLength={limit} disabled={!current} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={composerKey} placeholder={current === "bubbles" ? "Please finish the dishes before 10 PM…" : current === "chill" ? "Explain my simulated cooling activity…" : "I need my EV charged by 7 AM…"}/><button type="submit" disabled={!current || !draft.trim()} aria-label="Send message" aria-describedby="apc-ai-disclosure">Send</button></div><p>Enter to send · Shift + Enter for a new line. Text remains available if voice is unsupported.</p></form>
    </div>
    <details className="apc-panel-options" open={activeCall || undefined}><summary>Chat options</summary>{voicePanel}</details></div>
    {(executionStatus || locked) && <div className="apc-execution" role="status"><span className="apc-eyebrow">SIMULATION STATUS</span><p>{executionStatus || "The approved run is locked."}</p>{locked && <small>You can ask questions; new requests cannot silently change this run.</small>}</div>}
    {proposal && <PlanReview proposal={proposal} locked={locked} onApprove={id => { clearDialogue(); onApprove(id); }} onReject={id => { clearDialogue(); onReject(id); }}/>}
  </section>;
}
