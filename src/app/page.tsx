import Link from "next/link";
import { PhoneStory } from "@/components/phone-story";
import { ApplianceIcon } from "@/components/appliance-icon";
import { applianceAgents } from "@/data/appliances";
import { energyScenario, formatHour, hourlyEnergy } from "@/data/energy";
import { estimateUsage } from "@/domain/energy";

// Labels derive from the same constraints the future scheduler will consume.
function constraintLabels(agent: (typeof applianceAgents)[number]) {
  switch (agent.kind) {
    case "ev": return [`${agent.constraints.energyNeededKwh} kWh to charge`, `Ready by ${formatHour(agent.constraints.readyByHour)}`];
    case "dishwasher": return [`${agent.constraints.cycleHours}-hour uninterrupted cycle`, `Clean by ${formatHour(agent.constraints.finishByHour)}`];
    case "air-conditioner": return [`${agent.constraints.minComfortC}–${agent.constraints.maxComfortC}°C comfort range`, `Home ${formatHour(agent.constraints.occupiedFromHour)}–${formatHour(agent.constraints.occupiedUntilHour)}`];
  }
}

export default function Home() {
  const cheapest = hourlyEnergy.reduce((best, row) => row.priceUsdPerKwh < best.priceUsdPerKwh ? row : best);
  const peak = hourlyEnergy.reduce((best, row) => row.priceUsdPerKwh > best.priceUsdPerKwh ? row : best);
  const example = estimateUsage(1, cheapest);

  return (
    <div className="hh-home"><div className="mx-auto max-w-6xl px-6 sm:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 py-6">
        <a href="#" className="flex items-center gap-2.5 text-xl font-bold tracking-tight" aria-label="Housemates home"><span className="brand-mark" aria-hidden="true">⌂</span>housemates<span className="text-emerald-700">.</span></a>
        <span className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600">Stanford CleanTech · Prototype</span>
      </header>

      <main>
        <section className="grid items-center gap-12 py-16 md:grid-cols-[1.15fr_1fr] md:py-24" aria-labelledby="intro">
          <div>
            <p className="eyebrow mb-5"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-700"/>A little teamwork. A lighter footprint.</p>
            <h1 id="intro" className="max-w-xl text-5xl font-semibold leading-[1.08] tracking-[-0.055em] sm:text-6xl">Small appliances.<br/><span className="text-emerald-800">Big main-character energy.</span></h1>
            <p className="mt-6 max-w-md text-base leading-7 text-stone-600">Meet the appliances with a plan. Housemates is an AI-powered household energy-planning concept where your EV, dishwasher, and AC work together around your day.</p>
            <Link href="/demo" className="mt-8 inline-flex items-center gap-6 rounded-full bg-emerald-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-800">Join the demo <span aria-hidden="true">↗</span></Link>
            <Link href="/household" className="ml-0 mt-4 inline-flex rounded-full border border-emerald-800 px-6 py-3 text-sm font-semibold text-emerald-900 sm:ml-3">Enter Appliance Parliament ↗</Link>
            <p className="mt-4 text-xs text-stone-500">Your comfort and deadlines come first.</p>
          </div>

          <div className="hh-home-party"><p className="eyebrow">Choose your party. Build a better routine.</p><div className="hh-home-sprites">{applianceAgents.map(agent=><Link key={agent.id} href="/household" className={`hh-home-sprite ${agent.id}`}><ApplianceIcon id={agent.id}/><strong>{agent.name}</strong><span>LV.01 · MEET ↗</span></Link>)}</div><p className="hh-kicker">A whole little world is waiting.</p><Link href="/demo" className="hh-start-game">BUILD YOUR LITTLE WORLD →</Link></div>
        </section>

        <PhoneStory/>

        <aside className="flex items-start gap-3 rounded-xl border border-[#d9dfc7] bg-[#eff2e8] p-4 text-sm leading-6 text-stone-600"><span className="mt-0.5 text-emerald-800" aria-hidden="true">ⓘ</span><p><strong className="font-semibold text-stone-800">A transparent demo.</strong> Appliance states and messages are simulated. Prices and carbon data are synthetic. No devices are connected. Negotiate and save a plan in <Link href="/household" className="font-semibold text-emerald-900 underline underline-offset-2">Appliance Parliament</Link>, or inspect calculations in <a href="/energy-parliament" className="font-semibold text-emerald-900 underline underline-offset-2">Energy Parliament</a>. The playable scene has API-placeholder replies; simulation controls run functional calculations.</p></aside>

        <section id="housemates" className="scroll-mt-8 py-16" aria-labelledby="agents-heading">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow mb-3">Small personalities. Shared purpose.</p><h2 id="agents-heading" className="text-3xl font-semibold tracking-tight">Meet the home team.</h2></div><p className="text-sm text-stone-500">Three agents. One household.</p></div>
          <div className="grid gap-4 md:grid-cols-3">{applianceAgents.map((agent) => <article key={agent.id} className="rounded-2xl border border-stone-200 bg-white/60 p-6"><div className="flex items-center justify-between"><div className={`avatar avatar-large ${agent.id}`}><ApplianceIcon id={agent.id} className="h-10 w-10"/></div><span className="text-[10px] font-medium uppercase tracking-widest text-stone-500">Simulated</span></div><h3 className="mt-5 text-2xl font-semibold tracking-tight">{agent.name}</h3><p className="mt-1 text-xs font-semibold uppercase tracking-wider text-stone-500">{agent.role}</p><p className="mt-4 min-h-12 text-sm leading-6 text-stone-600">{agent.personality}</p><ul className="mt-5 space-y-2 border-t border-stone-200 pt-4">{constraintLabels(agent).map((detail) => <li key={detail} className="flex gap-2 text-xs text-stone-600"><span className="text-emerald-700" aria-hidden="true">✓</span>{detail}</li>)}</ul></article>)}</div>
        </section>

        <section className="mb-16 rounded-2xl border border-stone-200 bg-white/60 p-6 sm:p-8" aria-labelledby="energy-heading">
          <div className="flex flex-wrap justify-between gap-4"><div><p className="eyebrow mb-3">The signals behind the plan</p><h2 id="energy-heading" className="text-2xl font-semibold tracking-tight">Every hour has a different story.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">A fictional California weekday: higher evening prices and a cleaner midday grid. These are illustrative patterns, not a real tariff or forecast.</p></div><span className="h-fit rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">Synthetic data · 24 hours</span></div>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-xs text-stone-600"><span><span className="mr-2 inline-block h-2 w-2 rounded-sm bg-emerald-800"/>Electricity price · $/kWh</span><span>Lowest ${cheapest.priceUsdPerKwh.toFixed(2)} · Peak ${peak.priceUsdPerKwh.toFixed(2)}</span></div>
          <div className="mt-5 flex h-32 items-end gap-1.5 sm:gap-2" role="img" aria-label={`Synthetic hourly electricity prices range from ${cheapest.priceUsdPerKwh * 100} to ${peak.priceUsdPerKwh * 100} cents per kilowatt-hour, peaking at ${formatHour(peak.hour)}. Exact values are in the expandable data table below.`}>{hourlyEnergy.map((row) => <div key={row.hour} className={`min-w-0 flex-1 rounded-t-sm ${row.hour >= 16 && row.hour < 21 ? "bg-[#adc197]" : "bg-emerald-800"}`} style={{ height: `${row.priceUsdPerKwh / 0.6 * 100}%` }}/>)}</div>
          <div className="mt-3 flex justify-between text-[11px] text-stone-500"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
          <p className="mt-6 rounded-lg bg-[#f3f3ec] px-4 py-3 text-sm leading-6 text-stone-600"><strong className="text-stone-800">Working calculation:</strong> using 1 kWh at {formatHour(cheapest.hour)} costs ${example.costUsd.toFixed(2)} and represents an estimated {example.carbonGrams} g CO₂e under this synthetic profile. This is an example, not a savings claim.</p>
          <details className="mt-5 border-t border-stone-200 pt-4"><summary className="cursor-pointer text-sm font-medium text-emerald-900">Inspect all 24 hours &amp; assumptions</summary><p className="mt-4 text-xs leading-6 text-stone-500">{energyScenario.source} {energyScenario.description} Times use {energyScenario.timezone}. Each row covers one hour. Costs exclude taxes and fixed charges.</p><div className="mt-4 max-h-72 overflow-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Synthetic hourly electricity prices and grid carbon intensity</caption><thead className="sticky top-0 bg-[#f8f8f2]"><tr><th scope="col" className="p-2">Hour</th><th scope="col" className="p-2">Price ($/kWh)</th><th scope="col" className="p-2">Carbon (g CO₂e/kWh)</th></tr></thead><tbody>{hourlyEnergy.map((row) => <tr key={row.hour} className="border-t border-stone-100"><th scope="row" className="p-2 font-normal">{formatHour(row.hour)}</th><td className="p-2">{row.priceUsdPerKwh.toFixed(2)}</td><td className="p-2">{row.carbonGramsPerKwh}</td></tr>)}</tbody></table></div></details>
        </section>
      </main>
      <footer className="flex flex-wrap justify-between gap-3 border-t border-stone-200 py-6 text-xs text-stone-500"><span>Housemates · Built for Stanford CleanTech</span><span>A more thoughtful home starts with a conversation.</span></footer>
    </div></div>
  );
}
