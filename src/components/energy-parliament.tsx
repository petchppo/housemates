"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ApplianceIcon } from "./appliance-icon";
import { defaultSchedulingRequests } from "@/data/scheduling";
import { energyScenario, formatHour, hourlyEnergy } from "@/data/energy";
import { compareSchedules, optimizeHousehold, type OptimizationMode, type Schedule,
  type ScheduleAssessment, type SchedulingRequest } from "@/domain/scheduling";

const modes: { value: OptimizationMode; label: string; description: string }[] = [
  { value: "cost", label: "Cost-first", description: "Lowest feasible electricity cost" },
  { value: "carbon", label: "Carbon-first", description: "Lowest estimated grid emissions" },
  { value: "balanced", label: "Balanced", description: "Equal weight on normalized cost and carbon" },
];
const money = (value: number) => `$${value.toFixed(2)}`;
const carbon = (value: number) => `${(value / 1000).toFixed(3)} kg CO₂e`;
const signedMoney = (value: number) => `${value < -0.000001 ? "−" : value > 0.000001 ? "+" : ""}${money(Math.abs(value))}`;
const signedCarbon = (value: number) => `${value < -0.000001 ? "−" : value > 0.000001 ? "+" : ""}${carbon(Math.abs(value))}`;

export function planningTime(hour: number): string {
  if (hour === 48) return "End of Day 2 · midnight";
  const minutes = Math.round(hour * 60);
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `Day ${Math.floor(minutes / 1440) + 1} · ${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}
function sessionTime(schedule: Schedule) {
  return `${planningTime(schedule.startHour)} → ${planningTime(schedule.endHour)}`;
}
const inputClass = "mt-2 w-full rounded-xl border border-stone-300 bg-white p-3 text-sm text-stone-800 focus:border-emerald-700";

function HourSelect({ label, value, onChange, end = false }: { label: string; value: number; onChange: (hour: number) => void; end?: boolean }) {
  return <label className="block text-sm font-medium text-stone-700">{label}
    <select className={inputClass} value={value} onChange={event => onChange(Number(event.target.value))}>
      {Array.from({ length: end ? 49 : 48 }, (_, hour) => <option key={hour} value={hour}>{planningTime(hour)}</option>)}
    </select>
  </label>;
}

function ScheduleCard({ title, assessment, proposed = false }: { title: string; assessment: ScheduleAssessment; proposed?: boolean }) {
  const schedule = assessment.schedule;
  return <section className={`rounded-2xl border p-5 ${proposed ? "border-emerald-200 bg-emerald-50/60" : "border-stone-200 bg-white/70"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{title}</h3>
      <span className={`rounded-full px-2 py-1 text-xs ${assessment.feasible ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{assessment.feasible ? "Feasible" : "Not feasible"}</span>
    </div>
    {schedule ? <>
      <p className="mt-4 text-sm leading-6">{sessionTime(schedule)}</p>
      <p className="mt-1 text-xs text-stone-500">{schedule.energyKwh.toFixed(2)} kWh · {schedule.powerKw.toFixed(2)} kW peak modeled power · {(schedule.endHour - schedule.startHour).toFixed(2)} hours</p>
      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3"><div><p className="text-xs text-stone-500">Electricity cost</p><p className="mt-1 text-2xl font-semibold">{money(schedule.costUsd)}</p></div><div><p className="text-xs text-stone-500">Estimated carbon</p><p className="mt-1 text-xl font-semibold">{carbon(schedule.carbonGrams)}</p></div></div>
    </> : <p className="mt-4 text-sm text-stone-600">No complete schedule can be displayed.</p>}
    {assessment.issues.length > 0 && <ul className="mt-4 space-y-1 text-xs leading-5 text-amber-900">{assessment.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
  </section>;
}

export function EnergyTimeline({ original, optimized, day, onDayChange }: { original: Schedule | null; optimized: Schedule | null; day: number; onDayChange: (day: number) => void }) {
  const rows = hourlyEnergy.map(row => {
    const hour = row.hour + day * 24;
    return { ...row, hour,
      originalKwh: original?.intervals.find(interval => interval.hour === hour)?.energyKwh ?? 0,
      proposedKwh: optimized?.intervals.find(interval => interval.hour === hour)?.energyKwh ?? 0 };
  });
  const maxKwh = Math.max(1, ...rows.flatMap(row => [row.originalKwh, row.proposedKwh]));
  return <section className="rounded-2xl border border-stone-200 bg-white/70 p-5 sm:p-6" aria-labelledby="timeline-title">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 id="timeline-title" className="text-xl font-semibold">24-hour energy timeline</h2><p className="mt-1 text-xs text-stone-500">Hourly energy (kWh) · selected appliance · {optimized ? "simulated schedules" : "no optimized schedule available"}</p></div>
      <label className="text-sm">View day <select className="ml-2 rounded-lg border border-stone-300 bg-white p-2" value={day} onChange={e => onDayChange(Number(e.target.value))}><option value={0}>Day 1</option><option value={1}>Day 2</option></select></label>
    </div>
    <div className="mt-5 flex flex-wrap gap-5 text-xs text-stone-600"><span><span className="mr-2 inline-block h-2 w-2 rounded-sm bg-stone-400"/>Original</span><span><span className="mr-2 inline-block h-2 w-2 rounded-sm bg-emerald-800"/>Optimized</span><span>Chart maximum: {maxKwh.toFixed(1)} kWh</span></div>
    <div className="mt-5 grid h-36 grid-cols-24 gap-1 border-b border-stone-200" role="img" aria-label={`Day ${day + 1} original and optimized hourly energy use. Exact values are in the hourly calculation details below.`}>
      {rows.map(row => <div key={row.hour} className="flex min-w-0 items-end gap-px" title={`${planningTime(row.hour)}: original ${row.originalKwh.toFixed(3)} kWh, optimized ${optimized ? row.proposedKwh.toFixed(3) : "unavailable"} kWh`}>
        <div className="w-1/2 rounded-t-sm bg-stone-400" style={{ height: `${row.originalKwh / maxKwh * 100}%` }}/>
        <div className="w-1/2 rounded-t-sm bg-emerald-800" style={{ height: `${row.proposedKwh / maxKwh * 100}%` }}/>
      </div>)}
    </div>
    <div className="mt-2 grid grid-cols-24 text-[10px] text-stone-500">{[0, 6, 12, 18, 23].map(hour => <span key={hour} style={{ gridColumnStart: hour + 1, gridColumnEnd: hour === 23 ? 25 : hour + 4 }} className={hour === 23 ? "text-right" : ""}>{hour === 23 ? "23h" : formatHour(hour)}</span>)}</div>
    {![original, optimized].some(schedule => schedule?.intervals.some(row => row.hour >= day * 24 && row.hour < (day + 1) * 24)) && <p className="mt-4 text-sm text-stone-500">No scheduled energy use on this day. Switch days to inspect the overnight session.</p>}
    <details className="mt-6 border-t border-stone-200 pt-4"><summary className="cursor-pointer text-sm font-medium text-emerald-900">Hourly calculation details</summary>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><caption className="mb-3 text-left text-stone-500">Day {day + 1} synthetic rates and scheduled consumption. Each row covers one hour.</caption><thead><tr>{["Hour", "$/kWh", "kg CO₂e/kWh", "Original kWh", "Optimized kWh"].map(title => <th key={title} scope="col" className="p-2">{title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.hour} className="border-t border-stone-200"><th scope="row" className="p-2 font-normal">{formatHour(row.hour)}</th><td className="p-2">{row.priceUsdPerKwh.toFixed(2)}</td><td className="p-2">{(row.carbonGramsPerKwh / 1000).toFixed(3)}</td><td className="p-2">{original ? row.originalKwh.toFixed(3) : "—"}</td><td className="p-2">{optimized ? row.proposedKwh.toFixed(3) : "—"}</td></tr>)}</tbody></table></div>
    </details>
  </section>;
}

export function EnergyParliament() {
  const [requests, setRequests] = useState<readonly SchedulingRequest[]>(() => structuredClone(defaultSchedulingRequests));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<OptimizationMode>("cost");
  const [day, setDay] = useState(0);
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [powerLimit, setPowerLimit] = useState(7);
  const plans = useMemo(() => Object.fromEntries(modes.map(item => [item.value,
    optimizeHousehold(requests, hourlyEnergy, item.value, limitEnabled ? powerLimit : undefined)])) as Record<OptimizationMode, ReturnType<typeof optimizeHousehold>>,
  [requests, limitEnabled, powerLimit]);
  const plan = plans[mode];
  const request = requests[selectedIndex];
  const agent = request.appliance;
  const selected = plan.appliances[selectedIndex];
  const proposed = plan.schedules.find(schedule => schedule.applianceId === agent.id) ?? null;
  const deadline = agent.kind === "ev" ? agent.constraints.readyByHour : agent.constraints.finishByHour;
  const available = agent.kind === "ev" ? agent.constraints.availableFromHour : agent.constraints.earliestStartHour;
  const comparison = selected.baseline.schedule && proposed ? compareSchedules(selected.baseline.schedule, proposed) : null;
  function updateRequest(update: (current: SchedulingRequest) => SchedulingRequest) {
    setRequests(current => current.map((item, index) => index === selectedIndex ? update(item) : item));
  }
  function changeDeadline(hour: number) {
    updateRequest(current => ({ ...current, appliance: current.appliance.kind === "ev"
      ? { ...current.appliance, constraints: { ...current.appliance.constraints, readyByHour: hour } }
      : { ...current.appliance, constraints: { ...current.appliance.constraints, finishByHour: hour } } }));
  }

  return <div className="mx-auto max-w-6xl px-5 py-6 sm:px-10 sm:py-8">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-5"><Link href="/" className="text-sm font-semibold text-emerald-900">← Housemates home</Link><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">Simulation · synthetic energy data</span></header>
    <main className="py-9">
      <p className="eyebrow">A planning laboratory for your household</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Energy Parliament</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">Give Evie and Bubbles a window to work with. Compare deterministic scheduling options, estimated costs, and grid emissions before making a plan. No appliances are connected.</p>

      <section className="mt-8 rounded-2xl bg-emerald-950 p-6 text-white" aria-labelledby="household-title">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="household-title" className="font-semibold">Flexible-appliance household totals</h2><span className="text-xs text-emerald-200">Evie + Bubbles · Chill excluded</span></div>
        {plan.proposed && plan.baseline && plan.comparison ? <div className="mt-5 grid gap-5 sm:grid-cols-3" aria-live="polite">
          <div><p className="text-xs text-emerald-200">Estimated cost savings</p><p className="mt-2 text-3xl font-semibold">{signedMoney(plan.comparison.costSavingsUsd)}</p><p className="mt-2 text-xs text-emerald-100">{money(plan.baseline.costUsd)} original → {money(plan.proposed.costUsd)} planned</p></div>
          <div><p className="text-xs text-emerald-200">Estimated carbon reduction</p><p className="mt-2 text-2xl font-semibold">{signedCarbon(plan.comparison.carbonReductionGrams)}</p><p className="mt-2 text-xs text-emerald-100">{carbon(plan.baseline.carbonGrams)} → {carbon(plan.proposed.carbonGrams)}</p></div>
          <div><p className="text-xs text-emerald-200">Planned energy</p><p className="mt-2 text-3xl font-semibold">{plan.proposed.energyKwh.toFixed(2)} kWh</p><p className="mt-2 text-xs text-emerald-100">Same tasks, different operating times</p></div>
        </div> : <p className="mt-4 text-sm text-emerald-100" aria-live="polite">{plan.status === "feasible" ? "A plan exists, but the original session extends beyond the timeline. Savings cannot be compared." : "No feasible household plan. Resolve the constraints below to calculate savings."}</p>}
        {!plan.baselineFeasible && plan.baseline && <p className="mt-4 text-xs leading-5 text-amber-200">The original schedule violates the current constraints. Comparisons retain that original reference; they do not imply it is feasible now.</p>}
        <p className="mt-4 text-xs text-emerald-200">Positive savings/reductions mean improvement; negative values mean an increase.</p>
      </section>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="rounded-2xl border border-stone-200 bg-white/70 p-5" aria-label="Scheduling controls">
          <h2 className="text-lg font-semibold">Set the ground rules</h2>
          <label className="mt-5 block text-sm font-medium text-stone-700">Appliance<select className={inputClass} value={selectedIndex} onChange={event => setSelectedIndex(Number(event.target.value))}><option value={0}>Evie · EV charger</option><option value={1}>Bubbles · Dishwasher</option></select></label>
          <div className="mt-5 flex items-center gap-3"><div className={`avatar ${agent.id}`}><ApplianceIcon id={agent.id} className="h-7 w-7"/></div><p className="text-xs leading-5 text-stone-600">{agent.kind === "ev" ? `${agent.constraints.energyNeededKwh} kWh required · uninterrupted charging` : `${agent.constraints.cycleHours}-hour uninterrupted cycle · ${agent.constraints.cycleEnergyKwh} kWh`}<br/>Available {planningTime(available)}</p></div>
          <fieldset className="mt-6 space-y-4"><legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">Preferred start window</legend>
            <HourSelect label="Earliest allowed start" value={request.startWindow.earliestHour} onChange={hour => updateRequest(current => ({ ...current, startWindow: { ...current.startWindow, earliestHour: hour } }))}/>
            <HourSelect label="Latest allowed start" value={request.startWindow.latestHour} onChange={hour => updateRequest(current => ({ ...current, startWindow: { ...current.startWindow, latestHour: hour } }))}/>
          </fieldset>
          <p className="mt-2 text-xs leading-5 text-stone-500">The preferred window is enforced as a hard start constraint. The session may finish after this window, but must finish by the deadline.</p>
          <div className="mt-5"><HourSelect label="Completion deadline" value={deadline} onChange={changeDeadline} end/></div>
          {agent.kind === "ev" && <label className="mt-5 block text-sm font-medium text-stone-700">Charging power (kW)<input className={inputClass} type="number" min="0.1" step="0.1" value={Number.isFinite(agent.constraints.maxPowerKw) ? agent.constraints.maxPowerKw : ""} onChange={event => {
            const power = event.target.value === "" ? NaN : Number(event.target.value);
            updateRequest(current => current.appliance.kind === "ev" ? { ...current, appliance: { ...current.appliance, constraints: { ...current.appliance.constraints, maxPowerKw: power } } } : current);
          }}/></label>}
          <div className="mt-6 border-t border-stone-200 pt-5"><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-emerald-800" checked={limitEnabled} onChange={e => setLimitEnabled(e.target.checked)}/>Apply a shared power limit</label>
            {limitEnabled && <label className="mt-3 block text-sm font-medium">Shared limit (kW)<input className={inputClass} type="number" min="0.1" step="0.1" value={Number.isFinite(powerLimit) ? powerLimit : ""} onChange={e => setPowerLimit(e.target.value === "" ? NaN : Number(e.target.value))}/></label>}
            <p className="mt-2 text-xs leading-5 text-stone-500">{limitEnabled ? "Limits the combined active power of Evie and Bubbles only." : "Off by default. Appliances may run at the same time."}</p>
          </div>
          <button type="button" className="mt-5 text-sm font-semibold text-emerald-900 underline underline-offset-4" onClick={() => { setRequests(structuredClone(defaultSchedulingRequests)); setLimitEnabled(false); setPowerLimit(7); setMode("cost"); setDay(0); }}>Reset planning inputs</button>
        </aside>

        <div className="min-w-0 space-y-6">
          <section aria-labelledby="objective-title"><h2 id="objective-title" className="text-lg font-semibold">Choose the household objective</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">{modes.map(item => <button key={item.value} type="button" aria-pressed={mode === item.value} onClick={() => setMode(item.value)} className={`rounded-xl border p-4 text-left transition ${mode === item.value ? "border-emerald-800 bg-emerald-900 text-white" : "border-stone-200 bg-white/70 hover:border-emerald-700"}`}><span className="text-sm font-semibold">{item.label}</span><span className={`mt-1 block text-xs leading-5 ${mode === item.value ? "text-emerald-100" : "text-stone-500"}`}>{item.description}</span></button>)}</div>
          </section>
          {plan.issues.length > 0 && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><p className="font-semibold">{plan.status === "invalid-input" ? "Check your inputs" : "No feasible household plan"}</p><ul className="mt-2 space-y-1">{plan.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></div>}
          <section aria-labelledby="comparison-title"><h2 id="comparison-title" className="mb-3 text-lg font-semibold">{agent.name}’s schedule comparison</h2><div className="grid gap-3 sm:grid-cols-2"><ScheduleCard title="Original schedule" assessment={selected.baseline}/><ScheduleCard title="Optimized schedule" proposed assessment={{ schedule: proposed, feasible: proposed !== null, issues: proposed ? [] : plan.issues }}/></div>
            {comparison && <p className="mt-3 text-sm leading-6 text-stone-600">{agent.name}’s estimated savings: <strong>{signedMoney(comparison.costSavingsUsd)}</strong> · Carbon reduction: <strong>{signedCarbon(comparison.carbonReductionGrams)}</strong></p>}
            <p className="mt-2 text-xs leading-5 text-stone-500">Original start stays at {planningTime(request.baselineStartHour)}. Both schedules use the current energy requirement and charging power, so the comparison measures timing changes.</p>
          </section>
          <EnergyTimeline original={selected.baseline.schedule} optimized={proposed} day={day} onDayChange={setDay}/>
          <section className="rounded-2xl border border-stone-200 bg-white/70 p-5" aria-labelledby="tradeoffs-title"><h2 id="tradeoffs-title" className="text-lg font-semibold">Compare the tradeoffs</h2><p className="mt-2 text-xs leading-5 text-stone-500">{agent.name}’s part of each optimized household plan. Some objectives may choose the same time.</p>
            <div className="mt-4 space-y-3">{modes.map(item => {
              const option = plans[item.value].schedules.find(schedule => schedule.applianceId === agent.id);
              return <div key={item.value} className="rounded-xl bg-stone-50 p-3"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">{item.label}</h3><span className="text-sm">{option ? `$${option.costUsd.toFixed(3)} · ${carbon(option.carbonGrams)}` : "No feasible plan"}</span></div><p className="mt-1 text-xs leading-5 text-stone-500">{option ? sessionTime(option) : plans[item.value].issues[0]}</p></div>;
            })}</div>
            <p className="mt-4 text-xs leading-5 text-stone-500">Balanced scores cost and carbon equally after normalizing each to its range across feasible household plans. Ties prefer lower cost, then lower carbon, then earlier starts. Cheapest does not necessarily mean cleanest.</p>
          </section>
        </div>
      </div>
      <section className="mt-8 rounded-2xl border border-stone-200 p-5 text-sm leading-6 text-stone-600" aria-labelledby="assumptions-title"><h2 id="assumptions-title" className="font-semibold text-stone-800">What this simulation assumes</h2><ul className="mt-3 list-disc space-y-2 pl-5"><li>Two fictional days, hours 0–48, in {energyScenario.timezone}. The same synthetic 24-hour rates repeat on Day 2. There is no calendar date or daylight-saving transition.</li><li>All sessions start on whole hours. Evie charges at constant power until 12 kWh is delivered; the final hour is billed only for energy used. Bubbles uses constant power across its two-hour cycle. Displayed finish times are rounded to the nearest minute.</li><li>All feasible hourly starts are searched. Constraints are validated before recommending a plan. Results represent estimates for these two flexible appliances, not a complete home electricity bill.</li><li>Chill remains in the household but is excluded from scheduling and totals. AC comfort needs a thermal model.</li><li>{energyScenario.source} Costs exclude taxes and fixed charges. Carbon estimates are operational grid emissions. No live telemetry, device commands, or AI dialogue are used here.</li></ul></section>
    </main>
  </div>;
}
