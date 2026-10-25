"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoScenario } from "@/domain/demo";
import { formatDemoHour } from "@/domain/demo";
import { getDemoAcStats } from "@/domain/demo-activity";
import { getSimulationStats } from "@/domain/simulation";
import { getDemoExecutionStats } from "@/domain/demo-commands";
import { useDemoCommands } from "./use-demo-commands";
import { ApplianceChat } from "./appliance-chat";
import { ApplimonTeamPanel } from "./applimon-team-panel";
import { MessagesConnection } from "./messages-connection";
import { messageHouseholdContext } from "@/domain/message-household";
import { useHouseholdConversation } from "./use-household-conversation";
import { weatherLocationLabel } from "@/domain/weather-location";
import { isWeatherSnapshotFresh } from "@/domain/demo-weather";
import { getApplimon, type ApplimonId } from "@/domain/applimon-catalog";
import type { OptimizationMode } from "@/domain/scheduling";
import type { ApplianceId } from "@/domain/appliances";
import { HouseholdScene3D } from "./household-scene-3d";
import { ApplimonSprite } from "./applimon-sprite";
import { PixelAppliance } from "./pixel-appliance";
import { DEMO_ENERGY_REFERENCES } from "@/data/demo-grid";
import { CITY_LANDMARKS } from "@/data/city-landmarks";
import "./demo-home-dashboard.css";

const names = { evie: "Evie", bubbles: "Bubbles", chill: "Chill" };
type Props = { scenario: DemoScenario; mode: OptimizationMode; notice: string; onEdit: () => void; onAddAppliance?: () => void; forecastNotice?: string; forecastLoading?: boolean; onRefreshForecast?: () => void };

