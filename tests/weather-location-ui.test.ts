import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as locations from "../src/domain/weather-location";

type View = { type: unknown; props: Record<string, unknown> };
type PendingRequest = { url: string; init?: RequestInit; resolve(response: Response): void; reject(error: Error): void };
const springfieldIllinois: locations.WeatherLocation = { id: 4250542, name: "Springfield", admin1: "Illinois", admin2: "Sangamon County", country: "United States", countryCode: "US", latitude: 39.8017, longitude: -89.6437, timezone: "America/Chicago" };
const springfieldMassachusetts: locations.WeatherLocation = { id: 4951788, name: "Springfield", admin1: "Massachusetts", admin2: "Hampden County", country: "United States", countryCode: "US", latitude: 42.1015, longitude: -72.5898, timezone: "America/New_York" };
function nodes(value: unknown): View[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as View; return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join(" ");
  return value && typeof value === "object" && "props" in value ? text((value as View).props.children) : "";
}

/** The real picker JSX and async effects run with controllable HTTP completion order.
 * Aborting deliberately does not settle the fake transport: stale-result guards
 * must still work when a response or body parse completes after cancellation. */
function picker(initialValue?: locations.WeatherLocation) {
  const state: unknown[] = [], refs: { current: unknown }[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [], pendingEffects: (() => void)[] = [];
  const timers = new Map<number, () => void>(); let timerId = 0;
  const requests: PendingRequest[] = [], selected: locations.WeatherLocation[] = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0, dirty = false, mounted = true, writesAfterUnmount = 0, tree: View;
  const props = { value: initialValue, onChange(value: locations.WeatherLocation) { selected.push(value); props.value = value; dirty = true; } };
  const react = {
    useId: () => "test-weather-location",
    useState(initial: unknown) { const index = stateIndex++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (next: unknown) => { if (!mounted) writesAfterUnmount++; const value = typeof next === "function" ? next(state[index]) : next; if (!Object.is(value, state[index])) { state[index] = value; dirty = true; } }]; },
    useRef(initial: unknown) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
    useEffect(effect: () => void | (() => void), deps: unknown[]) { const index = effectIndex++, previous = effects[index];
      if (!previous || deps.length !== previous.deps.length || deps.some((value, i) => !Object.is(value, previous.deps[i]))) pendingEffects.push(() => { previous?.cleanup?.(); effects[index] = { deps, cleanup: effect() || undefined }; }); },
    useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
  };
  const jsx = (type: unknown, componentProps: View["props"]): View => ({ type, props: componentProps });
  const testModule: { exports: unknown } = { exports: {} };
  const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/weather-location-picker.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, {
    module: testModule, exports: testModule.exports, AbortController, Error, URLSearchParams,
    setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
    fetch: (url: string, init?: RequestInit) => new Promise<Response>((fulfill, reject) => requests.push({ url, init, resolve: fulfill, reject })),
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "@/domain/weather-location") return locations;
      if (name.endsWith(".css")) return {};
      throw new Error(`Unexpected weather picker dependency ${name}`);
    },
  });
  const Component = (testModule.exports as { WeatherLocationPicker: (props: unknown) => View }).WeatherLocationPicker;
  function render() { stateIndex = refIndex = effectIndex = 0; dirty = false; tree = Component(props); pendingEffects.splice(0).forEach(effect => effect()); }
  async function settle() { for (let i = 0; i < 30; i++) { await Promise.resolve(); if (mounted && dirty) render(); } }
  function find(predicate: (node: View) => boolean) { const found = nodes(tree).find(predicate); assert.ok(found, "Expected picker control"); return found; }
  function changeQuery(value: string) { const input = find(node => node.type === "input" && node.props.type !== "hidden"); (input.props.onChange as (event: unknown) => void)({ target: { value }, currentTarget: { value } }); render(); }
  function submit() { const form = find(node => node.type === "form"); const result = (form.props.onSubmit as (event: unknown) => unknown)({ preventDefault() {} }); render(); return result; }
  function choose(value: string) { const select = find(node => node.type === "select"); (select.props.onChange as (event: unknown) => void)({ target: { value }, currentTarget: { value } }); render(); }
  async function respond(index: number, body: unknown, status = 200) { assert.ok(requests[index], "Expected submitted location request"); requests[index].resolve(Response.json(body, { status })); await settle(); }
  render();
  return { props, requests, selected, timers, render, settle, find, changeQuery, submit, choose, respond, text: () => text(tree), nodes: () => nodes(tree),
    fireTimeout() { const timer = [...timers.entries()][0]; assert.ok(timer, "Expected pending search timeout"); timers.delete(timer[0]); timer[1](); },
    unmount() { mounted = false; effects.forEach(effect => effect.cleanup?.()); }, writesAfterUnmount: () => writesAfterUnmount };
}

