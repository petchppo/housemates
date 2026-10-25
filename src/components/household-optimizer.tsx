"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { getApplimon } from "@/domain/applimon-catalog";
import { optimizeCoordinatedApplimons, type CoordinatedOptimizationResult } from "@/domain/coordinated-optimization";
import type { CoordinatedContext } from "@/domain/household-optimization";
import { formatDemoHour } from "@/domain/demo";
import type { OptimizationMode } from "@/domain/scheduling";
import { ApplimonSprite } from "./applimon-sprite";
import "./household-optimizer.css";

const MODES: OptimizationMode[] = ["cost", "carbon", "balanced"];
const LABELS: Record<OptimizationMode,string> = { cost: "Lower cost", carbon: "Lower carbon", balanced: "Balanced" };
const QUESTS: Record<OptimizationMode,string> = { cost: "Save coins", carbon: "Go greener", balanced: "Balance both" };
const TOKENS: Record<OptimizationMode,string> = { cost: "◆", carbon: "✿", balanced: "☯" };
type Snapshot = { key: string; results: Record<OptimizationMode,CoordinatedOptimizationResult> };
export type HouseholdOptimizerProps = { context: CoordinatedContext; active: boolean; initialMode: OptimizationMode };
const usd = (value: number) => `$${value.toFixed(2)}`;
const kg = (value: number) => `${(value / 1000).toFixed(3)} kg`;

