"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { applianceAgents } from "@/data/appliances";
import { hourlyEnergy } from "@/data/energy";
import { sendHouseholdMessage, updateHouseholdSettings } from "@/domain/conversation";
import { awardTraining, unlockedSkills } from "@/domain/memory";
import { planningFingerprint, type HouseholdState, type ChatRole } from "@/domain/household";
import { optimizeHousehold, type HouseholdPlan, type OptimizationMode, type SchedulingRequest } from "@/domain/scheduling";
import type { ApplianceId } from "@/domain/appliances";
import { ApplianceIcon } from "./appliance-icon";
import { EnergyTimeline, planningTime } from "./energy-parliament";
import { HouseholdSettings } from "./household-settings";
import { useHousehold, updateHousehold, resetHousehold } from "./use-household";

const currency = (value: number) => `$${value.toFixed(2)}`;
const kg = (grams: number) => `${(grams / 1000).toFixed(3)} kg CO₂e`;
const signedCost = (value: number) => `${value < -1e-8 ? "−" : value > 1e-8 ? "+" : ""}${currency(Math.abs(value))}`;
const signedCarbon = (value: number) => `${value < -1e-8 ? "−" : value > 1e-8 ? "+" : ""}${kg(Math.abs(value))}`;
const names: Record<ChatRole, string> = { user: "You", evie: "Evie", bubbles: "Bubbles", chill: "Chill", housemates: "Housemates" };
const objectiveNames = { cost: "Cost-first", carbon: "Carbon-first", balanced: "Balanced" };
const views = [{ id: "parliament", name: "Parliament" }, { id: "schedule", name: "The plan" }, { id: "crew", name: "Meet & train" }, { id: "preferences", name: "Preferences" }] as const;
type View = typeof views[number]["id"];
const requiredRequest = "I need my EV charged by 7 AM and my dishes finished before breakfast. Minimize my energy costs.";

function Avatar({ role, large = false }: { role: ChatRole; large?: boolean }) {
  if (role === "user" || role === "housemates") return <span className={`flex shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${large ? "h-14 w-14" : "h-9 w-9"} ${role === "user" ? "bg-emerald-900 text-white" : "bg-stone-200 text-stone-700"}`} aria-hidden="true">{role === "user" ? "Y" : "⌂"}</span>;
  return <span className={`avatar ${role} ${large ? "avatar-large" : ""}`}><ApplianceIcon id={role} className={large ? "h-10 w-10" : "h-7 w-7"}/></span>;
}