test("location search waits for explicit submit and selection distinguishes same-name places", async () => {
  const ui = picker();
  assert.equal(ui.requests.length, 0);
  ui.changeQuery("  Springfield & county  ");
  assert.equal(ui.requests.length, 0, "Typing alone must not send a place query");
  ui.submit();
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].url, "/api/weather/locations?q=Springfield%20%26%20county");
  assert.equal(ui.requests[0].init?.cache, "no-store");
  await ui.respond(0, { locations: [springfieldIllinois, springfieldMassachusetts] });
  assert.deepEqual(ui.selected, [], "Results must not choose the first city automatically");
  const options = ui.nodes().filter(node => node.type === "option");
  assert.equal(options.length, 3);
  assert.equal(options[0].props.value, "");
  assert.equal(ui.find(node => node.type === "select").props.value, "");
  assert.match(text(options[1]), /Springfield.*Sangamon County.*Illinois.*United States/);
  assert.match(text(options[2]), /Springfield.*Hampden County.*Massachusetts.*United States/);
  ui.choose(String(springfieldMassachusetts.id));
  assert.equal(ui.selected.length, 1);
  assert.deepEqual(ui.selected[0], springfieldMassachusetts);
  assert.equal(ui.find(node => node.type === "select").props.value, String(springfieldMassachusetts.id));
  assert.equal(ui.timers.size, 0);
});

test("empty searches, unavailable service and invalid response schemas preserve the chosen location", async () => {
  const ui = picker(springfieldIllinois);
  for (const input of ["", " ", "A", "x".repeat(81)]) { ui.changeQuery(input); ui.submit(); }
  assert.equal(ui.requests.length, 0);
  const payloads: { body: unknown; status?: number; notice: RegExp }[] = [
    { body: { locations: [] }, notice: /No matching places/ },
    { body: { error: "Unavailable" }, status: 503, notice: /search unavailable/i },
    { body: { locations: "Springfield" }, notice: /search unavailable/i },
    { body: null, notice: /search unavailable/i },
  ];
  for (const [index, item] of payloads.entries()) {
    ui.changeQuery("Another place"); ui.submit(); await ui.respond(index, item.body, item.status);
    assert.match(ui.text(), item.notice);
    assert.equal(ui.find(node => node.type === "select").props.value, String(springfieldIllinois.id));
    assert.ok(ui.nodes().some(node => node.type === "option" && node.props.value === String(springfieldIllinois.id)));
    assert.deepEqual(ui.selected, []);
    assert.equal(ui.timers.size, 0);
  }
});

test("malformed and duplicate places cannot become selectable forecast locations", async () => {
  const ui = picker(); ui.changeQuery("Springfield"); ui.submit();
  await ui.respond(0, { locations: [null, {}, { ...springfieldIllinois, latitude: 91 }, { ...springfieldIllinois, timezone: "Not/A_Zone" }, springfieldIllinois, springfieldIllinois, springfieldMassachusetts] });
  const options = ui.nodes().filter(node => node.type === "option");
  assert.equal(options.length, 3);
  assert.deepEqual(options.slice(1).map(node => node.props.value), [String(springfieldIllinois.id), String(springfieldMassachusetts.id)]);
  ui.choose("not-a-result"); ui.choose("");
  assert.deepEqual(ui.selected, []);
  ui.choose(String(springfieldIllinois.id)); assert.equal(ui.selected.length, 1);
});

test("editing a query aborts previous lookup and ignores its response after a newer result", async () => {
  const ui = picker(); ui.changeQuery("Old Springfield"); ui.submit();
  const firstSignal = ui.requests[0].init?.signal;
  assert.equal(firstSignal?.aborted, false);
  ui.changeQuery("New Springfield");
  assert.equal(firstSignal?.aborted, true);
  assert.equal(ui.timers.size, 0);
  ui.submit();
  await ui.respond(1, { locations: [springfieldMassachusetts] });
  await ui.respond(0, { locations: [springfieldIllinois] });
  const options = ui.nodes().filter(node => node.type === "option");
  assert.deepEqual(options.map(node => node.props.value), ["", String(springfieldMassachusetts.id)]);
  assert.deepEqual(ui.selected, []);
  assert.equal(ui.find(node => node.type === "button").props.disabled, false);
});