/** A disposable planning preview. This component has no execution or approval authority. */
export function HouseholdOptimizer({ context, active, initialMode }: HouseholdOptimizerProps) {
  const [mode,setMode] = useState<OptimizationMode>(initialMode);
  const [budget,setBudget] = useState("8");
  const [unlimited,setUnlimited] = useState(false);
  const [snapshot,setSnapshot] = useState<Snapshot|null>(null);
  const [failure,setFailure] = useState("");
  const firstCalculation = useRef(false);
  const limit = Number(budget);
  const validBudget = unlimited || (budget.trim() !== "" && Number.isFinite(limit) && limit >= .1 && limit <= 100);
  const key = JSON.stringify([context.contextKey, unlimited ? null : budget]);
  const committed = useRef({active:false,key:""});
  useLayoutEffect(()=>{
    committed.current={active,key};
    return()=>{committed.current={active:false,key:""};};
  },[active,key]);
  const current = snapshot?.key === key ? snapshot : null;
  function calculate() {
    if (!active || !committed.current.active || committed.current.key!==key || !validBudget || !context.inventory.length) return;
    try {
      const results = Object.fromEntries(MODES.map(nextMode => [nextMode,optimizeCoordinatedApplimons({
        inventory: context.inventory, coreRequests: context.coreRequests, energyProfile: context.energyProfile,
        backgroundPowerKw: context.backgroundPowerKw, mode: nextMode,
        ...(unlimited ? {} : {modeledPowerLimitKw: limit}),
      })])) as Record<OptimizationMode,CoordinatedOptimizationResult>;
      setSnapshot({key,results}); setFailure("");
    } catch { setSnapshot(null); setFailure("This preview could not be calculated. Review the inputs and try again; no plan or run has changed."); }
  }
  // Only the first user opening calculates automatically. Later input changes require another click.
  useEffect(()=>{
    if (!active || firstCalculation.current) return;
    const timer = window.setTimeout(()=>{if(firstCalculation.current || !committed.current.active || committed.current.key!==key)return;firstCalculation.current=true;calculate();},0);
    return()=>window.clearTimeout(timer);
    // The snapshot key covers every solver input; changing mode only selects a completed alternative.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[active,key]);
  function submit(event: FormEvent) { event.preventDefault(); firstCalculation.current=true; calculate(); }
  const result = current?.results[mode];
  const points = current ? MODES.flatMap(value=>{const row=current.results[value];return row.status==="feasible"&&row.proposed?[{mode:value,...row.proposed}]:[];}) : [];
  const maxCost = Math.max(0,...points.map(point=>point.costUsd));
  const minCost = Math.min(0,...points.map(point=>point.costUsd));
  const maxCarbon = Math.max(0,...points.map(point=>point.carbonGrams));
  const minCarbon = Math.min(0,...points.map(point=>point.carbonGrams));
  const x = (value:number)=>60+(value-minCarbon)/(maxCarbon-minCarbon||1)*380;
  const y = (value:number)=>170-(value-minCost)/(maxCost-minCost||1)*130;

  return <section className="household-optimizer" aria-label="Coordinated household planning preview">
    <header className="ho-game-header"><div><p className="ho-kicker">PARTY PLANNER / 48 HOURS</p><h2>Find your party’s rhythm.</h2><p>Planning preview · no devices or simulations start.</p></div><span className="ho-cartridge" aria-hidden="true">HM<br/>48</span></header>
    <div className="ho-weather-scene"><div className="ho-sky-art" aria-hidden="true"><i className="ho-sun"/><i className="ho-cloud"/><i className="ho-hill"/></div><div className="ho-weather-summary"><strong>{context.weatherTemperaturesC.length>0?`${Math.min(...context.weatherTemperaturesC).toFixed(1)}–${Math.max(...context.weatherTemperaturesC).toFixed(1)} °C`:"Weather snapshot"}</strong><span>{context.weatherLabel}</span><small>Weather shapes fixed thermal demand. Rates stay synthetic.</small></div></div>
    <form className="ho-command-bar" onSubmit={submit}><button type="submit" disabled={!active||!validBudget||!context.inventory.length}>Optimize schedule</button><button className="ho-clear" type="button" onClick={()=>{firstCalculation.current=true;setSnapshot(null);setFailure("");}}>Clear preview</button><small>{unlimited?"No shared power limit":`${validBudget?budget:"Invalid"} kW modeled budget`} · change in Details</small></form>
    {!validBudget&&<p className="ho-problem" role="alert">Enter a finite power budget from 0.1 to 100 kW in Details, or choose no shared power limit.</p>}
    {!context.inventory.length?<p className="ho-message" role="status">Recruit an Applimon to build a schedule. No household bill is estimated here.</p>:!current&&<p className="ho-message" role="status">{snapshot?"Inputs changed. Optimize again to calculate a current preview.":"Choose Optimize schedule to calculate three alternatives."}</p>}
    {failure&&<p className="ho-problem" role="alert">{failure}</p>}
    {current&&<>
      <div className="ho-modes" role="group" aria-label="Choose computed objective">{MODES.map(value=><button type="button" key={value} aria-label={LABELS[value]} aria-pressed={mode===value} onClick={()=>setMode(value)}><span aria-hidden="true">{TOKENS[value]}</span><strong>{QUESTS[value]}</strong><small>{value==="cost"?"Lower cost":value==="carbon"?"Lower CO₂e":"Cost + CO₂e"}</small></button>)}</div>
      {result&&result.status!=="feasible"&&<div className="ho-problem" role="alert"><strong>{result.status==="search-limit"?"Search limit reached — no verified optimum to display.":"This route needs a rethink."}</strong><ul>{result.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul><p>Review deadlines, windows or the modeled budget. No constraints were relaxed.</p></div>}
      {result?.status==="feasible"&&<div className="ho-rewards" aria-label="Projected flexible-task results"><p>PROJECTED LOOT <span>· estimates, not earned savings</span></p><div><article><span aria-hidden="true">◆</span><small>Flexible task cost</small><strong>{result.proposed?usd(result.proposed.costUsd):"No tasks"}</strong>{result.comparison&&<em>{usd(Math.abs(result.comparison.costSavingsUsd))} {result.comparison.costSavingsUsd>=0?"less":"more"} than original</em>}</article><article><span aria-hidden="true">✿</span><small>Modeled CO₂e</small><strong>{result.proposed?kg(result.proposed.carbonGrams):"No tasks"}</strong>{result.comparison&&<em>{kg(Math.abs(result.comparison.carbonReductionGrams))} {result.comparison.carbonReductionGrams>=0?"less":"more"} than original</em>}</article></div></div>}
      <div className="ho-map-heading"><h3>Your party route</h3><span>{context.inventory.length} teammates</span></div><div className="ho-map-legend"><span><i/> Original</span><span><i/> Computed</span><small>Protected routines stay unchanged.</small></div>
      <div className="ho-timeline">{context.inventory.map(device=>{
        const entry=getApplimon(device.id), own=result?.appliances.find(row=>row.id===device.id);
        const baseline=own?.baseline.schedule;
        const proposed=result?.status==="feasible"?[...result.schedules,...result.unchangedSchedules].find(row=>row.applianceId===device.id):undefined;
        return <article className={`ho-party-row ho-policy-${entry.schedulingPolicy}`} key={device.id}><div className="ho-portrait"><ApplimonSprite id={device.id}/></div><div className="ho-row-body"><div className="ho-row-label"><strong>{entry.name}</strong><span>{entry.schedulingPolicy==="protected"?"GUARD DUTY":entry.schedulingPolicy==="fixed"?"FIXED ROUTINE":"FLEXIBLE QUEST"}</span></div>{entry.schedulingPolicy==="protected"?<p className="ho-protected-copy">{device.id==="chill"?"Protected · unchanged. Cooling is already in the thermal background.":"Protected · unchanged. Usage excluded from these totals."}</p>:<><div className="ho-time-axis" aria-label="48-hour timeline"><span>Day 1 · 00:00</span><span>Day 2 · 00:00</span><span>Day 3 · 00:00</span></div><div className="ho-track" aria-hidden="true"><span className="ho-day-night-markers">☾　☀　☾　☀</span>{baseline&&<span className="ho-baseline" style={{left:`${baseline.startHour/48*100}%`,width:`${(baseline.endHour-baseline.startHour)/48*100}%`}}/>}{proposed&&<span className="ho-proposed" style={{left:`${proposed.startHour/48*100}%`,width:`${(proposed.endHour-proposed.startHour)/48*100}%`}}/>}</div><p className="ho-task-time">{proposed?`${formatDemoHour(proposed.startHour)} → ${formatDemoHour(proposed.endHour)}`:"No valid proposed task."}</p>{proposed&&<p className="ho-task-stats">{proposed.energyKwh.toFixed(2)} kWh · {usd(proposed.costUsd)} · {kg(proposed.carbonGrams)} modeled CO₂e{entry.schedulingPolicy==="fixed"&&" · unchanged, excluded from savings"}</p>}{baseline&&<small className="ho-original-time">Original: {formatDemoHour(baseline.startHour)} → {formatDemoHour(baseline.endHour)}</small>}</>}</div></article>;
      })}</div>
    </>}
    <details className="ho-details"><summary>Details · budget, numbers & model rules</summary><div className="ho-details-body">
      <div className="ho-budget"><h3>Modeled power budget</h3><label>Modeled power budget (kW)<input type="number" min="0.1" max="100" step="0.1" value={budget} disabled={unlimited} onChange={event=>setBudget(event.target.value)}/></label><label className="ho-check"><input type="checkbox" checked={unlimited} onChange={event=>setUnlimited(event.target.checked)}/> No shared power limit</label><p>Editable demo assumption, not a measured circuit rating. Fixed fan and thermal background reserve power first. Recalculate using Optimize schedule above.</p></div>
      {result?.status==="feasible"&&<><p>Original flexible tasks: {result.baseline?`${usd(result.baseline.costUsd)} · ${kg(result.baseline.carbonGrams)}`:"not available"}. {LABELS[mode]}: {result.proposed?`${usd(result.proposed.costUsd)} · ${kg(result.proposed.carbonGrams)} · ${result.proposed.energyKwh.toFixed(2)} kWh`:"no flexible tasks"}.</p>{!result.baselineFeasible&&<p>The fixed original baseline does not meet all current constraints. It is a comparison reference, not a runnable recommendation.</p>}{result.peakModeledPowerKw!==null&&<p>Peak included modeled load: {result.peakModeledPowerKw.toFixed(2)} kW.</p>}</>}
      {current&&<><h3>Three routes, exact estimates</h3><p>Flexible tasks only. Tied points may overlap; the table gives every value.</p>
      {points.length>0&&<svg className="ho-chart" viewBox="0 0 500 220" role="img" aria-label="Flexible-task cost against modeled carbon; exact alternatives follow in the table"><path d="M60 25V170H460" fill="none" stroke="currentColor"/><text x="60" y="18">Cost (USD)</text><text x="220" y="208">Modeled CO₂e (kg)</text><text x="50" y="185">{(minCarbon/1000).toFixed(2)}</text><text x="420" y="185">{(maxCarbon/1000).toFixed(2)}</text><text x="5" y="45">{usd(maxCost)}</text><text x="5" y="170">{usd(minCost)}</text>{points.map((point,index)=><g key={point.mode}><title>{`${LABELS[point.mode]}: ${usd(point.costUsd)}, ${kg(point.carbonGrams)} modeled CO₂e`}</title><circle cx={x(point.carbonGrams)} cy={y(point.costUsd)} r={10-index*2} className={`ho-point ho-point-${point.mode}`}/><text x={x(point.carbonGrams)+12} y={y(point.costUsd)+index*17-12}>{index+1}</text></g>)}</svg>}
      <div className="ho-table-wrap" tabIndex={0} role="region" aria-label="Computed alternatives"><table><caption>Flexible tasks only · exact modeled estimates</caption><thead><tr><th>Objective</th><th>USD</th><th>CO₂e (kg)</th><th>kWh</th><th>Result</th></tr></thead><tbody>{MODES.map((value,index)=>{const row=current.results[value];return <tr key={value}><th>{index+1}. {LABELS[value]}</th><td>{row.status==="feasible"&&row.proposed?usd(row.proposed.costUsd):"—"}</td><td>{row.status==="feasible"&&row.proposed?(row.proposed.carbonGrams/1000).toFixed(3):"—"}</td><td>{row.status==="feasible"&&row.proposed?row.proposed.energyKwh.toFixed(2):"—"}</td><td>{row.status==="feasible"?(row.solver.optimal?"Optimal in model":"Computed"):row.status}</td></tr>;})}</tbody></table></div><p>Fixed fan, unchanged and separate: {result?.unchangedTotals?`${result.unchangedTotals.energyKwh.toFixed(2)} kWh · ${usd(result.unchangedTotals.costUsd)} · ${kg(result.unchangedTotals.carbonGrams)}`:"not modeled"}.</p></>}
      <h3>Weather & model rules</h3><p>{context.weatherLabel}</p><p>48-hour thermal background: {context.backgroundTotals.energyKwh.toFixed(2)} kWh · {usd(context.backgroundTotals.costUsd)} · {kg(context.backgroundTotals.carbonGrams)} modeled CO₂e. Separate from flexible-task savings; Chill is not added again.</p><p>This is not a full household bill. Protected refrigeration, water heating, other loads and fixed charges are excluded.</p><ul>{[...context.assumptions,...(result?.assumptions??[])].map((line,index)=><li key={index}>{line}</li>)}</ul>
    </div></details>
  </section>;
}
