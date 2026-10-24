"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ApplianceId } from "@/domain/appliances";
import type { HouseholdPlan } from "@/domain/scheduling";
import type { HouseholdState } from "@/domain/household";
import { getSimulationStats } from "@/domain/simulation";
import { HouseholdScene3D } from "./household-scene-3d";
import { PixelAppliance } from "./pixel-appliance";
import { ScrollStage } from "./scroll-stage";
import "./household-world.css";

const morningRequest = "I need my EV charged by 7 AM and my dishes finished before breakfast. Minimize my energy costs.";
const crew = [
  { id:"evie", name:"Evie", title:"THE EARLY BIRD", line:"Ready for the next adventure.", description:"An ambitious EV with a morning deadline. My charging quest is powered by your actual energy plan." },
  { id:"bubbles", name:"Bubbles", title:"THE CLEANUP CREW", line:"A fresh start, one cycle at a time.", description:"One uninterrupted cycle. A spotless finish. Your quiet hours always belong in my quest log." },
  { id:"chill", name:"Chill", title:"THE COMFORT GUARD", line:"Rest easy. I’m on comfort duty.", description:"My nighttime sleep is character animation only. AC operation stays outside the optimizer; no temperature or AC savings is inferred." },
] as const;
function clockLabel(hour:number) {
  const minute = Math.floor((hour % 24) * 60);
  return `${hour >= 48 ? "END" : `DAY ${Math.floor(hour / 24)+1}`} · ${String(Math.floor(minute / 60)).padStart(2,"0")}:${String(minute % 60).padStart(2,"0")}`;
}

