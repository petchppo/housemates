"use client";

import { useState } from "react";
import type { HouseholdState } from "@/domain/household";
import { optimizeHousehold, type SchedulingRequest, type OptimizationMode } from "@/domain/scheduling";
import { hourlyEnergy } from "@/data/energy";
import { planningTime } from "./energy-parliament";

const fieldClass = "mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm";
function NumberField({ label, value, onChange, step = "0.1", min = 0.1 }: { label: string; value: number; onChange: (value: number) => void; step?: string; min?: number }) {
  return <label className="block text-sm text-stone-700">{label}<input className={fieldClass} type="number" step={step} min={min} value={Number.isFinite(value) ? value : ""} onChange={event => onChange(event.target.value === "" ? NaN : Number(event.target.value))}/></label>;
}
function TimeField({ label, value, onChange, deadline = false }: { label: string; value: number; onChange: (value: number) => void; deadline?: boolean }) {
  return <label className="block text-sm text-stone-700">{label}<select className={fieldClass} value={value} onChange={event => onChange(Number(event.target.value))}>{Array.from({ length: deadline ? 49 : 48 }, (_, hour) => <option value={hour} key={hour}>{planningTime(hour)}</option>)}</select></label>;
}

export function HouseholdSettings({ state, onApply }: { state: HouseholdState; onApply: (requests: SchedulingRequest[], mode: OptimizationMode, limit: number | null) => void }) {
  const [requests, setRequests] = useState(() => structuredClone(state.requests));
  const [mode, setMode] = useState(state.mode);
  const [limitEnabled, setLimitEnabled] = useState(state.sharedPowerLimitKw !== null);
  const [limit, setLimit] = useState(state.sharedPowerLimitKw ?? 7);
  const bubbles = requests.find(request => request.appliance.kind === "dishwasher")!;
  const [profile, setProfile] = useState(bubbles.appliance.kind === "dishwasher" ? bubbles.appliance.constraints.cycleProfileKwh?.join(", ") ?? "" : "");
  const [errors, setErrors] = useState<string[]>([]);
  function update(index: number, change: (request: SchedulingRequest) => SchedulingRequest) {
    setRequests(current => current.map((request, i) => i === index ? change(request) : request));
  }
  function apply() {
    const next = requests.map(request => request.appliance.kind !== "dishwasher" ? request : {
      ...request, appliance: { ...request.appliance, constraints: { ...request.appliance.constraints,
        cycleProfileKwh: profile.trim() ? profile.split(",").map(value => value.trim() ? Number(value.trim()) : NaN) : undefined } },
    });
    const result = optimizeHousehold(next, hourlyEnergy, mode, limitEnabled ? limit : undefined);
    if (result.status === "invalid-input") { setErrors(result.issues); return; }
    setErrors([]);
    onApply(next, mode, limitEnabled ? limit : null);
  }
  return <section className="space-y-6" aria-labelledby="settings-title">
    <div><p className="eyebrow">You set the rules</p><h2 id="settings-title" className="mt-2 text-3xl font-semibold tracking-tight">Household preferences</h2><p className="mt-3 text-sm leading-6 text-stone-600">These settings are remembered in this browser. A preferred start window is a hard constraint; the full session must also finish by its deadline. Changes require a new plan approval.</p></div>
    <div className="grid gap-5 md:grid-cols-2">{requests.map((request, index) => {
      const agent = request.appliance;
      const deadline = agent.kind === "ev" ? agent.constraints.readyByHour : agent.constraints.finishByHour;
      return <fieldset key={agent.id} className="rounded-2xl border border-stone-200 bg-white/80 p-5"><legend className="px-2 text-lg font-semibold">{agent.name}’s settings</legend><div className="grid gap-4">
        <TimeField label={`${agent.name} earliest start`} value={request.startWindow.earliestHour} onChange={hour => update(index, current => ({ ...current, startWindow: { ...current.startWindow, earliestHour: hour } }))}/>
        <TimeField label={`${agent.name} latest start`} value={request.startWindow.latestHour} onChange={hour => update(index, current => ({ ...current, startWindow: { ...current.startWindow, latestHour: hour } }))}/>
        <TimeField label={`${agent.name} completion deadline`} deadline value={deadline} onChange={hour => update(index, current => ({ ...current, appliance: current.appliance.kind === "ev" ? { ...current.appliance, constraints: { ...current.appliance.constraints, readyByHour: hour } } : { ...current.appliance, constraints: { ...current.appliance.constraints, finishByHour: hour } } }))}/>
        {agent.kind === "ev" ? <>
          <NumberField label="Evie energy needed (kWh)" value={agent.constraints.energyNeededKwh} onChange={value => update(index, current => current.appliance.kind === "ev" ? { ...current, appliance: { ...current.appliance, constraints: { ...current.appliance.constraints, energyNeededKwh: value } } } : current)}/>
          <NumberField label="Evie charging power (kW)" value={agent.constraints.maxPowerKw} onChange={value => update(index, current => current.appliance.kind === "ev" ? { ...current, appliance: { ...current.appliance, constraints: { ...current.appliance.constraints, maxPowerKw: value } } } : current)}/>
        </> : <>
          <NumberField label="Bubbles cycle duration (hours)" min={1} step="1" value={agent.constraints.cycleHours} onChange={value => update(index, current => current.appliance.kind === "dishwasher" ? { ...current, appliance: { ...current.appliance, constraints: { ...current.appliance.constraints, cycleHours: value } } } : current)}/>
          <NumberField label="Bubbles total cycle energy (kWh)" value={agent.constraints.cycleEnergyKwh} onChange={value => update(index, current => current.appliance.kind === "dishwasher" ? { ...current, appliance: { ...current.appliance, constraints: { ...current.appliance.constraints, cycleEnergyKwh: value } } } : current)}/>
          <label className="block text-sm text-stone-700">Bubbles hourly energy profile (optional)<input className={fieldClass} value={profile} onChange={e => setProfile(e.target.value)} placeholder="e.g. 0.9, 0.3"/><span className="mt-2 block text-xs leading-5 text-stone-500">Comma-separated kWh values, one per cycle hour. Must add up to the total energy above. Empty uses an even distribution.</span></label>
        </>}
        <p className="text-xs leading-5 text-stone-500">Original comparison start: {planningTime(request.baselineStartHour)}. Physical availability starts {planningTime(agent.kind === "ev" ? agent.constraints.availableFromHour : agent.constraints.earliestStartHour)}.</p>
      </div></fieldset>;
    })}</div>
    <div className="grid gap-5 rounded-2xl border border-stone-200 bg-white/80 p-5 sm:grid-cols-2">
      <label className="block text-sm">Default objective<select className={fieldClass} value={mode} onChange={e => setMode(e.target.value as OptimizationMode)}><option value="cost">Cost-first</option><option value="carbon">Carbon-first</option><option value="balanced">Balanced</option></select></label>
      <div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={limitEnabled} onChange={e => setLimitEnabled(e.target.checked)} className="accent-emerald-800"/>Apply shared power limit</label>{limitEnabled && <div className="mt-3"><NumberField label="Combined flexible-appliance power limit (kW)" value={limit} onChange={setLimit}/></div>}<p className="mt-2 text-xs text-stone-500">Off by default. Only Evie and Bubbles count toward this optional limit.</p></div>
    </div>
    {errors.length > 0 && <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">Check these settings</p><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
    <button type="button" onClick={apply} className="rounded-full bg-emerald-900 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-800">Remember settings & propose a plan</button>
    <div className="rounded-2xl bg-[#e6eef0] p-5 text-sm leading-6"><h3 className="font-semibold">Chill’s comfort promise</h3><p className="mt-2">The AC stays outside this optimizer. Its illustrative 22–25°C comfort range is a planning preference, not measured room temperature or a guarantee. No cooling commands are sent and no AC savings are included.</p></div>
  </section>;
}
