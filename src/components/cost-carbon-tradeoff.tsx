"use client";

import { useId } from "react";
import type { buildPlanTradeoffs } from "../domain/plan-tradeoffs";
import type { EnergyTotals, OptimizationMode } from "../domain/scheduling";
import "./cost-carbon-tradeoff.css";

type Props = {
  comparison: ReturnType<typeof buildPlanTradeoffs>;
  selectedMode: OptimizationMode;
  onPropose: (mode: OptimizationMode) => void;
  disabled?: boolean;
};
const labels: Record<OptimizationMode, string> = { cost: "Cost-first", carbon: "Carbon-first", balanced: "Balanced" };
const marks: Record<OptimizationMode, string> = { cost: "1", carbon: "2", balanced: "3" };
const money = (value: number) => `${value < 0 ? "−" : ""}$${Math.abs(value).toFixed(3)}`;
const kilograms = (value: number) => (value / 1000).toFixed(3);
const finite = (totals: EnergyTotals | null): totals is EnergyTotals => !!totals &&
  [totals.energyKwh, totals.costUsd, totals.carbonGrams].every(Number.isFinite);

export function CostCarbonTradeoff({ comparison, selectedMode, onPropose, disabled = false }: Props) {
  const id = useId();
  const baseline = finite(comparison.baseline) ? comparison.baseline : null;
  const rows = comparison.recommendations.map(item => ({ ...item,
    totals: item.plan.status === "feasible" && finite(item.plan.proposed) ? item.plan.proposed : null }));
  const points = [...(baseline ? [{ key: "B", totals: baseline, selected: false }] : []),
    ...rows.flatMap(row => row.totals ? [{ key: marks[row.mode], totals: row.totals, selected: row.mode === selectedMode }] : [])];
  // Coincident results share their true position; labels show every objective, without jitter.
  const groups: typeof points = [];
  for (const point of points) {
    const same = groups.find(group => group.totals.costUsd === point.totals.costUsd && group.totals.carbonGrams === point.totals.carbonGrams);
    if (same) { same.key += `/${point.key}`; same.selected ||= point.selected; }
    else groups.push({ ...point });
  }
  const costs = points.map(point => point.totals.costUsd), carbon = points.map(point => point.totals.carbonGrams / 1000);
  const minCost = Math.min(0, ...costs), maxCost = Math.max(0, ...costs);
  const costSpan = maxCost - minCost || 1;
  const maxCarbon = Math.max(0, ...carbon) || 1;
  const x = (value: number) => 62 + (value - minCost) / costSpan * 420;
  const y = (grams: number) => 224 - (grams / 1000) / maxCarbon * 176;
  const ticks = [0, .5, 1];
  // Keep nearby recommendations legible without moving their actual plotted values.
  const positioned = groups.map(point => ({ ...point, labelY: y(point.totals.carbonGrams) - 13 }))
    .sort((a, b) => a.labelY - b.labelY);
  for (let index = 1; index < positioned.length; index++)
    positioned[index].labelY = Math.max(positioned[index].labelY, positioned[index - 1].labelY + 32);
  for (let index = positioned.length - 1; index >= 0; index--)
    positioned[index].labelY = Math.min(positioned[index].labelY, index === positioned.length - 1 ? 210 : positioned[index + 1].labelY - 32);

  return <section className="cct" aria-labelledby={`${id}-heading`}>
    <p className="cct-eyebrow">SAME TASKS · THREE OBJECTIVE RECOMMENDATIONS</p>
    <h2 id={`${id}-heading`}>Cheaper or lower carbon?</h2>
    <p className="cct-intro">Compare complete Evie and Bubbles sessions under the same constraints. Lower cost is left; lower modeled emissions are down.</p>
    {points.length > 0 && <div className="cct-plot"><svg viewBox="0 0 540 320" role="img" aria-labelledby={`${id}-chart-title ${id}-chart-description`}>
      <title id={`${id}-chart-title`}>Cost and modeled carbon comparison</title>
      <desc id={`${id}-chart-description`}>Three objective recommendations and the fixed original baseline when available. Coincident points share labels. Exact values and proposal controls are in the table below.</desc>
      {ticks.map(tick => <g key={tick} className="cct-grid"><line x1="62" y1={224 - tick * 176} x2="482" y2={224 - tick * 176}/><text x="53" y={228 - tick * 176} textAnchor="end">{(maxCarbon * tick).toFixed(2)}</text><text x={62 + tick * 420} y="260" textAnchor="middle">{money(minCost + costSpan * tick)}</text></g>)}
      <path className="cct-axis" d="M62 40V224H490"/>
      <text className="cct-axis-title" x="62" y="22">Modeled CO₂e (kg)</text><text className="cct-axis-title" x="272" y="302" textAnchor="middle">Session cost (USD)</text>
      {positioned.map(point => <g key={point.key} className={point.selected ? "cct-point cct-point-selected" : "cct-point"}>
        <title>{`${point.key}: ${money(point.totals.costUsd)} USD; ${kilograms(point.totals.carbonGrams)} kg modeled CO₂e`}</title>
        <line x1={x(point.totals.costUsd)} y1={y(point.totals.carbonGrams)} x2={x(point.totals.costUsd) + (x(point.totals.costUsd) > 420 ? -16 : 16)} y2={point.labelY - 5}/>
        <circle cx={x(point.totals.costUsd)} cy={y(point.totals.carbonGrams)} r={point.selected ? 8 : 6}/>
        <text x={x(point.totals.costUsd) + (x(point.totals.costUsd) > 420 ? -20 : 20)} y={point.labelY} textAnchor={x(point.totals.costUsd) > 420 ? "end" : "start"}>{point.key}</text>
      </g>)}
    </svg></div>}
    <p className="cct-key">B = original · 1 = cost · 2 = carbon · 3 = balanced. Shared markers mean identical totals; objectives can choose the same schedule.</p>
    <div className="cct-table-wrap"><table>
      <caption>Modeled session totals. Selecting an objective creates a proposal; it never approves or starts a simulation.</caption>
      <thead><tr><th scope="col">Strategy</th><th scope="col">Cost (USD)</th><th scope="col">CO₂e (kg)</th></tr></thead>
      <tbody>
        <tr><th scope="row">B · Original<small>{baseline ? comparison.baselineFeasible ? "Fixed reference" : "Outside current constraints" : "No complete baseline"}</small></th><td>{baseline ? money(baseline.costUsd) : "Unavailable"}</td><td>{baseline ? kilograms(baseline.carbonGrams) : "Unavailable"}</td></tr>
        {rows.map(row => <tr key={row.mode} className={row.mode === selectedMode ? "cct-current" : undefined}>
          <th scope="row">{marks[row.mode]} · {labels[row.mode]}{row.mode === selectedMode && <small>Current objective</small>}
            <button type="button" disabled={disabled || !row.totals} onClick={() => { if (!disabled && row.totals) onPropose(row.mode); }}>Propose {labels[row.mode].toLowerCase()}</button>
          </th>
          <td>{row.totals ? money(row.totals.costUsd) : "Unavailable"}{row.totals && baseline && <small>{money(row.totals.costUsd - baseline.costUsd)} vs original</small>}</td>
          <td>{row.totals ? kilograms(row.totals.carbonGrams) : "Unavailable"}{row.totals && baseline && <small>{kilograms(row.totals.carbonGrams - baseline.carbonGrams)} vs original</small>}</td>
        </tr>)}
      </tbody>
    </table></div>
    {comparison.issues.length > 0 && <ul className="cct-issues" role="status">{comparison.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    <p className="cct-disclosure">Changes are proposed minus original: negative means a reduction. Synthetic USD rates and modeled grid emissions, not measured savings. Chill and background cooling are excluded. Balanced equally weights normalized cost and carbon; these three recommendations are not every feasible schedule.</p>
    {disabled && <p className="cct-locked">Proposing alternatives is currently locked. Review the simulation controls before starting a new plan.</p>}
  </section>;
}