export function HouseholdWorld({ onAction, onInspect, plan, training }: {
  onAction:(text:string)=>void; onInspect:()=>void; plan:HouseholdPlan|null; training:HouseholdState["training"];
}) {
  const [selected,setSelected] = useState<ApplianceId>("evie");
  const [hour,setHour] = useState(8);
  const [followScroll,setFollowScroll] = useState(true);
  const syncScrollClock = useCallback((progress:number, staticMode:boolean)=>{
    if (followScroll && !staticMode) setHour(8 + progress * 24);
  },[followScroll]);
  const [playing,setPlaying] = useState(false);
  const [draft,setDraft] = useState("");
  const [submitted,setSubmitted] = useState<string|null>(null);
  const [notice,setNotice] = useState("");
  const running = playing && hour < 48;
  const schedules = useMemo(()=>plan?.status === "feasible" ? plan.schedules : [],[plan]);
  const stats = useMemo(()=>getSimulationStats(schedules,hour),[schedules,hour]);
  const activeIds = Object.values(stats).filter(item=>item.status === "active").map(item=>item.applianceId);
  const night = hour % 24 >= 20 || hour % 24 < 6;
  const active = crew.find(item=>item.id === selected)!;
  useEffect(()=>{
    if (!running) return;
    const timer = setInterval(()=>{ if(!document.hidden) setHour(value=>Math.min(48,value+0.0625)); },250);
    return ()=>clearInterval(timer);
  },[running]);
  function submit(event:FormEvent) { event.preventDefault(); if(!draft.trim()) return; setSubmitted(draft.trim()); setDraft(""); }
  function run(text:string) { onAction(text); setNotice("Quest recalculated. Inspect your plan below, or press Jump to job to watch its simulated run."); }
  return <section className="hw-world" aria-label="Playable household and simulated stats">
    <ScrollStage label="Explore the 3D household" travel={1.6} onProgress={syncScrollClock}>{progress=><div className={`hw-game-panel${night ? " hw-night" : ""}`}>
      <div className="hw-game-top"><div><span className="hw-kicker">WORLD 01 / SIMULATION</span><h2>Your home, in play.</h2></div></div>
      <div className="hw-clock"><output aria-label="Simulation clock" aria-live="off">{clockLabel(hour)}</output><div className="hw-clock-buttons"><button type="button" onClick={()=>{ setFollowScroll(false); if(hour>=48) {setHour(0);setPlaying(true);} else setPlaying(value=>!value); }} aria-label={running ? "Pause simulation" : "Play simulation"}>{running ? "Ⅱ Pause" : "▶ Play"}</button><button type="button" onClick={()=>{setFollowScroll(false);setPlaying(false);setHour(night?12:22);}}>{night ? "☀ Day" : "☾ Night"}</button><button type="button" disabled={!schedules.length} onClick={()=>{setFollowScroll(false);setHour(Math.min(...schedules.map(s=>s.startHour))+.1);setPlaying(false);}}>Jump to job</button><button type="button" aria-pressed={followScroll} onClick={()=>{setPlaying(false);setFollowScroll(true);}}>↕ Scroll time</button></div><label><span className="sr-only">Simulated hour</span><input type="range" min="0" max="48" step="0.05" value={hour} onChange={e=>{setFollowScroll(false);setHour(Number(e.target.value));setPlaying(false);}} aria-valuetext={clockLabel(hour)}/></label><span className="hw-clock-speed">{followScroll ? "Scroll through a simulated day" : "1s = 15 simulated minutes"} · {schedules.length ? "current proposed plan" : "load a plan to run jobs"}</span></div>
      <div className="hw-3d-slot"><HouseholdScene3D selected={selected} onSelect={setSelected} hour={hour} activeIds={activeIds} scrollProgress={progress}/></div>
      <div className="hw-stat-party" aria-label="Simulated appliance status">
        {crew.map(character=>{
          const stat = character.id === "chill" ? null : stats[character.id];
          const sleeping = night && stat?.status !== "active";
          const stateLabel = stat?.status === "active" ? "ON A QUEST" : stat?.status === "complete" ? `COMPLETE${sleeping ? " · ZZZ" : ""}` : stat?.status === "queued" ? `QUEUED${sleeping ? " · ZZZ" : ""}` : character.id === "chill" ? "COMFORT GUARD" : `IDLE${sleeping ? " · ZZZ" : ""}`;
          return <button className={`hw-stat-card hw-stat-${character.id}`} type="button" key={character.id} aria-pressed={selected===character.id} onClick={()=>setSelected(character.id)} aria-label={`Inspect ${character.name} stats`}><div className="hw-stat-identity"><PixelAppliance id={character.id} sleeping={sleeping} className="hw-stat-sprite"/><span><strong>{character.name}</strong><small>LV.{training[character.id].level} · {training[character.id].xp} XP</small></span></div><span className="hw-state-label">{stateLabel}</span>{stat ? <><div className="hw-stat-numbers"><b>{stat.currentPowerKw.toFixed(1)}<small> kW</small></b><span>{stat.completedEnergyKwh.toFixed(2)} / {stat.totalEnergyKwh.toFixed(2)} kWh</span></div><progress value={stat.progressPercent} max="100" aria-label={`${character.name} simulated session progress`}/><span className="hw-stat-receipt">${stat.accruedCostUsd.toFixed(2)} · {(stat.accruedCarbonGrams/1000).toFixed(3)} kg CO₂e</span></> : <><div className="hw-stat-numbers"><b>SAFE<small> MODE</small></b></div><span className="hw-protected-bar"/><span className="hw-stat-receipt">AC excluded · comfort guard</span></>}</button>;
        })}
      </div>
    </div>}</ScrollStage>
    <div className="hw-command-deck">
      <section className="hw-character-sheet" aria-label="Selected character"><PixelAppliance id={selected} sleeping={night&&!activeIds.includes(selected as "evie"|"bubbles")} className="hw-sheet-sprite"/><div><p className="hw-kicker">{active.name} / {active.title}</p><h3>{active.line}</h3><p>{active.description}</p></div></section>
      <section className="hw-controller" aria-label="Household quest controls"><div className="hw-controller-title"><span className="hw-kicker">CHOOSE YOUR NEXT QUEST</span><span>Functional local planner</span></div><div className="hw-action-row"><button type="button" onClick={()=>run(morningRequest)}>01 · Plan the morning ↗</button><button type="button" onClick={()=>run("I don't want the dishwasher running after 10 PM.")}>02 · Quiet after 10pm ↗</button><button type="button" onClick={onInspect}>Inspect the math →</button></div>{notice&&<p role="status">{notice}</p>}</section>
      <section className="hw-preview-composer"><form onSubmit={submit}><label htmlFor="household-preview-message">Say something to your party</label><div className="hw-input-row"><input id="household-preview-message" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={500} placeholder="Hey crew, what’s the plan tonight?"/><button type="submit" disabled={!draft.trim()} aria-label="Preview message">↗</button></div></form>{submitted?<div className="hw-api-placeholder" role="status"><p><strong>You:</strong> {submitted}</p><p>Reply placeholder · AI connection pending. Your schedule hasn’t changed.</p></div>:<p>AI connection pending. Try a message; quest buttons run the working planner.</p>}</section>
    </div>
  </section>;
}
