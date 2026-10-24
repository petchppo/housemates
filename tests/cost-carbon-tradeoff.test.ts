import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hourlyEnergy } from "../src/data/energy";
import { defaultSchedulingRequests } from "../src/data/scheduling";
import { buildPlanTradeoffs, type PlanTradeoffs } from "../src/domain/plan-tradeoffs";
import type { OptimizationMode } from "../src/domain/scheduling";

type Element = { type: unknown; props: Record<string, unknown> };
const jsx = (type: unknown, props: Element["props"]) => ({ type, props });
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Element;
  return [el, ...elements(el.props.children)];
}
function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  return node && typeof node === "object" && "props" in node ? text((node as Element).props.children) : "";
}
const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/cost-carbon-tradeoff.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function render(comparison: PlanTradeoffs, disabled = false) {
  const proposed: OptimizationMode[] = [];
  const testModule = { exports: {} };
  runInNewContext(source, { module: testModule, exports: testModule.exports, require(name: string) {
    if (name === "react") return { useId: () => "tradeoff-test" };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name.endsWith(".css")) return {};
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  const component = (testModule.exports as { CostCarbonTradeoff: (props: unknown) => Element }).CostCarbonTradeoff;
  const tree = component({ comparison, selectedMode: "cost", disabled, onPropose: (mode: OptimizationMode) => proposed.push(mode) });
  return { tree, nodes: elements(tree), proposed };
}
const defaults = () => buildPlanTradeoffs({ requests: defaultSchedulingRequests, energyProfile: hourlyEnergy });

test("actual tradeoff component exposes table, units, chart description and proposal-only buttons", () => {
  const comparison = defaults(), before = structuredClone(comparison), ui = render(comparison);
  assert.ok(ui.nodes.some(el => el.type === "table"));
  assert.ok(ui.nodes.some(el => el.type === "svg" && el.props.role === "img" && el.props["aria-labelledby"]));
  assert.match(text(ui.tree), /CO₂e \(kg\)/); assert.match(text(ui.tree), /Synthetic USD rates/);
  assert.match(text(ui.tree), /never approves or starts/);
  const buttons = ui.nodes.filter(el => el.type === "button");
  assert.equal(buttons.length, 3);
  for (const button of buttons) (button.props.onClick as () => void)();
  assert.deepEqual(ui.proposed, ["cost", "carbon", "balanced"]);
  assert.deepEqual(comparison, before);
  const rows = ui.nodes.filter(el => el.type === "tr");
  for (const row of comparison.recommendations) assert.ok(rows.some(el => text(el).includes((row.plan.proposed!.carbonGrams / 1000).toFixed(3))));
  // SVG title is a raw-text context: split JSX children produce hydration mismatches.
  assert.ok(ui.nodes.filter(el => el.type === "title").every(el => typeof el.props.children === "string"));
});

test("nearby point labels stay separated while circles retain their true coordinates", () => {
  const comparison = defaults();
  for (const row of comparison.recommendations) {
    row.plan.proposed = { energyKwh: 13.2, costUsd: row.mode === "cost" ? 1.22 : 1.25, carbonGrams: row.mode === "cost" ? 4000 : 3560 };
  }
  const ui = render(comparison);
  const points = ui.nodes.filter(el => el.type === "g" && String(el.props.className).startsWith("cct-point"));
  const positions = points.map(point => elements(point).find(el => el.type === "text")!.props.y as number).sort((a, b) => a - b);
  for (let index = 1; index < positions.length; index++) assert.ok(positions[index] - positions[index - 1] >= 32);
  assert.equal(ui.nodes.filter(el => el.type === "circle").length, 3);
});

test("disabled and infeasible controls cannot call onPropose, including direct stale event invocation", () => {
  for (const ui of [render(defaults(), true), render(buildPlanTradeoffs({ requests: defaultSchedulingRequests, energyProfile: hourlyEnergy, sharedPowerLimitKw: .1 }))]) {
    const buttons = ui.nodes.filter(el => el.type === "button");
    assert.ok(buttons.every(el => el.props.disabled === true));
    for (const button of buttons) (button.props.onClick as () => void)();
    assert.deepEqual(ui.proposed, []);
  }
});

test("coincident zero-carbon and negative-cost results share one true point and preserve readable values", () => {
  const comparison = buildPlanTradeoffs({ requests: defaultSchedulingRequests,
    energyProfile: hourlyEnergy.map(row => ({ ...row, priceUsdPerKwh: -.2, carbonGramsPerKwh: 0 })) });
  const ui = render(comparison);
  assert.equal(ui.nodes.filter(el => el.type === "circle").length, 1);
  assert.match(text(ui.tree), /B\/1\/2\/3/);
  assert.match(text(ui.tree), /−\$2\.640/);
  for (const el of ui.nodes.filter(el => el.type === "circle")) assert.ok(Number.isFinite(el.props.cx) && Number.isFinite(el.props.cy));
});

test("empty team and unavailable baseline do not imply zero-cost plans or create active controls", () => {
  const empty = render(buildPlanTradeoffs({ requests: [], energyProfile: hourlyEnergy }));
  assert.equal(empty.nodes.filter(el => el.type === "button").length, 0);
  assert.equal(empty.nodes.filter(el => el.type === "svg").length, 0);
  assert.match(text(empty.tree), /No flexible appliances/);
  const missing = defaults(); missing.baseline = null;
  assert.match(text(render(missing).tree), /No complete baseline/);
});
