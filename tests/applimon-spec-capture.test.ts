import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as catalog from "../src/domain/applimon-catalog";
import { hourlyEnergy } from "../src/data/energy";
import { getApplimonSchedulingOptions } from "../src/domain/applimon-planning";

type View = { type: unknown; props: Record<string, unknown> };
type Props = { initialId?: catalog.ApplimonId; initialDevice?: catalog.ApplimonDevice };
function nodes(value: unknown): View[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object") return [];
  const node = value as View;
  return [node, ...nodes(node.props?.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (value && typeof value === "object") return text((value as View).props?.children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
/** Execute the real confirmation and event closures; no network/OCR capability is provided. */
function harness(initial: Props = {}) {
  const confirmed: catalog.ApplimonDevice[] = [], canceled: boolean[] = [];
  let tree: View;
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/applimon-spec-capture.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source, {
    module: testModule, exports: testModule.exports,
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/domain/applimon-catalog") return catalog;
      if (name === "./applimon-sprite") return { ApplimonSprite: () => null };
      if (name.endsWith(".css")) return {};
      throw Error(`Unexpected confirmation dependency: ${name}`);
    },
  });
  function render() {
    tree = (testModule.exports as { ApplimonSpecCapture: (props: unknown) => View }).ApplimonSpecCapture({
      ...initial, onConfirm: (device: catalog.ApplimonDevice) => confirmed.push(device), onCancel: () => canceled.push(true),
    });
  }
  function click(label: RegExp) {
    const button = nodes(tree).find(node => node.type === "button" && label.test(text(node)));
    assert.ok(button, `Missing button ${label}`);
    assert.notEqual(button.props.disabled, true);
    (button.props.onClick as () => void)(); render();
  }
  render();
  return { confirmed, canceled, click, nodes: () => nodes(tree), text: () => text(tree) };
}

for (const entry of catalog.APPLIMON_CATALOG) test(`${entry.name} can be recruited with valid synthetic inputs without a spec sheet`, () => {
  const h = harness({ initialId: entry.id });
  assert.deepEqual(h.confirmed, [], "Viewing a suggested category is not recruitment consent");
  assert.equal(h.nodes().some(node => ["input", "textarea", "select"].includes(String(node.type))), false, "No electrical input, upload or routine form is required");
  assert.match(h.text(), /synthetic/i);
  assert.match(h.text(), /no device control|no devices connected/i);
  h.click(new RegExp(`Add ${entry.name}`));
  assert.equal(h.confirmed.length, 1);
  const device = h.confirmed[0];
  assert.deepEqual(device, catalog.createDemoApplimon(entry.id));
  assert.deepEqual(catalog.validateApplimonDevice(device), device);
  const result = getApplimonSchedulingOptions(device, hourlyEnergy);
  assert.equal(result.status, entry.schedulingPolicy === "protected" ? "protected" : "feasible");
  if (entry.schedulingPolicy !== "flexible") {
    assert.equal(result.recommendations, null);
    assert.deepEqual(result.options, []);
  }
});

test("canceling a synthetic character does not recruit or require clearing a form", () => {
  const h = harness({ initialId: "rover" });
  h.click(/^Cancel/);
  assert.deepEqual(h.canceled, [true]);
  assert.deepEqual(h.confirmed, []);
});

test("revisiting an existing manually configured appliance preserves its settings and source", () => {
  const device: catalog.ApplimonDevice = { ...catalog.createDemoApplimon("spin"), ratedPowerW: 2200, energyKwh: .9, earliestStartHour: 10, specSource: "manual" };
  const h = harness({ initialId: "spin", initialDevice: device });
  assert.match(h.text(), /saved|existing/i);
  assert.doesNotMatch(h.text(), /read from your photo|scanned specs/i);
  h.click(/Keep|Continue|Confirm|Add Spin/);
  assert.equal(h.confirmed.length, 1);
  assert.deepEqual(h.confirmed[0], device);
  assert.equal(h.confirmed[0].specSource, "manual");
});

test("protected and fixed characters explain their scheduling limits before confirmation", () => {
  for (const id of ["chill", "ember", "frost"] as const) assert.match(harness({ initialId: id }).text(), /protect|not.*shift|never.*shift/i);
  assert.match(harness({ initialId: "breeze" }).text(), /fixed|original time/i);
});