export function DemoHomeDashboard({ scenario, mode, notice, onEdit, onAddAppliance, forecastNotice, forecastLoading, onRefreshForecast }: Props) {
  const [panel, setPanel] = useState<"quest" | "energy" | "team" | "weather" | "link" | null>(null);
  const menuDialog = useRef<HTMLDialogElement>(null);
  const menuBody = useRef<HTMLDivElement>(null);
  const focusExpandedParty = useRef(false);
  function openExpandedParty() { focusExpandedParty.current = true; setPanel("team"); }
  useEffect(() => {
    const dialog = menuDialog.current;
    if (panel && dialog && !dialog.open) dialog.showModal();
    if (!panel && dialog?.open) dialog.close();
    if (panel) {
      if (panel === "team" && focusExpandedParty.current) {
        const composer = menuBody.current?.querySelector<HTMLInputElement>("#party-message");
        composer?.focus({ preventScroll: true });
        composer?.scrollIntoView({ block: "center", behavior: "instant" });
      } else if (menuBody.current) menuBody.current.scrollTop = 0;
      focusExpandedParty.current = false;
    }
  }, [panel]);
  const [previewHour, setPreviewHour] = useState(()=>Math.min(18,...scenario.requests.map(row=>row.startWindow.earliestHour)));
  const [additionalActiveIds,setAdditionalActiveIds]=useState<ApplimonId[]>([]);
  const additional=(scenario.profile.applimons??[]).filter(device=>!getApplimon(device.id).legacyId);
  const [viewExecution,setViewExecution]=useState(false);
  const commands=useDemoCommands(scenario,mode);
  const {session}=commands;
  const hour=viewExecution&&session.approved?session.executionHour:previewHour;
  const setHour=(next:number)=>{setViewExecution(false);setPreviewHour(next);};
  const [selected, setSelected] = useState<ApplianceId>(scenario.profile.applianceIds[0] ?? "evie");
  const [cameraFocus, setCameraFocus] = useState<{ id: ApplimonId; nonce: number }>();
  function selectTeammate(id: ApplianceId) {
    setSelected(id);
    setCameraFocus(previous => ({ id, nonce: (previous?.nonce ?? 0) + 1 }));
  }
  const [original, setOriginal] = useState(false);
  const conversation = useHouseholdConversation(`${session.contextFingerprint}:${session.approved?.id ?? "none"}:${session.status}`, (id, text, source) => { const reply = commands.send(id, text, source); setOriginal(false); return reply; });
  const plan = session.pending?.plan ?? session.approved?.plan ?? scenario.plan;
  const currentMode=session.pending?.mode ?? session.approved?.mode ?? session.mode;
  const approvedStats=getDemoExecutionStats(session,scenario);
  const executed=Object.values(approvedStats).reduce((sum,row)=>({energyKwh:sum.energyKwh+row.completedEnergyKwh,costUsd:sum.costUsd+row.accruedCostUsd,carbonGrams:sum.carbonGrams+row.accruedCarbonGrams}),{energyKwh:0,costUsd:0,carbonGrams:0});
  const flexibleTarget=scenario.profile.applianceIds.find(id=>id!=="chill");
  function send(text:string,source:"text"|"voice") { void conversation.dispatch(selected,text,{origin:"web",source}); }
  function changeMode(next:OptimizationMode) {if(!flexibleTarget)return;conversation.invalidate();setSelected(flexibleTarget);commands.send(flexibleTarget,next==="cost"?"Find a cheaper plan":next==="carbon"?"Find a lower-carbon plan":"Make a balanced plan","text");setOriginal(false);setViewExecution(false);}
  function approve(id:string){conversation.invalidate();commands.approve(id);setOriginal(false);setViewExecution(true);}
  const phaseLabel=session.status==="completed"?"COMPLETED SIMULATION":session.approved?`${session.status.toUpperCase()} SIMULATION`:session.pending?"PROJECTION / AWAITING APPROVAL":"PROJECTION / NOT RUNNING";
  const followingExecution = viewExecution && !!session.approved;
  const baselineSchedules = plan?.appliances.flatMap(item => item.baseline.schedule ? [item.baseline.schedule] : []) ?? [];
  const schedules = viewExecution&&session.approved?session.approved.plan.schedules:original ? baselineSchedules : plan?.schedules ?? [];
  const stats = getSimulationStats(schedules, hour);
  const ac = getDemoAcStats(scenario.acActivity, hour);
  const active: ApplianceId[] = Object.values(stats).filter(row => row.status === "active").map(row => row.applianceId);
  if (ac.currentPowerKw > 0) active.push("chill");
  const weatherCode = (hour >= 24 ? scenario.weather.nextDayHourly?.[Math.floor(hour)%24] : scenario.weather.hourly[Math.floor(hour)%24])?.weatherCode ?? scenario.weather.weatherCode;
  const sky = [71,73,75,77,85,86].includes(weatherCode) ? "snow" : weatherCode >= 51 ? "rain" : weatherCode > 0 ? "cloudy" : "clear";
  const priceHour = Math.floor(hour) % 24;
  const grid = scenario.gridProfile;
  const max = Math.max(...grid.map(row => row.demandIndex), 1);
  const line = (values: readonly number[]) => values.map((value, i) => `${30 + i / 23 * 640},${170 - value / max * 135}`).join(" ");
  const now = scenario.energyProfile[priceHour];
  const totalPower = Object.values(stats).reduce((sum, row) => sum + row.currentPowerKw, 0) + ac.currentPowerKw;
  const menuItems = [{id:"quest",label:"Quest",icon:"◆"},{id:"energy",label:"Energy",icon:"ϟ"},{id:"team",label:"Team",icon:"♧"},{id:"weather",label:"Weather",icon:"☀"},{id:"link",label:"Link",icon:"↗"}] as const;
  return <main className="demo-home-dashboard dh-game" aria-label="Your household game">
    <header className="dh-game-hud">
      <div className="dh-location"><span className="dh-location-mark" aria-hidden="true">⌂</span><div><h1 title={scenario.weather.location?weatherLocationLabel(scenario.weather.location):scenario.region.city}>{scenario.weather.location?.name??scenario.region.city}</h1><p>{scenario.weather.location?`${scenario.region.city} SCENE`:CITY_LANDMARKS[scenario.profile.regionId].shortName} · YOUR HOME</p></div></div>
      <div className="dh-hud-readings"><span><b>{scenario.weather.temperatureC.toFixed(0)}°C</b><small>{scenario.weather.source==="live"?"forecast":"synthetic"}</small></span><span title={`${followingExecution?"Simulated":"Projected"} power for Evie, Bubbles and Chill only. Expanded teammates use their separate party clock.`}><b>{totalPower.toFixed(2)} kW</b><small>EV / dishes / AC</small></span></div>
    </header>
    <nav className="dh-game-menu" aria-label="Household game menu">{menuItems.map(item=><button type="button" key={item.id} aria-haspopup="dialog" aria-label={`Open ${item.label.toLowerCase()} menu`} onClick={()=>setPanel(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}{item.id==="quest"&&session.pending&&<i aria-label="Proposal ready"/>}</button>)}<button type="button" onClick={onAddAppliance??onEdit} aria-label="Recruit" className="dh-recruit-button"><span aria-hidden="true">＋</span>Recruit</button></nav>
    <section className="dh-world-stage" aria-label="Your completed home">
      <div className="dh-stage-topline"><span>{followingExecution?phaseLabel:original?"ORIGINAL ROUTINE · PREVIEW":"OPTIMIZED PLAN · PREVIEW"}</span><span>NO DEVICES CONNECTED</span></div>
      <div className="dh-scene"><HouseholdScene3D selected={selected} onSelect={selectTeammate} focusOnSelect focusRequest={cameraFocus} hour={hour} scrollProgress={.5} activeIds={active} regionTheme={scenario.region.theme} residenceType={scenario.profile.residenceType} visibleAppliances={scenario.profile.applianceIds} additionalApplimons={additional.map(device=>device.id)} additionalActiveIds={additionalActiveIds} weatherKind={sky}/></div>
      <div className="dh-stage-party" aria-label="Talk to a teammate">{scenario.profile.applianceIds.map(id=><button type="button" key={id} aria-pressed={selected===id} onClick={()=>selectTeammate(id)}><PixelAppliance id={id}/><span>{names[id]}</span><i aria-hidden="true">{selected===id?"▸":""}</i></button>)}{additional.length>0&&<button type="button" onClick={openExpandedParty}><ApplimonSprite id={additional[0].id}/><span>+{additional.length} party</span><i aria-hidden="true">↗</i></button>}</div>
      <div className="dh-world-hint">Select a teammate to zoom in. Reset returns to your home.</div>
    </section>
    <div className="dh-clock dh-game-clock" id="demo-dashboard-clock"><label htmlFor="demo-home-hour"><span>{followingExecution?"RUN CLOCK":"PREVIEW"}</span><strong>{formatDemoHour(hour)}</strong></label><input id="demo-home-hour" aria-label="Preview household hour" disabled={followingExecution} type="range" min="0" max="48" step=".05" value={hour} onChange={event=>setHour(Number(event.target.value))}/><button type="button" aria-haspopup="dialog" onClick={()=>setPanel("quest")}>{session.status==="running"?"Running ▸":session.status==="paused"?"Paused Ⅱ":session.status==="completed"?"Complete ✓":"Time & plan ▸"}</button></div>
    <div className="dh-dialogue-dock">{scenario.profile.applianceIds.length===0&&additional.length>0?<section className="dh-expanded-welcome" aria-label="Your recruited party is ready"><div className="dh-expanded-portrait"><ApplimonSprite id={additional[0].id}/><span>PARTY LINK</span></div><div><p className="dh-expanded-kicker">YOUR PARTY IS READY</p><h2>{additional.map(device=>getApplimon(device.id).name).join(", ")}</h2><p>Your teammates are here. Open the party menu to talk, review their moves, and approve a simulated task.</p><div className="dh-expanded-actions"><button type="button" onClick={openExpandedParty}>Talk to {getApplimon(additional[0].id).name} ▸</button><button type="button" onClick={onAddAppliance??onEdit}>Recruit a teammate</button></div><small>Local commands · simulated activity · no devices connected</small></div></section>:commands.ready?<ApplianceChat presentation="dock" dialogueContext={session.contextFingerprint} applianceIds={scenario.profile.applianceIds} selected={selected} onSelect={selectTeammate} messages={commands.messages} onSend={send} conversation={conversation.forCharacter(selected)} proposal={session.pending} onApprove={approve} onReject={id=>{conversation.invalidate();commands.reject(id);}} locked={!!session.approved} executionStatus={session.status}/>:<p className="dh-opening" role="status">Your crew is getting ready…</p>}</div>
    <dialog ref={menuDialog} className="dh-game-dialog" aria-labelledby="dh-menu-heading" onClose={()=>setPanel(null)} onCancel={()=>setPanel(null)}>
      <header className="dh-menu-heading"><div><p>HOUSEMATES / FIELD MENU</p><h2 id="dh-menu-heading">{menuItems.find(item=>item.id===panel)?.label??"Household"}</h2></div><button type="button" autoFocus aria-label="Close household menu" onClick={()=>menuDialog.current?.close()}>Close ×</button></header>
      <div ref={menuBody} className="dh-menu-body">
        <div hidden={panel!=="quest"}>
    <section className="dh-plan" id="demo-plan-controls" aria-label="Plan comparison"><p className="demo-eyebrow">YOUR ENERGY QUEST</p><h2>Same chores. Better timing.</h2><label htmlFor="demo-home-objective">Planning style</label><select id="demo-home-objective" disabled={!!session.approved||!flexibleTarget||!commands.ready} value={currentMode} onChange={event=>changeMode(event.target.value as OptimizationMode)}><option value="cost">Cost first</option><option value="carbon">Carbon first</option><option value="balanced">Balanced</option></select><div className="dh-toggle"><button type="button" aria-pressed={original} onClick={()=>{setOriginal(true);setViewExecution(false);}}>Original routine</button><button type="button" aria-pressed={!original} onClick={()=>{setOriginal(false);setViewExecution(false);}}>Optimized plan</button></div>{plan?.status === "feasible" ? <><dl className="dh-totals"><div><dt>Projected flexible cost</dt><dd>${(original ? plan.baseline!.costUsd : plan.proposed!.costUsd).toFixed(2)}</dd></div><div><dt>Projected emissions</dt><dd>{((original ? plan.baseline!.carbonGrams : plan.proposed!.carbonGrams)/1000).toFixed(2)} <small>kg CO₂e</small></dd></div></dl><p className="dh-saving">Projected {plan.comparison!.costSavingsUsd >= 0 ? "Cost reduction" : "Cost increase"}: ${Math.abs(plan.comparison!.costSavingsUsd).toFixed(2)} · {plan.comparison!.carbonReductionGrams >= 0 ? "Carbon reduction" : "Carbon increase"}: {(Math.abs(plan.comparison!.carbonReductionGrams)/1000).toFixed(2)} kg</p></> : <p className="dh-copy">{plan?.issues.join(" ") || "Chill is on comfort duty. Add Evie or Bubbles to compare flexible schedules."}</p>}<p className="dh-copy">{scenario.profile.applimons?.some(device=>device.id==="evie"||device.id==="bubbles")?"This plan uses your reviewed appliance specifications and availability windows. Open the proposal to inspect its constraints and fixed original routine.":"A representative weekday: Evie arrives at 18:00 and needs its charge by 07:00. Bubbles starts after dinner at 20:00. Optimization respects availability; an absent car cannot charge at noon."}</p><p className="dh-disclosure">Projection for EV + dishwasher sessions only; approve a chat proposal to run. AC stays separate. Synthetic USD prices; no devices connected.</p></section>
          <section className="dh-time-menu" aria-label="Explore the projected day"><h3>Explore the day</h3><p>Previewing an hour never starts or completes a task.</p><div className="dh-jumps">{[[7,"Morning"],[13,"Solar noon"],[18,"Home time"],[27,"Overnight"]].map(([value,label])=><button key={value} type="button" onClick={()=>{setHour(Number(value));menuDialog.current?.close();}}>{label}</button>)}</div>{session.approved&&<button type="button" className="dh-follow-run" onClick={()=>{setViewExecution(true);setOriginal(false);menuDialog.current?.close();}}>Follow approved simulation</button>}</section>
    <section className="dh-execution" aria-label="Approved simulation progress">
      <div><p className="demo-eyebrow">{phaseLabel}</p><h2>{session.status==="completed"?"Your simulated tasks are done.":session.approved?"Your approved plan, in motion.":"From conversation to a completed task."}</h2><p>{session.approved?`Execution clock: ${formatDemoHour(session.executionHour)}. One simulated hour takes five seconds. Preview scrubbing is separate.`:"Talk or type to your appliances below. Review the computed proposal, then approve it to start the simulation."}</p></div>
      {session.approved&&<><dl className="dh-run-totals"><div><dt>Executed simulated energy</dt><dd>{executed.energyKwh.toFixed(2)} kWh</dd></div><div><dt>Accrued simulated cost</dt><dd>${executed.costUsd.toFixed(2)}</dd></div><div><dt>Accrued modeled carbon</dt><dd>{(executed.carbonGrams/1000).toFixed(3)} kg</dd></div></dl>{session.status==="completed"&&session.approved.plan.baseline&&<p className="dh-run-receipt">Completed simulation vs original routine: ${(session.approved.plan.baseline.costUsd-executed.costUsd).toFixed(2)} cost reduction · {((session.approved.plan.baseline.carbonGrams-executed.carbonGrams)/1000).toFixed(3)} kg modeled carbon reduction. Negative means an increase. No real-world savings were measured.</p>}<div className="dh-run-controls">{session.status!=="completed"&&<><button type="button" onClick={()=>commands.pause(session.status==="running")}>{session.status==="running"?"Pause simulation":"Resume simulation"}</button><button type="button" onClick={()=>{commands.finishSimulation();setViewExecution(true);setOriginal(false);}}>Fast-forward simulated tasks</button></>}<button type="button" onClick={()=>{conversation.invalidate();commands.reset();setViewExecution(false);setPreviewHour(18);setOriginal(false);}}>Start a new simulated day</button></div></>}
      {commands.storageNotice&&<p className="dh-disclosure">{commands.storageNotice}</p>}
    </section>

        </div>
        <div hidden={panel!=="energy"}>    <section className="dh-grid-card" aria-label="Synthetic duck curve"><div><p className="demo-eyebrow">THE GRID’S DAILY RHYTHM</p><h2>Sun up. Net demand down.</h2><p>Solar generation reduces the demand left for other generators. As solar fades, evening demand rises. This authored {scenario.region.city} scenario uses its own solar strength; the curves are illustrative, not measured grid data.</p></div><div className="dh-legend"><span>— Total demand</span><span>— Solar</span><span>— Net demand</span></div><svg viewBox="0 0 700 205" role="img" aria-label="Synthetic hourly demand, solar generation and net demand; normalized index, not household kWh"><path d="M30 35H670 M30 102H670 M30 170H670" stroke="#dfd5e5" strokeDasharray="4 5"/><polyline points={line(grid.map(row=>row.demandIndex))} fill="none" stroke="#b4a4bf" strokeWidth="3"/><polyline points={line(grid.map(row=>row.solarIndex))} fill="none" stroke="#b29a40" strokeWidth="3"/><polyline points={line(grid.map(row=>row.netDemandIndex))} fill="none" stroke="#73538e" strokeWidth="4"/><line x1={30+priceHour/23*640} x2={30+priceHour/23*640} y1="25" y2="175" stroke="#65794b" strokeDasharray="3 4"/>{[0,6,12,18,23].map(h=><text key={h} x={30+h/23*640} y="198" textAnchor="middle" fill="#705d7e" fontSize="12">{String(h).padStart(2,"0")}:00</text>)}</svg><div className="dh-chart-axis" aria-hidden="true">{["00:00","06:00","12:00","18:00","23:00"].map(label=><span key={label}>{label}</span>)}</div><div className="dh-grid-stats"><span>At {String(priceHour).padStart(2,"0")}:00 <b>${now.priceUsdPerKwh.toFixed(3)} / kWh</b></span><span>Grid carbon <b>{now.carbonGramsPerKwh.toFixed(0)} g CO₂e / kWh</b></span><span>AC estimate / 24h <b>{scenario.acActivity.energyKwh.toFixed(2)} kWh · ${scenario.acActivity.costUsd.toFixed(2)}</b></span></div><p className="dh-disclosure">Net demand is not a tariff or carbon measurement. Price and carbon use separate synthetic hourly signals. The same day repeats over the 48-hour demo.</p><details><summary>Inspect hourly data & model assumptions</summary><div className="dh-table"><table><thead><tr><th>Hour</th><th>Net index</th><th>USD/kWh</th><th>g CO₂e/kWh</th><th>AC kWh</th></tr></thead><tbody>{grid.map((row,i)=><tr key={row.hour}><td>{row.hour}:00</td><td>{row.netDemandIndex.toFixed(2)}</td><td>{scenario.energyProfile[i].priceUsdPerKwh.toFixed(3)}</td><td>{scenario.energyProfile[i].carbonGramsPerKwh.toFixed(0)}</td><td>{scenario.acActivity.hourly[i].energyKwh.toFixed(3)}</td></tr>)}</tbody></table></div><ul>{[...scenario.assumptions,...scenario.acActivity.assumptions].map((line,i)=><li key={i}>{line}</li>)}</ul><p>Background references (the numeric curves remain authored):</p><ul>{DEMO_ENERGY_REFERENCES.map(source=><li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul></details></section>
</div>
        <div hidden={panel!=="team"}><div className="dh-team-actions"><button type="button" onClick={onAddAppliance??onEdit}>Scan an Applimon ↗</button><button type="button" onClick={onEdit}>Edit my world ↗</button></div>    <p className="demo-eyebrow dh-activity-label">{followingExecution ? "APPROVED SIMULATION ACTIVITY" : "PROJECTED ACTIVITY / PREVIEW ONLY"}</p>
    <section className="dh-party" aria-label="Appliance energy activity">{(["evie","bubbles","chill"] as const).map(id=>{
      const included=scenario.profile.applianceIds.includes(id), isAc=id==="chill";
      const reading=isAc?ac:stats[id];
      const schedule=schedules.find(item=>item.applianceId===id);
      return <article key={id} className={`dh-appliance${included?"":" is-absent"}`}><header><PixelAppliance id={id}/><div><h2>{names[id]}</h2><span>{!included?"NOT RECRUITED":isAc?(ac.currentPowerKw>0?"COOLING · SIMULATED":"STANDBY · SIMULATED"):`${followingExecution?"SIMULATED":"PROJECTED"} · ${reading.status.toUpperCase()}`}</span></div></header>{included?<><strong className="dh-power">{reading.currentPowerKw.toFixed(2)} <small>{followingExecution ? "kW simulated" : "kW projected"}</small></strong><p>{reading.completedEnergyKwh.toFixed(2)} / {reading.totalEnergyKwh.toFixed(2)} kWh <span>{isAc?"over 48h":"this session"}</span></p><p className="dh-meter">${reading.accruedCostUsd.toFixed(2)} · {(reading.accruedCarbonGrams/1000).toFixed(3)} kg CO₂e {followingExecution ? "simulated" : "projected"}</p>{isAc?<><p className="dh-copy">Temperature, humidity and a representative weekday occupancy pattern shape this AC trace. Zero cooling demand means standby, not a missing appliance.</p><div className="dh-ac-bars" aria-label="24-hour simulated AC demand">{scenario.acActivity.hourly.map(row=><i key={row.hour} title={`${String(row.hour).padStart(2,"0")}:00 · ${row.powerKw.toFixed(2)} kW`} style={{height:`${Math.max(2,row.powerKw/Math.max(...scenario.acActivity.hourly.map(item=>item.powerKw),.01)*40)}px`}}/>)}</div><p className="dh-disclosure">{scenario.acActivity.forecastHourly?"Two forecast days · fixed in both plans · no AC optimization.":"Repeated daily · fixed in both plans · no AC optimization."}</p></>:<p className="dh-copy">{schedule ? `${formatDemoHour(schedule.startHour)} → ${formatDemoHour(schedule.endHour)}` : "No feasible schedule."}</p>}</>:<><p className="dh-copy">Add {names[id]} to see its modeled activity.</p><button type="button" onClick={onEdit}>Edit team ↗</button></>}</article>;
    })}</section>

          <ApplimonTeamPanel active={panel==="team"} devices={additional} energyProfile={scenario.energyProfile} onEdit={onAddAppliance??onEdit} onActiveChange={setAdditionalActiveIds}/>
        </div>
        <div hidden={panel!=="weather"}>    <section className="dh-weather-snapshot" aria-label="Forecast used in this plan"><div><p className="demo-eyebrow">{scenario.weather.source==="live" ? "OPEN-METEO / ACTUAL CITY FORECAST" : "SYNTHETIC WEATHER / DEMO OR FALLBACK"}</p>{scenario.weather.location&&<p><b>{weatherLocationLabel(scenario.weather.location)}</b></p>}<strong>{scenario.weather.temperatureC.toFixed(1)}°C · {scenario.weather.humidityPercent}% humidity</strong><p>{scenario.weather.source==="live" ? `${scenario.weather.currentTime.replace("T"," ")} · ${scenario.weather.timezone}. ${isWeatherSnapshotFresh(scenario.weather)?"Recent forecast snapshot.":"Saved forecast snapshot; refresh before making a new plan."} ${scenario.weather.nextDayHourly?"Two distinct forecast days drive modeled cooling.":"One forecast day is repeated in the simulation."}` : scenario.weather.fallbackReason ?? scenario.weather.sourceLabel}</p><p>{forecastNotice} Electricity rates and carbon remain synthetic; this is outdoor weather, not household telemetry.</p></div><button type="button" disabled={forecastLoading||!!session.approved||scenario.profile.weatherMode!=="live"} onClick={onRefreshForecast}>{forecastLoading?"Loading forecast…":"Refresh forecast"}</button>{session.approved&&<small>Start a new simulated day before replacing its weather snapshot.</small>}</section>
</div>
        <div hidden={panel!=="link"}>{commands.ready&&<MessagesConnection contextKey={messageHouseholdContext(scenario.profile)} applianceIds={scenario.profile.applianceIds} onCommand={(id,text,options)=>conversation.dispatch(id,text,{origin:"imessage",...options})} outboundTurns={conversation.outboundTurns}/>}</div>
        {notice&&<p className="dh-notice" role="status">{notice}</p>}
      </div>
    </dialog>
  </main>;
}
