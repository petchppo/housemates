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
import { HouseholdWorld } from "./household-world";
import { PhoneStory } from "./phone-story";
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
  return <section className="hh-proposal rounded-3xl border border-[#d2ddc7] bg-[#eef2e6] p-5 sm:p-6" aria-labelledby="proposal-title">
    <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">QUEST LOG / ENERGY PLAN</p><h2 id="proposal-title" tabIndex={-1} className="mt-2 text-xl font-semibold">Your energy quest</h2></div><span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider">{state.proposalStatus === "approved" ? "Saved" : feasible ? "For review" : "Not approved"}</span></div>
    {!plan ? <><p className="mt-5 text-sm leading-6 text-stone-600">{state.proposalStatus === "rejected" ? "That proposal was rejected. Your preferences are still remembered. Ask for a revision whenever you’re ready." : "Run a simulated morning plan to search feasible hours. You can review the real calculations, adjust your preferences, and decide what to save."}</p><button type="button" onClick={() => onSend(requiredRequest)} className="mt-5 rounded-full bg-emerald-900 px-5 py-3 text-sm font-semibold text-white">Ask for a plan ↗</button></> : !feasible ? <div role="status" className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-950"><p className="font-semibold">These constraints need a rethink.</p><ul className="mt-2 space-y-2">{plan.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul><p className="mt-3">No complete plan or savings claim is available. Adjust a deadline or window, then ask again.</p></div> : <>
      <p className="mt-3 text-xs text-stone-600">{objectiveNames[state.mode]} · {plan.proposed?.energyKwh.toFixed(2)} kWh across Evie + Bubbles</p>
      <div className="hh-sessions mt-5 gap-3">{plan.schedules.map(schedule => <div key={schedule.applianceId} className="flex gap-3 rounded-2xl bg-white/80 p-3"><Avatar role={schedule.applianceId}/><div className="min-w-0"><h3 className="text-sm font-semibold">{names[schedule.applianceId]}</h3><p className="mt-1 text-xs leading-5 text-stone-600">{planningTime(schedule.startHour)}<br/>to {planningTime(schedule.endHour)}</p><p className="mt-2 text-xs font-medium">{currency(schedule.costUsd)} · {kg(schedule.carbonGrams)}</p></div></div>)}</div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-stone-300/60 pt-4"><div><p className="text-xs text-stone-600">COIN SAVE · estimated USD</p><p className="mt-2 text-2xl font-semibold text-emerald-950">{plan.comparison ? signedCost(plan.comparison.costSavingsUsd) : "Unavailable"}</p></div><div><p className="text-xs text-stone-600">CARBON SAVE · modeled CO₂e</p><p className="mt-2 text-lg font-semibold text-emerald-950">{plan.comparison ? signedCarbon(plan.comparison.carbonReductionGrams) : "Unavailable"}</p></div></div>
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
    <div><p className="eyebrow">See the work behind the words</p><h2 id="plan-details-title" className="mt-2 text-3xl font-semibold tracking-tight">Quest stats & strategy.</h2><p className="mt-3 text-sm leading-6 text-stone-600">Calculated from complete appliance sessions and each hour’s synthetic rate. The original starts remain fixed; no savings are hardcoded.</p></div>
    {!plan && <p className="rounded-2xl bg-amber-50 p-4 text-sm">Request a new plan in Parliament to see its original and proposed schedules here.</p>}
    <div className="flex flex-wrap gap-4"><label className="text-sm font-medium">Appliance <select className="ml-2 rounded-lg border border-stone-300 bg-white p-2" value={selected} onChange={e => setSelected(Number(e.target.value))}>{state.requests.map((r, index) => <option value={index} key={r.appliance.id}>{r.appliance.name}</option>)}</select></label><span className="self-center text-xs text-stone-500">{state.sharedPowerLimitKw === null ? "No shared power cap" : `${state.sharedPowerLimitKw} kW shared cap configured`}</span></div>
    {baseline && proposed && <div className="grid gap-4 sm:grid-cols-2">{[{title:"Original",schedule:baseline},{title:"Proposed",schedule:proposed}].map(({title,schedule}) => <section key={title} className="rounded-2xl border border-stone-200 bg-white/80 p-5"><h3 className="font-semibold">{title}</h3><p className="mt-3 text-sm leading-6">{planningTime(schedule.startHour)} → {planningTime(schedule.endHour)}</p><p className="mt-3 text-2xl font-semibold">{currency(schedule.costUsd)}</p><p className="mt-1 text-sm">{kg(schedule.carbonGrams)}</p><p className="mt-3 text-xs text-stone-500">{schedule.energyKwh.toFixed(2)} kWh · {schedule.powerKw.toFixed(2)} kW peak modeled power</p></section>)}</div>}
    <EnergyTimeline original={baseline} optimized={proposed} day={day} onDayChange={setDay}/>
    <section className="rounded-2xl border border-stone-200 bg-white/80 p-5"><h3 className="text-lg font-semibold">Choose your quest strategy</h3><p className="mt-2 text-xs leading-5 text-stone-500">Each option below is a separate feasible household search using your current constraints. Choosing one creates a new proposal for approval.</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{alternatives.map(({mode,result}) => <button key={mode} type="button" onClick={() => onSend(mode === "cost" ? "Minimize my energy costs" : mode === "carbon" ? "Find a lower-carbon plan" : "Balance cost and carbon")} className="rounded-2xl border border-stone-200 bg-[#f6f7ef] p-4 text-left hover:border-emerald-700"><span className="block font-semibold">{objectiveNames[mode]}</span><span className="mt-3 block text-xl">{result.proposed ? currency(result.proposed.costUsd) : "Infeasible"}</span><span className="mt-1 block text-xs">{result.proposed ? kg(result.proposed.carbonGrams) : "Adjust your constraints"}</span><span className="mt-4 block text-xs font-semibold text-emerald-900">Propose this objective ↗</span></button>)}</div></section>
    {plan && <details className="rounded-2xl border border-stone-200 p-5"><summary className="cursor-pointer font-semibold">Recommendation reasons & assumptions</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-stone-600">{[...plan.reasons,...plan.assumptions].map((text,index) => <li key={index}>{text}</li>)}</ul></details>}
    <DataExplanation/>
  </section>;
}

function DataExplanation() {
  return <section className="rounded-2xl bg-[#ecefe7] p-5 text-sm leading-6 text-stone-600"><h3 className="font-semibold text-stone-800">Real calculations. A clearly simulated household.</h3><p className="mt-2">We use a fictional California weekday repeated across a 48-hour horizon. Prices are USD/kWh; grid intensity is stored in g CO₂e/kWh and converted to kg for displayed totals. Hourly energy × rate is summed across the complete session.</p><p className="mt-2">Carbon differences are modeled average-intensity estimates, not measured or necessarily avoided marginal emissions. Fixed charges, taxes, charging losses, other home loads, and AC savings are excluded. The fictional timeline has no calendar date or daylight-saving change.</p><p className="mt-2">The interactive scene uses local placeholder replies while the API is disconnected. Simulation buttons use deterministic intent rules and computed explanations. The phone conversation is scripted. No external service, real-time telemetry, or appliance commands are involved.</p></section>;
}

function Crew({ state, onSend, onCompare, onPreferences }: { state: HouseholdState; onSend: (text: string) => void; onCompare: () => void; onPreferences: () => void }) {
  function train(id: ApplianceId, lesson: boolean) {
    const now = new Date().toISOString();
    const key = lesson ? "lesson:cost-carbon" : `self-report:${now.slice(0,10)}`;
    updateHousehold(current => awardTraining(current, [id], key, lesson ? "Learned why cheaper electricity is not always cleaner." : "Self-reported a completed household action; no savings verified.", now));
  }
  return <section className="space-y-6" aria-labelledby="crew-title"><div><p className="eyebrow">A little practice, a little personality</p><h2 id="crew-title" className="mt-2 text-3xl font-semibold tracking-tight">Meet your party.</h2><p className="mt-3 text-sm leading-6 text-stone-600">Teach preferences, explore plans, and save a feasible routine to help your crew learn. Levels unlock convenience; the full optimizer is always available.</p></div>
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
  const [worldRevision, setWorldRevision] = useState(0);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const previousXp = useRef<Record<string,number> | null>(null);
  const [trainingNotice, setTrainingNotice] = useState("");
  const plan = useMemo(() => {
    const result = optimizeHousehold(state.requests, hourlyEnergy, state.mode, state.sharedPowerLimitKw ?? undefined);
    return state.proposalStatus === "pending" || state.proposalStatus === "approved" || result.status !== "feasible" ? result : null;
  },
  [state.requests,state.mode,state.sharedPowerLimitKw,state.proposalStatus]);
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
    setView("parliament");
  }
  function applySettings(requests: SchedulingRequest[], mode: OptimizationMode, limit: number | null) {
    updateHousehold(current => updateHouseholdSettings(current, requests, mode, limit, new Date().toISOString()));
    setView("parliament");
  }
  return <div className="hh-shell">
    <header className="hh-header"><Link href="/" className="hh-brand" aria-label="Housemates home"><span className="hh-brand-icon" aria-hidden="true">⌂</span>housemates<small>™</small></Link><div className="hh-header-meta"><span className="hh-edition"><span className="hh-status-dot"/>Stanford CleanTech / Demo edition</span><button type="button" onClick={() => resetDialog.current?.showModal()} className="hh-reset">Reset Demo</button></div></header>
    <nav className="hh-nav" aria-label="Household views">{views.map((item,index) => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)}><span aria-hidden="true">0{index+1}</span>{item.name}</button>)}<Link href="/energy-parliament" className="hh-lab-link">Scheduling lab ↗</Link></nav>
    <div className="hh-memory-bar"><span>SIMULATED HOME · SYNTHETIC RATES · REAL CALCULATIONS</span><strong>{snapshot.persistence === "saved" ? "● Memory saved on this browser" : snapshot.persistence === "pending" ? "Loading local memory…" : "Session-only memory"}</strong></div>
    {snapshot.notice && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{snapshot.notice}</p>}
    {trainingNotice && <div role="status" className="household-reward mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><span>✦ {trainingNotice}</span><button type="button" aria-label="Dismiss training update" onClick={() => setTrainingNotice("")} className="px-2 py-1">×</button></div>}
    <main className={view === "parliament" ? "" : "hh-secondary"} aria-busy={!ready}>
      {!ready ? <p className="p-8 text-center text-stone-500">Getting the household together…</p> : view === "parliament" ? <>
        <div className="hh-intro"><div><p className="hh-kicker">PRESS PLAY / A HOUSEHOLD ADVENTURE</p><h1>Your home has<br/><em>a life of its own.</em></h1></div><p>Scroll through a day in your world. Drag to turn the view.<br/>Run an energy quest, meet your party, and watch the simulated day unfold.</p></div>
        <div className="hh-play-sequence">
          <section className="hh-stage" aria-label="Interactive household"><HouseholdWorld key={worldRevision} plan={plan} training={state.training} onAction={send} onInspect={() => setView("schedule")}/></section>
          <PhoneStory/>
          <section className="hh-mission" aria-label="Calculated household plan"><Proposal state={state} plan={plan} onSend={send} onInspect={() => setView("schedule")}/><aside className="hh-memory-card"><p className="hh-kicker">YOUR HOUSEHOLD SAVE FILE</p><h2>Your save slots.</h2><p className="mt-4">Bubbles cutoff: {state.preferences.dishwasherCutoffHour === null ? "No taught cutoff yet" : planningTime(state.preferences.dishwasherCutoffHour)}<br/>Evie deadline: {state.preferences.evDeadlineHour === null ? "Default: Day 2 · 7am" : planningTime(state.preferences.evDeadlineHour)}<br/>{state.savedPlans.length} saved simulated {state.savedPlans.length === 1 ? "plan" : "plans"}</p><button type="button" onClick={() => setView("crew")}>Meet the crew & see progress ↗</button><details><summary>Planning history & calculation notes</summary><p tabIndex={0} role="region" aria-label="Saved planning conversation">{state.messages.map(message => `${names[message.role]}: ${message.text}`).join("\n\n")}</p></details><button type="button" onClick={() => send("Revise the plan")}>Recalculate using current preferences ↗</button></aside></section>
        </div>
      </> : view === "schedule" ? <PlanDetails state={state} plan={plan} onSend={send}/> : view === "crew" ? <Crew state={state} onSend={send} onCompare={() => setView("schedule")} onPreferences={() => setView("preferences")}/> : <div className="space-y-6"><HouseholdSettings key={planningFingerprint(state)} state={state} onApply={applySettings}/><section className="rounded-2xl border border-stone-200 bg-white/70 p-5"><h2 className="text-lg font-semibold">Saved simulated plans</h2><p className="mt-2 text-xs leading-5 text-stone-500">Saved inputs are validated and recalculated. Using a saved plan replaces your current planning preferences and creates a new proposal; it never controls appliances.</p>{state.savedPlans.length ? <ul className="mt-4 space-y-3">{state.savedPlans.slice().reverse().map((saved,index) => {
        const result = optimizeHousehold(saved.requests,hourlyEnergy,saved.mode,saved.sharedPowerLimitKw ?? undefined);
        return <li key={saved.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 p-3"><div><p className="text-sm font-medium">Saved plan {state.savedPlans.length-index} · {objectiveNames[saved.mode]}</p><p className="mt-1 text-xs text-stone-500">{result.proposed ? `${currency(result.proposed.costUsd)} · ${kg(result.proposed.carbonGrams)}` : "No longer feasible"}</p></div><button type="button" onClick={() => applySettings(structuredClone(saved.requests),saved.mode,saved.sharedPowerLimitKw)} className="text-xs font-semibold text-emerald-900 underline underline-offset-4">Use these saved settings</button></li>;
      })}</ul> : <p className="mt-4 text-sm text-stone-500">Approve a feasible proposal to save your first plan.</p>}</section><DataExplanation/></div>}
    </main>
    <footer className="hh-footer"><span><strong>housemates.</strong> A small world with a lighter footprint.</span><span>BUILT FOR STANFORD CLEANTECH · NO DEVICES CONNECTED</span></footer>
    <dialog ref={resetDialog} aria-labelledby="reset-demo-title" aria-describedby="reset-demo-description" className="household-dialog m-auto w-[min(90vw,420px)] rounded-3xl border border-stone-200 bg-[#f8f8f2] p-6 text-stone-800"><h2 id="reset-demo-title" className="text-xl font-semibold">Reset this demo?</h2><p id="reset-demo-description" className="mt-3 text-sm leading-6 text-stone-600">This clears Housemates conversations, preferences, saved simulated plans, and training in this browser. It does not affect other sites.</p><form method="dialog" className="mt-6 flex flex-wrap gap-3"><button className="rounded-full border border-stone-300 px-5 py-2.5 text-sm">Keep my household</button><button type="button" className="rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-semibold text-white" onClick={() => {resetHousehold();setWorldRevision(value => value + 1);setTrainingNotice("");previousXp.current=null;setView("parliament");resetDialog.current?.close();}}>Reset household</button></form></dialog>
  </div>;
}
