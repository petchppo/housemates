"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { APPLIMON_CATALOG, getApplimon, type ApplimonDevice, type ApplimonId } from "@/domain/applimon-catalog";
import { getApplimonSimulationStats, optimizeApplimonTeam, type ApplimonTeamPlan } from "@/domain/applimon-planning";
import { parseHouseholdIntent } from "@/domain/conversation";
import { formatDemoHour } from "@/domain/demo";
import type { HourlyEnergy } from "@/domain/energy";
import type { OptimizationMode } from "@/domain/scheduling";
import { ApplimonSprite } from "./applimon-sprite";
import { useCharacterDialogue } from "./use-character-dialogue";
import "./applimon-team-panel.css";

type Props = { devices: readonly ApplimonDevice[]; energyProfile: readonly HourlyEnergy[]; onEdit: () => void; onActiveChange: (ids: ApplimonId[]) => void; active?: boolean };

/** Changing reviewed passports or rates remounts this session and invalidates its approval. */
export function ApplimonTeamPanel(props: Props) {
  return <TeamSession key={JSON.stringify([props.devices, props.energyProfile])} {...props}/>;
}

function TeamSession({ devices, energyProfile, onEdit, onActiveChange, active = true }: Props) {
  const [requests, setRequests] = useState<ApplimonDevice[]>(()=>structuredClone([...devices]));
  const [mode, setMode] = useState<OptimizationMode>("cost");
  const [selected, setSelected] = useState<ApplimonId>(devices[0]?.id ?? "spin");
  const [text, setText] = useState("");
  const [reply, setReply] = useState("Choose a teammate and say hello. Every plan uses your reviewed energy and operating window. Nothing runs until you approve.");
  const [approved, setApproved] = useState<ApplimonTeamPlan | null>(null);
  const [hour, setHour] = useState(0);
  const [running, setRunning] = useState(false);
  const plan = useMemo(()=>optimizeApplimonTeam(requests,energyProfile,mode),[requests,energyProfile,mode]);
  const selectedEntry = getApplimon(selected);
  const currentPlan = approved ?? plan;
  const schedules = approved ? [...approved.schedules,...approved.unchangedSchedules] : [];
  const stats = getApplimonSimulationStats(schedules,hour);
  const end = approved ? Math.max(0,...schedules.map(row=>row.endHour)) : 0;
  const complete = !!approved && hour >= end;
  const dialogue = useCharacterDialogue(selected, `${approved ? "approved" : "planning"}:${running}:${complete}`, active);
  const activeKey = Object.values(stats).filter(row=>row?.status==="active").map(row=>row!.applianceId).sort().join(",");
  const activeCallback = useRef(onActiveChange);
  useEffect(()=>{activeCallback.current=onActiveChange;},[onActiveChange]);
  useEffect(()=>{activeCallback.current(activeKey ? activeKey.split(",") as ApplimonId[] : []);return()=>activeCallback.current([]);},[activeKey]);
  useEffect(()=>{
    if (!running || complete) return;
    const tick=window.setInterval(()=>{if(!document.hidden)setHour(value=>Math.min(end,value+.2));},500);
    const hide=()=>{if(document.hidden)setRunning(false);};
    document.addEventListener("visibilitychange",hide);
    return()=>{window.clearInterval(tick);document.removeEventListener("visibilitychange",hide);};
  },[running,complete,end]);

  function describe(next: ApplimonTeamPlan) {
    if(next.status!=="feasible")return `That move cannot fit yet. ${next.issues.join(" ")} Revise the window or review the specs.`;
    const own=next.schedules.find(row=>row.applianceId===selected);
    if(!own)return selectedEntry.guidance;
    return `${selectedEntry.name} used ${next.mode==="carbon"?"Clean Shift":next.mode==="balanced"?"Balance":"Smart Timing"}! My proposed task is ${formatDemoHour(own.startHour)} → ${formatDemoHour(own.endHour)}: ${own.energyKwh.toFixed(2)} kWh, $${own.costUsd.toFixed(2)}, ${(own.carbonGrams/1000).toFixed(3)} kg modeled CO₂e. This is a projection; review the party plan below before approving.`;
  }
  function command(input:string) {
    const clean=input.trim(); if(!clean)return;
    const respond = (value: string) => { setReply(value); return value; };
    if(/^(approve|start|run it|go ahead)[.!\s]*$/i.test(clean))return respond("Choose Approve party simulation below after reviewing the plan. A message never starts a task by itself.");
    const mentioned = APPLIMON_CATALOG.filter(entry=>new RegExp(`\\b${entry.name}\\b`,"i").test(clean));
    if(mentioned.some(entry=>entry.id!==selected))return respond(`You are speaking to ${selectedEntry.name}. Select the named teammate first; I have not changed this plan.`);
    if(/\b(status|progress|done)\b/i.test(clean)){
      const reading=stats[selected];
      return respond(reading?`${selectedEntry.name}: ${reading.status}. ${reading.completedEnergyKwh.toFixed(2)} / ${reading.totalEnergyKwh.toFixed(2)} kWh and $${reading.accruedCostUsd.toFixed(2)} accrued in this simulation. No physical device is connected.`:`${selectedEntry.name}: ${selectedEntry.guidance} ${approved?"No shifting task is assigned to me.":"No approved party task is running."}`);
    }
    if(approved)return respond("This approved party run is fixed. Start a new party plan before changing its settings.");
    if(selectedEntry.schedulingPolicy!=="flexible")return respond(`${selectedEntry.name}: ${selectedEntry.guidance} My protected/fixed routine cannot be shifted for savings.`);
    // Reuse the existing bounded time parser, translating the selected character into a cycle subject.
    const names=/\b(Spin|Tumble|Ember|Misty|Rover|Frost|Breeze)\b/gi;
    const intent=parseHouseholdIntent(`Bubbles ${clean.replace(names,"")}`, { dayConvention: "day-one" });
    if(intent.kind!=="plan")return respond(`No planning change was made. For a computed plan, try “find a cheaper plan”, “lower carbon”, “finish by 10 PM”, “start between 9 AM and 4 PM”, or “status”. Times without a day mean Day 1; an overnight window ends on Day 2.`);
    const nextMode=intent.mode??mode;
    const next=requests.map(device=>{
      if(device.id!==selected)return device;
      const change=intent.changes.find(item=>item.applianceId==="bubbles");
      return change?{...device,...(change.earliestHour!==undefined?{earliestStartHour:change.earliestHour}:{}),...(change.latestHour!==undefined?{latestStartHour:change.latestHour}:{}),...(change.deadlineHour!==undefined?{deadlineHour:change.deadlineHour}:{})}:device;
    });
    setMode(nextMode);setRequests(next);return respond(describe(optimizeApplimonTeam(next,energyProfile,nextMode)));
  }
  function dispatch(input: string) { if (!active || !input.trim() || input.length > 1200) return; const local = command(input); if (typeof local === "string") void dialogue.request(input, local); }
  function send(event:FormEvent){event.preventDefault();dispatch(text);setText("");}
  function approve(){const checked=optimizeApplimonTeam(requests,energyProfile,mode);if(checked.status!=="feasible"||!checked.schedules.length)return;dialogue.clear();setApproved(checked);setHour(0);setRunning(true);setReply("Party plan approved. The simulated clock is running; each task starts only at its scheduled time. These results stay in this tab and are not real device activity.");}
  const executed=approved?.schedules.reduce((sum,schedule)=>{const row=stats[schedule.applianceId];return {energy:sum.energy+(row?.completedEnergyKwh??0),cost:sum.cost+(row?.accruedCostUsd??0),carbon:sum.carbon+(row?.accruedCarbonGrams??0)};},{energy:0,cost:0,carbon:0});

  return <section className="applimon-party-panel" aria-label="Expanded Applimon party">
    <header><div><p className="party-kicker">YOUR EXPANDED PARTY / REVIEWED SPECS</p><h2>Talk to your teammates.</h2><p>These additional jobs are separate from Evie and Bubbles above. No load or savings is counted twice.</p></div><button type="button" onClick={onEdit}>Recruit / edit specs</button></header>
    {!devices.length?<p className="party-empty">Recruit Spin, Tumble, Misty or Rover for flexible tasks—or meet our protected and fixed-routine teammates.</p>:<>
      <div className="party-select" aria-label="Choose an expanded teammate">{devices.map(device=>{const entry=getApplimon(device.id);return <button key={device.id} type="button" aria-pressed={selected===device.id} onClick={()=>{dialogue.clear();setSelected(device.id);setReply(`${entry.name}: ${entry.guidance}`);}}><ApplimonSprite id={device.id}/><span><strong>{entry.name}</strong><small>{entry.category}</small><em>{entry.schedulingPolicy.toUpperCase()}</em></span></button>;})}</div>
      <div className="party-dialogue"><ApplimonSprite id={selected}/><div><strong>{selectedEntry.name.toUpperCase()}</strong><small className="party-ai-label">{dialogue.loading ? "AI thinking · simulated" : dialogue.reply ? "AI dialogue · simulated" : dialogue.notice || dialogue.status === "unconfigured" ? "Local fallback · simulated" : dialogue.status === "checking" ? "Checking AI · local planner ready" : "Local reply · AI ready"}</small><p role="status">{dialogue.loading ? `${selectedEntry.name} is thinking…` : dialogue.reply ?? reply}</p>{dialogue.notice && <p className="party-ai-notice" role="status">{dialogue.notice}</p>}<details className="party-planner-details"><summary>Chat options</summary><strong>Planner details</strong><p>{reply}</p><small>These calculated facts remain authoritative. AI dialogue cannot approve or alter this plan.</small>{dialogue.history.length > 0 && <details className="party-ai-history"><summary>Conversation with {selectedEntry.name}</summary><div role="log" aria-label={`${selectedEntry.name} conversation`}>{dialogue.history.map((message,index)=><article key={index} className={message.role === "user" ? "party-chat-user" : "party-chat-assistant"}><strong>{message.role === "user" ? "You" : selectedEntry.name}</strong><p>{message.text}</p></article>)}</div><p>Conversation stays in this tab and is cleared when you change teammates or close this panel.</p></details>}</details></div></div>
      <p className="party-ai-disclosure" id="party-ai-disclosure">{dialogue.status === "configured" ? "Send shares your text, planner details and recent chat with OpenAI; API charges may apply. The AI request contains no photos or audio. Plans still require explicit approval." : "When AI is unavailable, the same Send button uses local planner replies. No model dialogue is invented."}</p>
      <form onSubmit={send} className="party-composer"><label htmlFor="party-message">Talk to {selectedEntry.name}</label><div><input id="party-message" value={text} maxLength={1200} placeholder={`Say hello to ${selectedEntry.name}…`} onChange={event=>setText(event.target.value)}/><button type="submit" disabled={!text.trim() || !active} aria-describedby="party-ai-disclosure">Send</button></div></form>
      <div className="party-plan"><p className="party-kicker">{approved?complete?"COMPLETED SIMULATION":"APPROVED PARTY RUN":"PROJECTED PARTY PLAN"} / {currentPlan.mode.toUpperCase()}</p>
        {currentPlan.status!=="feasible"?<p role="alert">{currentPlan.issues.join(" ")}</p>:currentPlan.schedules.length?<><div className="party-totals"><p><small>Original flexible jobs</small><strong>${currentPlan.baseline?.costUsd.toFixed(2)??"—"}</strong></p><p><small>Proposed flexible jobs</small><strong>${currentPlan.proposed?.costUsd.toFixed(2)??"—"}</strong></p><p><small>Modeled carbon</small><strong>{((currentPlan.proposed?.carbonGrams??0)/1000).toFixed(3)} kg</strong></p></div>{currentPlan.comparison&&<p>Estimated {currentPlan.comparison.costSavingsUsd>=0?"cost reduction":"cost increase"}: ${Math.abs(currentPlan.comparison.costSavingsUsd).toFixed(2)} · carbon {currentPlan.comparison.carbonReductionGrams>=0?"reduction":"increase"}: {(Math.abs(currentPlan.comparison.carbonReductionGrams)/1000).toFixed(3)} kg.</p>}<ul>{currentPlan.schedules.map(row=><li key={row.applianceId}><ApplimonSprite id={row.applianceId}/><span><b>{getApplimon(row.applianceId).name}</b> · {formatDemoHour(row.startHour)} → {formatDemoHour(row.endHour)}<small>{row.energyKwh.toFixed(2)} kWh · ${row.costUsd.toFixed(2)} · {approved?`${stats[row.applianceId]?.status} / ${(stats[row.applianceId]?.progressPercent??0).toFixed(0)}% simulated`:"projection only"}</small></span></li>)}</ul></>:<p>No flexible task is selected. Fixed and protected appliances contribute no shifting savings.</p>}
        {currentPlan.unchangedSchedules.length>0&&<p>Fixed routines unchanged: {currentPlan.unchangedSchedules.map(row=>`${getApplimon(row.applianceId).name} $${row.costUsd.toFixed(2)}`).join(", ")}. Excluded from savings.</p>}
        {currentPlan.protectedIds.length>0&&<p>Protected: {currentPlan.protectedIds.map(id=>getApplimon(id).name).join(", ")}. No off commands or optimized savings.</p>}
        {!approved?<button type="button" disabled={plan.status!=="feasible"||!plan.schedules.length} onClick={approve}>Approve party simulation</button>:<><p><b>{formatDemoHour(hour)}</b> · {executed?.energy.toFixed(2)} kWh executed · ${executed?.cost.toFixed(2)} accrued · {((executed?.carbon??0)/1000).toFixed(3)} kg modeled CO₂e. {complete?"Tasks completed in simulation only.":"One simulated hour takes 2.5 seconds."}</p>{!complete&&<><button type="button" onClick={()=>{dialogue.clear();setRunning(value=>!value);}}>{running?"Pause party simulation":"Resume party simulation"}</button><button type="button" onClick={()=>{dialogue.clear();setHour(end);setRunning(false);}}>Finish simulated tasks</button></>}<button type="button" onClick={()=>{dialogue.clear();setApproved(null);setHour(0);setRunning(false);setReply("Choose your next move and review a fresh projection.");}}>New party plan</button></>}
      </div>
      <details><summary>Reviewed passports & model limits</summary>{requests.map(device=><p key={device.id}>{getApplimon(device.id).name}: {device.ratedPowerW} W rating; {device.energyKwh} kWh / {device.durationHours.toFixed(2)} h task; starts {device.earliestStartHour}–{device.latestStartHour}, finishes by hour {device.deadlineHour}. Source: {device.specSource}; {device.energyBasis}.</p>)}<ul>{plan.assumptions.map(line=><li key={line}>{line}</li>)}</ul><p>Party chat revisions and execution are session-only. Reviewed appliance passports persist in your household. A reload requires a new approval.</p></details>
    </>}
  </section>;
}