function Proposal({ plan, state, onSend, onInspect }: { plan: HouseholdPlan | null; state: HouseholdState; onSend: (text: string) => void; onInspect: () => void }) {
  const feasible = plan?.status === "feasible";
  return <section className="rounded-3xl border border-[#d2ddc7] bg-[#eef2e6] p-5 sm:p-6" aria-labelledby="proposal-title">
    <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">A little coordination goes a long way</p><h2 id="proposal-title" className="mt-2 text-xl font-semibold">The household proposal</h2></div><span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider">{state.proposalStatus === "approved" ? "Saved" : feasible ? "For review" : "Not approved"}</span></div>
    {!plan ? <><p className="mt-5 text-sm leading-6 text-stone-600">{state.proposalStatus === "rejected" ? "That proposal was rejected. Your preferences are still remembered. Ask for a revision whenever you’re ready." : "Tell the crew what you need. We’ll search feasible hours, show the tradeoffs, and leave the final decision with you."}</p><button type="button" onClick={() => onSend(requiredRequest)} className="mt-5 rounded-full bg-emerald-900 px-5 py-3 text-sm font-semibold text-white">Ask for a plan ↗</button></> : !feasible ? <div role="status" className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-950"><p className="font-semibold">These constraints need a rethink.</p><ul className="mt-2 space-y-2">{plan.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul><p className="mt-3">No complete plan or savings claim is available. Adjust a deadline or window, then ask again.</p></div> : <>
      <p className="mt-3 text-xs text-stone-600">{objectiveNames[state.mode]} · {plan.proposed?.energyKwh.toFixed(2)} kWh across Evie + Bubbles</p>
      <div className="mt-5 space-y-3">{plan.schedules.map(schedule => <div key={schedule.applianceId} className="flex gap-3 rounded-2xl bg-white/80 p-3"><Avatar role={schedule.applianceId}/><div className="min-w-0"><h3 className="text-sm font-semibold">{names[schedule.applianceId]}</h3><p className="mt-1 text-xs leading-5 text-stone-600">{planningTime(schedule.startHour)}<br/>to {planningTime(schedule.endHour)}</p><p className="mt-2 text-xs font-medium">{currency(schedule.costUsd)} · {kg(schedule.carbonGrams)}</p></div></div>)}</div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-stone-300/60 pt-4"><div><p className="text-xs text-stone-600">Estimated cost savings</p><p className="mt-2 text-2xl font-semibold text-emerald-950">{plan.comparison ? signedCost(plan.comparison.costSavingsUsd) : "Unavailable"}</p></div><div><p className="text-xs text-stone-600">Modeled carbon reduction</p><p className="mt-2 text-lg font-semibold text-emerald-950">{plan.comparison ? signedCarbon(plan.comparison.carbonReductionGrams) : "Unavailable"}</p></div></div>
      <p className="mt-3 text-xs leading-5 text-stone-600">Positive means improvement; negative means an increase. {plan.baselineFeasible ? "Compared with the original start times." : "The original schedule violates your current constraints; it remains the comparison reference."}</p>
      {plan.comparison && (plan.comparison.costSavingsUsd < -1e-8 || plan.comparison.carbonReductionGrams < -1e-8) && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950">This plan has a tradeoff: {plan.comparison.costSavingsUsd < -1e-8 ? "cost increases" : plan.comparison.costSavingsUsd > 1e-8 ? "cost decreases" : "cost is unchanged"}, and {plan.comparison.carbonReductionGrams < -1e-8 ? "modeled emissions increase" : plan.comparison.carbonReductionGrams > 1e-8 ? "modeled emissions decrease" : "modeled emissions are unchanged"}.</p>}
      <div className="mt-5 flex flex-wrap gap-2">{state.proposalStatus !== "approved" ? <><button type="button" onClick={() => onSend("Approve this plan")} className="rounded-full bg-emerald-900 px-5 py-3 text-sm font-semibold text-white">Approve & save</button><button type="button" onClick={() => onSend("Reject this plan")} className="rounded-full border border-stone-400 px-4 py-3 text-sm">Reject</button></> : <p className="rounded-xl bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-950">Saved as a simulated plan. No devices were controlled.</p>}<button type="button" onClick={onInspect} className="py-2 text-sm font-semibold text-emerald-900 underline underline-offset-4">Inspect calculations</button></div>
    </>}
    <div className="mt-5 flex items-start gap-2 border-t border-stone-300/60 pt-4 text-xs leading-5 text-stone-600"><Avatar role="chill"/><p><strong>Chill’s promise:</strong> comfort stays protected. AC operation and savings are excluded from this plan.</p></div>
  </section>;
}

function PlanDetails({ state, plan, onSend }: { state: HouseholdState; plan: HouseholdPlan | null; onSend: (text: string) => void }) {
  const [selected, setSelected] = useState(0);
  const [day, setDay] = useState(0);
  const request = state.requests[selected];
  const baseline = plan?.appliances[selected]?.baseline.schedule ?? null;
  const proposed = plan?.schedules.find(schedule => schedule.applianceId === request.appliance.id) ?? null;
  const alternatives = useMemo(() => (["cost", "carbon", "balanced"] as const).map(mode => ({ mode,
    result: optimizeHousehold(state.requests, hourlyEnergy, mode, state.sharedPowerLimitKw ?? undefined) })), [state.requests, state.sharedPowerLimitKw]);
  return <section className="space-y-6" aria-labelledby="plan-details-title">
    <div><p className="eyebrow">See the work behind the words</p><h2 id="plan-details-title" className="mt-2 text-3xl font-semibold tracking-tight">Your energy plan, explained.</h2><p className="mt-3 text-sm leading-6 text-stone-600">Calculated from complete appliance sessions and each hour’s synthetic rate. The original starts remain fixed; no savings are hardcoded.</p></div>
    {!plan && <p className="rounded-2xl bg-amber-50 p-4 text-sm">Request a new plan in Parliament to see its original and proposed schedules here.</p>}
    <div className="flex flex-wrap gap-4"><label className="text-sm font-medium">Appliance <select className="ml-2 rounded-lg border border-stone-300 bg-white p-2" value={selected} onChange={e => setSelected(Number(e.target.value))}>{state.requests.map((r, index) => <option value={index} key={r.appliance.id}>{r.appliance.name}</option>)}</select></label><span className="self-center text-xs text-stone-500">{state.sharedPowerLimitKw === null ? "No shared power cap" : `${state.sharedPowerLimitKw} kW shared cap configured`}</span></div>
    {baseline && proposed && <div className="grid gap-4 sm:grid-cols-2">{[{title:"Original",schedule:baseline},{title:"Proposed",schedule:proposed}].map(({title,schedule}) => <section key={title} className="rounded-2xl border border-stone-200 bg-white/80 p-5"><h3 className="font-semibold">{title}</h3><p className="mt-3 text-sm leading-6">{planningTime(schedule.startHour)} → {planningTime(schedule.endHour)}</p><p className="mt-3 text-2xl font-semibold">{currency(schedule.costUsd)}</p><p className="mt-1 text-sm">{kg(schedule.carbonGrams)}</p><p className="mt-3 text-xs text-stone-500">{schedule.energyKwh.toFixed(2)} kWh · {schedule.powerKw.toFixed(2)} kW peak modeled power</p></section>)}</div>}
    <EnergyTimeline original={baseline} optimized={proposed} day={day} onDayChange={setDay}/>
    <section className="rounded-2xl border border-stone-200 bg-white/80 p-5"><h3 className="text-lg font-semibold">Three ways to weigh the tradeoff</h3><p className="mt-2 text-xs leading-5 text-stone-500">Each option below is a separate feasible household search using your current constraints. Choosing one creates a new proposal for approval.</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{alternatives.map(({mode,result}) => <button key={mode} type="button" onClick={() => onSend(mode === "cost" ? "Minimize my energy costs" : mode === "carbon" ? "Find a lower-carbon plan" : "Balance cost and carbon")} className="rounded-2xl border border-stone-200 bg-[#f6f7ef] p-4 text-left hover:border-emerald-700"><span className="block font-semibold">{objectiveNames[mode]}</span><span className="mt-3 block text-xl">{result.proposed ? currency(result.proposed.costUsd) : "Infeasible"}</span><span className="mt-1 block text-xs">{result.proposed ? kg(result.proposed.carbonGrams) : "Adjust your constraints"}</span><span className="mt-4 block text-xs font-semibold text-emerald-900">Propose this objective ↗</span></button>)}</div></section>
    {plan && <details className="rounded-2xl border border-stone-200 p-5"><summary className="cursor-pointer font-semibold">Recommendation reasons & assumptions</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-stone-600">{[...plan.reasons,...plan.assumptions].map((text,index) => <li key={index}>{text}</li>)}</ul></details>}
    <DataExplanation/>
  </section>;
}

function DataExplanation() {
  return <section className="rounded-2xl bg-[#ecefe7] p-5 text-sm leading-6 text-stone-600"><h3 className="font-semibold text-stone-800">Real calculations. A clearly simulated household.</h3><p className="mt-2">We use a fictional California weekday repeated across a 48-hour horizon. Prices are USD/kWh; grid intensity is stored in g CO₂e/kWh and converted to kg for displayed totals. Hourly energy × rate is summed across the complete session.</p><p className="mt-2">Carbon differences are modeled average-intensity estimates, not measured or necessarily avoided marginal emissions. Fixed charges, taxes, charging losses, other home loads, and AC savings are excluded. The fictional timeline has no calendar date or daylight-saving change.</p><p className="mt-2">The conversation uses deterministic intent rules and computed explanations. No paid LLM, external service, real-time device telemetry, or appliance commands are involved.</p></section>;
}

function Crew({ state, onSend, onCompare, onPreferences }: { state: HouseholdState; onSend: (text: string) => void; onCompare: () => void; onPreferences: () => void }) {
  function train(id: ApplianceId, lesson: boolean) {
    const now = new Date().toISOString();
    const key = lesson ? "lesson:cost-carbon" : `self-report:${now.slice(0,10)}`;
    updateHousehold(current => awardTraining(current, [id], key, lesson ? "Learned why cheaper electricity is not always cleaner." : "Self-reported a completed household action; no savings verified.", now));
  }
  return <section className="space-y-6" aria-labelledby="crew-title"><div><p className="eyebrow">A little practice, a little personality</p><h2 id="crew-title" className="mt-2 text-3xl font-semibold tracking-tight">Meet your home team.</h2><p className="mt-3 text-sm leading-6 text-stone-600">Teach preferences, explore plans, and save a feasible routine to help your crew learn. Levels unlock convenience; the full optimizer is always available.</p></div>
    <div className="grid gap-5 md:grid-cols-3">{applianceAgents.map(agent => {
      const progress = state.training[agent.id];
      const skills = unlockedSkills(progress, agent.id);
      const routine = skills.some(skill => skill.id === "routine");
      const nextThreshold = progress.level === 1 ? 50 : progress.level === 2 ? 100 : progress.level === 3 ? 175 : progress.xp;
      return <article key={agent.id} className="rounded-3xl border border-stone-200 bg-white/80 p-5"><div className="flex items-center justify-between"><Avatar role={agent.id} large/><span className="rounded-full bg-stone-100 px-3 py-1 text-xs">Level {progress.level}</span></div><h3 className="mt-4 text-2xl font-semibold">{agent.name}</h3><p className="mt-1 text-xs uppercase tracking-wider text-stone-500">{agent.role}</p><p className="mt-3 min-h-16 text-sm leading-6 text-stone-600">{agent.id === "evie" ? "Big plans. Bigger morning energy. I’ll find a charging window, but please don’t make me late." : agent.id === "bubbles" ? "A cooperative night owl with a flair for dramatic clean-ups. Your quiet hours? My new favorite rule." : "Calm, collected, and firmly on team comfort. I’m here to protect a livable home."}</p><div className="mt-4"><div className="mb-2 flex justify-between text-xs"><span>{progress.xp} XP</span><span>{progress.level < 4 ? `Next level: ${nextThreshold} XP` : "All convenience skills unlocked"}</span></div><progress aria-label={`${agent.name} training progress`} className="household-progress h-2 w-full" max={Math.max(nextThreshold,1)} value={progress.xp}/></div>
        <ul className="mt-4 space-y-3">{skills.map(skill => <li key={skill.id} className="text-xs leading-5"><strong className="text-emerald-900">✓ {skill.name}</strong><p className="text-stone-500">{skill.description}</p></li>)}</ul>
        {routine && <button type="button" onClick={() => onSend(agent.id === "chill" ? "Explain Chill's comfort protection" : "Plan using my preferences")} className="mt-4 w-full rounded-xl bg-emerald-900 p-3 text-sm font-semibold text-white">{agent.id === "chill" ? "Review comfort protection ↗" : "Use remembered routine ↗"}</button>}
        {skills.some(skill => skill.id === "tradeoffs") && <button type="button" onClick={onCompare} className="mt-3 w-full rounded-xl border border-emerald-800 p-3 text-sm font-semibold text-emerald-900">Compare my alternatives ↗</button>}
        {skills.some(skill => skill.id === "coordinator") && <button type="button" onClick={onPreferences} className="mt-3 w-full rounded-xl border border-emerald-800 p-3 text-sm font-semibold text-emerald-900">Review household routines ↗</button>}
        <details className="mt-5 border-t border-stone-200 pt-4"><summary className="cursor-pointer text-sm font-medium">Learn: price versus carbon</summary><p className="mt-3 text-xs leading-5 text-stone-600">A cheap hour can still have a carbon-intensive grid. Compare both objectives before choosing. Our carbon estimate is energy × synthetic grid intensity; it is not measured avoided emissions.</p><button type="button" onClick={() => train(agent.id,true)} className="mt-3 text-sm font-semibold text-emerald-900 underline underline-offset-4">Mark lesson learned</button></details>
        <button type="button" onClick={() => train(agent.id,false)} className="mt-4 text-xs font-medium text-emerald-900 underline underline-offset-4">Log a completed task (self-reported)</button><p className="mt-2 text-[11px] leading-4 text-stone-500">Once per day. No energy usage or savings are verified.</p>
        <details className="mt-4 border-t border-stone-200 pt-3"><summary className="cursor-pointer text-xs font-medium">Training history ({progress.history.length})</summary><ul className="mt-2 space-y-2 text-xs leading-5 text-stone-500">{progress.history.length ? progress.history.slice(-8).reverse().map(event => <li key={event.id}>+{event.xp} XP · {event.reason}</li>) : <li>No lessons yet. Start by teaching a preference or comparing a plan.</li>}</ul></details>
      </article>;
    })}</div>
  </section>;
}

export function HouseholdApp() {
  const snapshot = useHousehold();
  const { state, ready } = snapshot;
  const [view, setView] = useState<View>("parliament");
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const previousXp = useRef<Record<string,number> | null>(null);
  const [trainingNotice, setTrainingNotice] = useState("");
  const plan = useMemo(() => {
    const result = optimizeHousehold(state.requests, hourlyEnergy, state.mode, state.sharedPowerLimitKw ?? undefined);
    return state.proposalStatus === "pending" || state.proposalStatus === "approved" || result.status !== "feasible" ? result : null;
  },
  [state.requests,state.mode,state.sharedPowerLimitKw,state.proposalStatus]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [state.messages, view]);
  // Progress is an external store event; announce rewards without claiming energy use.
  useEffect(() => {
    if (!ready) return;
    const previous = previousXp.current;
    previousXp.current = Object.fromEntries(applianceAgents.map(agent => [agent.id,state.training[agent.id].xp]));
    if (!previous) return;
    const changed = applianceAgents.filter(agent => state.training[agent.id].xp > previous[agent.id]);
    if (changed.length) {
      const text = changed.map(agent => `${agent.name} gained ${state.training[agent.id].xp - previous[agent.id]} XP · level ${state.training[agent.id].level}`).join(". ");
      // An external-store change is announced after rendering; no derived state drives planning.
      const timer = setTimeout(() => setTrainingNotice(text), 0);
      return () => clearTimeout(timer);
    }
  }, [state.training, ready]);
  function send(text: string) {
    if (!text.trim() || !ready) return;
    updateHousehold(current => sendHouseholdMessage(current, text.trim(), new Date().toISOString()));
    setInput(""); setView("parliament");
  }
  function applySettings(requests: SchedulingRequest[], mode: OptimizationMode, limit: number | null) {
    updateHousehold(current => updateHouseholdSettings(current, requests, mode, limit, new Date().toISOString()));
    setView("parliament");
  }
  return <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-8">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 py-5"><Link href="/" className="flex items-center gap-2.5 text-xl font-bold tracking-tight"><span className="brand-mark" aria-hidden="true">⌂</span>housemates<span className="text-emerald-700">.</span></Link><div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-900">Simulated home · synthetic energy data</span><button type="button" onClick={() => resetDialog.current?.showModal()} className="text-xs font-medium text-stone-600 underline underline-offset-4">Reset Demo</button></div></header>
    <nav className="mt-5 flex flex-wrap gap-2" aria-label="Household views">{views.map(item => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)} className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${view === item.id ? "bg-emerald-900 text-white" : "bg-white/80 text-stone-600 hover:bg-stone-200"}`}>{item.name}</button>)}<Link href="/energy-parliament" className="self-center px-2 text-xs text-stone-500 underline underline-offset-4">Open scheduling lab ↗</Link></nav>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500"><span>Deterministic conversation · real scheduling calculations · no device connection</span><span>{snapshot.persistence === "saved" ? "Memory saved on this browser" : snapshot.persistence === "pending" ? "Loading local memory…" : "Session-only memory"}</span></div>
    {snapshot.notice && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{snapshot.notice}</p>}
    {trainingNotice && <div role="status" className="household-reward mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><span>✦ {trainingNotice}</span><button type="button" aria-label="Dismiss training update" onClick={() => setTrainingNotice("")} className="px-2 py-1">×</button></div>}
    <main className="mt-7" aria-busy={!ready}>
      {!ready ? <p className="p-8 text-center text-stone-500">Getting the household together…</p> : view === "parliament" ? <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-3xl border border-stone-200 bg-white/80" aria-labelledby="chat-title">
          <div className="border-b border-stone-200 bg-[#efefdf] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">Everyone gets a say</p><h1 id="chat-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Appliance Parliament</h1></div><div className="flex gap-1">{applianceAgents.map(agent => <Avatar key={agent.id} role={agent.id}/>)}</div></div><p className="mt-3 text-xs leading-5 text-stone-600">Tell us what needs to be ready, and when. We’ll work around your life.</p></div>
          <div ref={logRef} role="log" aria-label="Household conversation" aria-live="polite" aria-relevant="additions" className="household-chat-log h-[450px] space-y-5 overflow-y-auto overscroll-contain p-4 sm:h-[520px] sm:p-6">{state.messages.map(message => <article key={message.id} className={`flex items-start gap-2.5 ${message.role === "user" ? "flex-row-reverse" : ""}`}><Avatar role={message.role}/><div className={`min-w-0 max-w-[88%] rounded-2xl p-3.5 ${message.role === "user" ? "rounded-tr-sm bg-emerald-900 text-white" : message.role === "chill" ? "rounded-tl-sm bg-[#e8f0f1]" : message.role === "bubbles" ? "rounded-tl-sm bg-[#faf0df]" : message.role === "evie" ? "rounded-tl-sm bg-[#f0f2e4]" : "rounded-tl-sm bg-stone-100"}`}><h2 className={`mb-1 text-xs font-semibold ${message.role === "user" ? "text-emerald-100" : "text-stone-700"}`}>{names[message.role]}</h2><p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p></div></article>)}</div>
          <div className="border-t border-stone-200 bg-white p-4"><div className="mb-3 flex flex-wrap gap-2">{[{label:"Plan my morning",text:requiredRequest},{label:"Lower carbon",text:"Find a lower-carbon plan"},{label:"Quiet after 10pm",text:"I don't want the dishwasher running after 10 PM."},{label:"Revise",text:"Revise the plan"}].map(prompt => <button key={prompt.label} type="button" onClick={() => send(prompt.text)} className="rounded-full border border-stone-200 px-3 py-2 text-xs text-stone-600 hover:border-emerald-700">{prompt.label}</button>)}</div>
            <form onSubmit={event => {event.preventDefault();send(input);}} className="flex items-end gap-2"><label className="min-w-0 flex-1"><span className="sr-only">Message the household</span><textarea value={input} onChange={event => setInput(event.target.value)} maxLength={1000} rows={2} placeholder="EV by 7am. Dishes by 10pm. Let’s make a plan." className="w-full resize-y rounded-2xl border border-stone-300 bg-[#fafaf6] p-3 text-sm leading-6" onKeyDown={event => { if(event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault();send(input);} }}/></label><button type="submit" disabled={!input.trim()} className="mb-1 rounded-full bg-emerald-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Send</button></form><p className="mt-2 text-[10px] text-stone-500">Enter to send · Shift+Enter for a new line · whole-hour planning</p>
            <details className="mt-3 text-xs text-stone-500"><summary className="cursor-pointer">What can I ask?</summary><p className="mt-2 leading-5">Try “EV by 7am”, “dishwasher between 8pm and 10pm”, “minimize costs”, “lower carbon”, “balance cost and carbon”, “explain the calculations”, or “reject this plan”. For precise energy and power settings, use Preferences. Unclear requests get a clarification.</p></details>
          </div>
        </section>
        <div className="space-y-4"><Proposal state={state} plan={plan} onSend={send} onInspect={() => setView("schedule")}/><section className="rounded-2xl border border-stone-200 bg-white/70 p-5"><h2 className="text-sm font-semibold">What the household remembers</h2><p className="mt-3 text-xs leading-6 text-stone-600">Bubbles cutoff: {state.preferences.dishwasherCutoffHour === null ? "No taught cutoff yet" : planningTime(state.preferences.dishwasherCutoffHour)}<br/>Evie deadline: {state.preferences.evDeadlineHour === null ? "Default: Day 2 · 7am" : planningTime(state.preferences.evDeadlineHour)}<br/>{state.savedPlans.length} saved simulated {state.savedPlans.length === 1 ? "plan" : "plans"}</p><button type="button" onClick={() => setView("crew")} className="mt-3 text-xs font-semibold text-emerald-900 underline underline-offset-4">Meet the crew & see progress</button></section></div>
      </div> : view === "schedule" ? <PlanDetails state={state} plan={plan} onSend={send}/> : view === "crew" ? <Crew state={state} onSend={send} onCompare={() => setView("schedule")} onPreferences={() => setView("preferences")}/> : <div className="space-y-6"><HouseholdSettings key={planningFingerprint(state)} state={state} onApply={applySettings}/><section className="rounded-2xl border border-stone-200 bg-white/70 p-5"><h2 className="text-lg font-semibold">Saved simulated plans</h2><p className="mt-2 text-xs leading-5 text-stone-500">Saved inputs are validated and recalculated. Using a saved plan replaces your current planning preferences and creates a new proposal; it never controls appliances.</p>{state.savedPlans.length ? <ul className="mt-4 space-y-3">{state.savedPlans.slice().reverse().map((saved,index) => {
        const result = optimizeHousehold(saved.requests,hourlyEnergy,saved.mode,saved.sharedPowerLimitKw ?? undefined);
        return <li key={saved.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 p-3"><div><p className="text-sm font-medium">Saved plan {state.savedPlans.length-index} · {objectiveNames[saved.mode]}</p><p className="mt-1 text-xs text-stone-500">{result.proposed ? `${currency(result.proposed.costUsd)} · ${kg(result.proposed.carbonGrams)}` : "No longer feasible"}</p></div><button type="button" onClick={() => applySettings(structuredClone(saved.requests),saved.mode,saved.sharedPowerLimitKw)} className="text-xs font-semibold text-emerald-900 underline underline-offset-4">Use these saved settings</button></li>;
      })}</ul> : <p className="mt-4 text-sm text-stone-500">Approve a feasible proposal to save your first plan.</p>}</section><DataExplanation/></div>}
    </main>
    <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t border-stone-200 pt-5 text-xs text-stone-500"><span>Made for Stanford CleanTech · Local hackathon prototype</span><span>Your home. Your constraints. Your decision.</span></footer>
    <dialog ref={resetDialog} aria-labelledby="reset-demo-title" aria-describedby="reset-demo-description" className="household-dialog m-auto w-[min(90vw,420px)] rounded-3xl border border-stone-200 bg-[#f8f8f2] p-6 text-stone-800"><h2 id="reset-demo-title" className="text-xl font-semibold">Reset this demo?</h2><p id="reset-demo-description" className="mt-3 text-sm leading-6 text-stone-600">This clears Housemates conversations, preferences, saved simulated plans, and training in this browser. It does not affect other sites.</p><form method="dialog" className="mt-6 flex flex-wrap gap-3"><button className="rounded-full border border-stone-300 px-5 py-2.5 text-sm">Keep my household</button><button type="button" className="rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-semibold text-white" onClick={() => {resetHousehold();setInput("");setTrainingNotice("");previousXp.current=null;setView("parliament");resetDialog.current?.close();}}>Reset household</button></form></dialog>
  </div>;
}
