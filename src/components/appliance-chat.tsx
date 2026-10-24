"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ApplianceId } from "@/domain/appliances";
import type { HouseholdPlan, OptimizationMode, SchedulingRequest } from "@/domain/scheduling";
import { formatDemoHour } from "@/domain/demo";
import { PixelAppliance } from "./pixel-appliance";
import { useApplianceVoice } from "./use-appliance-voice";
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
  onSend: (text: string, source: "text" | "voice") => void;
  proposal?: ApplianceChatProposal | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  locked: boolean;
  executionStatus: string;
};
const names = { evie: "Evie", bubbles: "Bubbles", chill: "Chill", housemates: "Housemates", user: "You" };
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
    <div className="apc-approval-actions"><button type="button" className="apc-primary" disabled={!feasible || locked} onClick={() => onApprove(proposal.id)}>Approve & run simulation <span aria-hidden="true">↗</span></button><button type="button" className="apc-secondary" disabled={locked} onClick={() => onReject(proposal.id)}>Reject proposal</button></div>
    <p className="apc-note">Approval starts only the local simulation. Prices and activity are synthetic; no appliance is connected. Chill is excluded from optimized savings.</p>
  </section>;
}

/** Controlled conversation UI: the caller owns every reply, validated plan and execution transition. */
export function ApplianceChat({ applianceIds, selected, onSelect, messages, onSend, proposal, onApprove, onReject, locked, executionStatus }: ApplianceChatProps) {
  const [draft, setDraft] = useState("");
  const [voiceEdit, setVoiceEdit] = useState<{ original: string; text: string } | null>(null);
  const voice = useApplianceVoice();
  const log = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const callPanel = useRef<HTMLElement>(null);
  const callHeading = useRef<HTMLHeadingElement>(null);
  const lastMessage = messages.at(-1);
  const lastSpokenId = useRef(lastMessage?.id);
  const current = applianceIds.includes(selected) ? selected : applianceIds[0];
  const activeCall = voice.callAppliance !== null;
  const callId = voice.callAppliance ?? current ?? "evie";
  const listening = voice.callState === "listening";
  const transcript = voiceEdit?.original === voice.finalTranscript ? voiceEdit.text : voice.finalTranscript;
  const spokenText = transcript.trim();
  const busyMicrophone = listening || voice.requestingMicrophone;
  const { speak, endCall, callAppliance, readoutEnabled } = voice;

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
    if (lastMessage.role !== "user" && lastMessage.source !== "system" && callAppliance && readoutEnabled && !busyMicrophone) speak(lastMessage.text);
  }, [lastMessage, callAppliance, readoutEnabled, busyMicrophone, speak]);

  function select(id: ApplianceId) {
    if (activeCall && voice.callAppliance !== id) voice.endCall();
    onSelect(id);
  }
  function openCall() {
    if (!current) return;
    voice.startCall(current); setVoiceEdit(null);
    requestAnimationFrame(() => { callHeading.current?.focus({ preventScroll: true }); callPanel.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); });
  }
  function sendText(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || text.length > limit || !current) return;
    followMessages.current = true; onSend(text, "text"); setDraft("");
  }
  function composerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendText(); }
  }
  function sendVoice() {
    if (!spokenText || spokenText.length > limit || busyMicrophone || !current || callAppliance !== current) return;
    followMessages.current = true; onSend(spokenText, "voice"); voice.clearTranscript(); setVoiceEdit(null);
  }
  const suggestions = current === "chill" ? ["Status", "Explain Chill’s activity"] : ["Find a cheaper plan", "Find a lower-carbon plan", current === "bubbles" ? "Bubbles must not run after 10 PM." : "Evie charged by 7 AM"];
  const callStatus = voice.requestingMicrophone ? "Waiting for microphone permission" : voice.callState === "listening" ? "Listening — stop when you’re ready" : voice.callState === "speaking" ? "Reading the computed reply" : voice.callState === "error" ? "Voice needs your attention" : "Ready when you are";

  return <section className="apc-shell" id="demo-appliance-chat" aria-labelledby="apc-heading">
    <header className="apc-header"><div><p className="apc-eyebrow">YOUR HOUSEHOLD / OPEN LINE</p><h2 id="apc-heading">Make a plan together.</h2><p>A local command assistant backed by the scheduling engine. Every proposed change waits for your approval.</p></div><span className="apc-local-badge"><i aria-hidden="true"/> DETERMINISTIC DEMO</span></header>
    <div className="apc-tabs" aria-label="Choose an appliance to talk to">{applianceIds.map(id => <button key={id} type="button" aria-pressed={current === id} onClick={() => select(id)}><PixelAppliance id={id}/><span><strong>{names[id]}</strong><small>{roles[id]}</small></span><span className="apc-tab-arrow" aria-hidden="true">↗</span></button>)}</div>
    <div className="apc-body"><div className="apc-chat-column">
      <div className="apc-channel-heading"><span>{current ? `${names[current]} & the household` : "Your household"}</span><button type="button" disabled={!current} onClick={openCall}><span aria-hidden="true">◔</span> Call {current ? names[current] : "a teammate"}</button></div>
      <div className="apc-messages" ref={log} role="log" aria-label="Household conversation" aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={event => { const panel = event.currentTarget; followMessages.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 60; }}>
        {messages.length === 0 ? <div className="apc-empty"><div className="apc-empty-portraits">{applianceIds.map(id => <PixelAppliance key={id} id={id}/>)}</div><h3>Your crew is ready.</h3><p>{current ? "Ask for a cheaper or lower-carbon plan, or set a whole-hour deadline. Use a command below to begin." : "Recruit an appliance to start a conversation."}</p></div> : messages.map(message => <article key={message.id} className={`apc-message ${message.role === "user" ? "apc-message-user" : ""}`}><div className="apc-message-author">{isAppliance(message.role) && <PixelAppliance id={message.role}/>}<b>{names[message.role]}</b>{message.source === "voice" && message.role === "user" && <span>VOICE · REVIEWED</span>}</div><p>{message.text}</p></article>)}
      </div>
      <div className="apc-suggestions" aria-label="Suggested commands">{suggestions.map(command => <button key={command} type="button" disabled={!current} onClick={() => { followMessages.current = true; onSend(command, "text"); }}>{command}</button>)}</div>
      <form className="apc-composer" onSubmit={sendText}><label htmlFor="apc-message">Message {current ? names[current] : "your crew"}</label><div><textarea id="apc-message" rows={2} maxLength={limit} disabled={!current} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={composerKey} placeholder={current === "bubbles" ? "Please finish the dishes before 10 PM…" : current === "chill" ? "Explain my simulated cooling activity…" : "I need my EV charged by 7 AM…"}/><button type="submit" disabled={!current || !draft.trim()} aria-label="Send message">Send <span aria-hidden="true">↑</span></button></div><p>Enter to send · Shift + Enter for a new line. Text remains available if voice is unsupported.</p></form>
    </div>
    <aside className={`apc-call-panel ${activeCall ? "apc-call-active" : ""}`} ref={callPanel} aria-label="Optional browser voice call">
      <p className="apc-eyebrow">BROWSER VOICE / OPTIONAL</p><div className={`apc-call-portrait ${listening || voice.callState === "speaking" ? "apc-call-pulsing" : ""}`}><i aria-hidden="true"/><i aria-hidden="true"/><PixelAppliance id={callId}/></div><h3 ref={callHeading} tabIndex={-1}>{activeCall ? `On the line with ${names[callId]}` : `Talk it through with ${names[callId]}.`}</h3>
      <p className="apc-call-caption">Browser voice · local command assistant</p>
      {!activeCall ? <><p className="apc-call-copy">Speak a request, review the transcript, then send it to the same planner. No phone or messaging account is connected.</p><button type="button" className="apc-primary apc-open-call" disabled={!current} onClick={openCall}>Open voice call <span aria-hidden="true">↗</span></button><p className="apc-note">Opening the call does not turn on your microphone.</p></> : <>
        <p className="apc-call-status" role="status"><i aria-hidden="true"/>{callStatus}</p>
        <p className="apc-privacy">Press Listen to request microphone access. Browser voice may send audio or reply text to its speech provider. Review transcripts before sending; voice is not guaranteed to stay on your device.</p>
        {!voice.supportedRecognition && <p className="apc-voice-error">Speech input is unavailable in this browser. You can keep typing in the conversation.</p>}
        {voice.error && <p className="apc-voice-error" role="alert">{voice.error}</p>}
        <div className="apc-voice-controls"><button type="button" className="apc-primary" disabled={!voice.supportedRecognition || busyMicrophone} onClick={voice.startListening}>Listen</button><button type="button" className="apc-secondary" disabled={!busyMicrophone} onClick={voice.stopListening}>Stop</button><button type="button" className="apc-end-call" onClick={voice.endCall}>End call</button></div>
        <label className="apc-readout"><input type="checkbox" checked={voice.readoutEnabled} disabled={!voice.supportedSpeech} onChange={event => voice.setReadoutEnabled(event.target.checked)}/> Read new replies aloud</label>
        <div className="apc-transcript"><label htmlFor="apc-transcript">Review before sending</label><p className="apc-interim" aria-live="polite">{voice.interimTranscript || (busyMicrophone ? "Listening for your words…" : "Your transcript stays here until you send it.")}</p><textarea id="apc-transcript" rows={3} readOnly={busyMicrophone} maxLength={limit} value={transcript} onChange={event => setVoiceEdit({ original: voice.finalTranscript, text: event.target.value })} placeholder="Your final transcript appears here…"/>{spokenText.length > limit && <p className="apc-voice-error">Please shorten this request to {limit} characters before sending.</p>}<button type="button" className="apc-secondary" disabled={!spokenText || spokenText.length > limit || busyMicrophone} onClick={sendVoice}>Send reviewed transcript <span aria-hidden="true">↑</span></button><p className="apc-note">Speech never submits a message or approves a schedule automatically.</p></div>
      </>}
    </aside></div>
    {(executionStatus || locked) && <div className="apc-execution" role="status"><span className="apc-eyebrow">SIMULATION STATUS</span><p>{executionStatus || "The approved run is locked."}</p>{locked && <small>You can ask questions; new requests cannot silently change this run.</small>}</div>}
    {proposal && <PlanReview proposal={proposal} locked={locked} onApprove={onApprove} onReject={onReject}/>}
  </section>;
}