test("late JSON parsing cannot replace a new search and unmount cancels all pending work", async () => {
  const ui = picker(); ui.changeQuery("Old Springfield"); ui.submit();
  let finishBody!: (body: unknown) => void;
  const body = new Promise<unknown>(resolve => { finishBody = resolve; });
  ui.requests[0].resolve({ ok: true, json: () => body } as Response);
  await ui.settle();
  ui.changeQuery("New Springfield"); ui.submit();
  await ui.respond(1, { locations: [springfieldMassachusetts] });
  finishBody({ locations: [springfieldIllinois] }); await ui.settle();
  assert.doesNotMatch(ui.text(), /Sangamon County/);
  assert.match(ui.text(), /Hampden County/);
  ui.changeQuery("Pending place"); ui.submit();
  ui.unmount();
  assert.equal(ui.requests[2].init?.signal?.aborted, true);
  assert.equal(ui.timers.size, 0);
  await ui.respond(2, { locations: [springfieldIllinois] });
  assert.equal(ui.writesAfterUnmount(), 0);
  assert.deepEqual(ui.selected, []);
});

test("timeout allows retry without selecting a place or accepting a late response", async () => {
  const ui = picker(); ui.changeQuery("Springfield"); ui.submit(); ui.fireTimeout(); await ui.settle();
  assert.equal(ui.requests[0].init?.signal?.aborted, true);
  assert.match(ui.text(), /search unavailable/i);
  assert.equal(ui.find(node => node.type === "button").props.disabled, false);
  await ui.respond(0, { locations: [springfieldIllinois] });
  assert.deepEqual(ui.selected, []); assert.doesNotMatch(ui.text(), /Sangamon County/);
  ui.submit(); await ui.respond(1, { locations: [springfieldMassachusetts] });
  assert.match(ui.text(), /Hampden County/);
});

test("a timed-out search cannot write after the picker unmounts before its rejection settles", async () => {
  const ui = picker(); ui.changeQuery("Springfield"); ui.submit();
  ui.fireTimeout(); ui.unmount(); await ui.settle();
  assert.equal(ui.writesAfterUnmount(), 0);
  assert.deepEqual(ui.selected, []);
});

test("a timeout queued before a query edit cannot replace the new query's neutral state", async () => {
  const ui = picker(); ui.changeQuery("Springfield"); ui.submit();
  ui.fireTimeout(); ui.changeQuery("London"); await ui.settle();
  assert.doesNotMatch(ui.text(), /search unavailable/i);
  assert.equal(ui.find(node => node.type === "input").props.value, "London");
  assert.deepEqual(ui.selected, []);
});

test("same-query retry owns its results even when the expired request completes last", async () => {
  const ui = picker(springfieldIllinois); ui.changeQuery("Springfield"); ui.submit();
  ui.fireTimeout(); await ui.settle();
  ui.submit();
  await ui.respond(1, { locations: [springfieldMassachusetts] });
  await ui.respond(0, { locations: [] });
  assert.match(ui.text(), /Hampden County/);
  assert.doesNotMatch(ui.text(), /No matching places/);
  assert.deepEqual(ui.selected, []);
  ui.choose(String(springfieldIllinois.id));
  assert.deepEqual(ui.selected, [springfieldIllinois], "Current saved place remains an explicit choice when absent from new results");
});

test("changed metadata for the selected place requires an explicit update even when its ID is unchanged", async () => {
  const ui = picker(springfieldIllinois);
  ui.changeQuery("Springfield"); ui.submit();
  await ui.respond(0, { locations: [springfieldIllinois] });
  assert.equal(ui.nodes().some(node => node.props.className === "demo-location-update"), false);
  const corrected = { ...springfieldIllinois, latitude: 39.802, longitude: -89.644, admin2: "Updated county label" };
  ui.submit(); await ui.respond(1, { locations: [corrected] });
  assert.deepEqual(ui.selected, [], "A fresh provider record must never silently change the selected forecast coordinates");
  assert.deepEqual(ui.props.value, springfieldIllinois);
  assert.equal(ui.find(node => node.type === "select").props.value, String(springfieldIllinois.id));
  const update = ui.find(node => node.type === "button" && text(node) === "Update selected place details");
  (update.props.onClick as () => void)(); ui.render();
  assert.deepEqual(ui.selected, [corrected]);
  assert.deepEqual(ui.props.value, corrected);
  assert.equal(ui.nodes().some(node => node.props.className === "demo-location-update"), false);
  assert.match(ui.text(), /Selected: Springfield.*Updated county label/);
});
