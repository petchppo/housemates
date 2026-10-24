import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contract from "../src/domain/dialogue-contract";
import type { useJudgeDialogue } from "../src/components/use-judge-dialogue";

type Hook = ReturnType<typeof useJudgeDialogue>;
const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/use-judge-dialogue.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness() {
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  const callbacks: { value: unknown; deps: unknown[] }[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [], pending: (() => void)[] = [];
  const listeners = new Map<string, () => void>(), timers = new Map<number, () => void>();
  const requests: { signal: AbortSignal; body: string; resolve: (response: Response) => void; reject: (error: Error) => void }[] = [];
  let si = 0, ri = 0, ci = 0, ei = 0, writes = 0, timerId = 0;
  const react = {
    useState(initial: unknown) { const i = si++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], (value: unknown) => { states[i] = typeof value === "function" ? value(states[i]) : value; writes++; }]; },
    useRef(initial: unknown) { const i = ri++; return refs[i] ?? (refs[i] = { current: initial }); },
    useCallback(value: unknown, deps: unknown[]) { const i = ci++, old = callbacks[i]; if (!old || old.deps.length !== deps.length || deps.some((dep, j) => dep !== old.deps[j])) callbacks[i] = { value, deps }; return callbacks[i].value; },
    useEffect(fn: () => void | (() => void), deps: unknown[]) { const i = ei++, old = effects[i]; if (!old || old.deps.length !== deps.length || deps.some((dep, j) => dep !== old.deps[j])) pending.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() || undefined }; }); },
  };
  const document = { hidden: false, addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) };
  const fixtureModule = { exports: {} };
  runInNewContext(source, { module: fixtureModule, exports: fixtureModule.exports, document, AbortController,
    setTimeout: (fn: () => void) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
    fetch: (_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => requests.push({ signal: init.signal!, body: String(init.body), resolve, reject })),
    require: (name: string) => { if (name === "react") return react; if (name === "@/domain/dialogue-contract") return contract; throw Error(name); },
  });
  const hookFunction = (fixtureModule.exports as { useJudgeDialogue: (context: string) => Hook }).useJudgeDialogue;
  function render(context = "home-A:proposal-1:evie") { si = ri = ci = ei = 0; const result = hookFunction(context); pending.splice(0).forEach(fn => fn()); return result; }
  return { render, requests, document, timers, listeners, writes: () => writes,
    hide() { document.hidden = true; listeners.get("visibilitychange")?.(); },
    fireTimers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
  };
}
const response = (mode: "cost" | "carbon" = "cost", provider: "ollama" | "openai" = "ollama") => Response.json({ suggestion: { kind: "plan", mode }, source: provider });

test("judge dialogue is explicit, returns only a reviewable suggestion, and rejects extra model actions", async () => {
  const h = harness(); let hook = h.render();
  assert.equal(h.requests.length, 0);
  await hook.request("  "); assert.equal(h.requests.length, 0);
  const pending = hook.request("  cheaper please  ");
  assert.deepEqual(JSON.parse(h.requests[0].body), { text: "cheaper please" });
  assert.equal(h.render().loading, true);
  h.requests[0].resolve(response()); await pending; hook = h.render();
  assert.deepEqual(hook.suggestion, { kind: "plan", mode: "cost" });
  assert.match(hook.message, /schedule has not changed/);
  const unsafe = hook.request("cheaper");
  h.requests[1].resolve(Response.json({ suggestion: { kind: "plan", mode: "cost", approve: true } }));
  await unsafe; assert.equal(h.render().suggestion, null); assert.equal(h.timers.size, 0); h.unmount();
});

test("clear and newer requests reject stale successes even if transport ignores abort", async () => {
  const h = harness(); let hook = h.render(); const first = hook.request("cheaper");
  hook.clear(); assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve(response()); await first; assert.equal(h.render().suggestion, null);
  hook = h.render(); const old = hook.request("cheaper"), newer = hook.request("lower carbon");
  h.requests[2].resolve(response("carbon")); await newer;
  h.requests[1].resolve(response()); await old;
  assert.deepEqual(h.render().suggestion, { kind: "plan", mode: "carbon" }); h.unmount();
});

test("context changes invalidate pending and completed suggestions", async () => {
  const h = harness(); const pending = h.render().request("cheaper");
  assert.equal(h.render("home-A:proposal-2:bubbles").suggestion, null);
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve(response()); await pending;
  let hook = h.render("home-A:proposal-2:bubbles"); assert.equal(hook.suggestion, null);
  const next = hook.request("lower carbon"); h.requests[1].resolve(response("carbon")); await next;
  hook = h.render("home-A:proposal-2:bubbles"); assert.ok(hook.suggestion);
  assert.equal(h.render("home-B:proposal-1:evie").suggestion, null); h.unmount();
});

test("hidden pages stop requests and stale responses cannot reappear when visible", async () => {
  const h = harness(); const pending = h.render().request("cheaper");
  h.hide(); assert.equal(h.requests[0].signal.aborted, true);
  h.document.hidden = false;
  h.requests[0].resolve(response()); await pending; assert.equal(h.render().suggestion, null);
  h.hide(); await h.render().request("lower carbon"); assert.equal(h.requests.length, 1); h.unmount();
});

test("unmount clears lifecycle resources and suppresses late state updates", async () => {
  const h = harness(); const hook = h.render(), pending = hook.request("cheaper");
  h.unmount(); const count = h.writes();
  assert.equal(h.requests[0].signal.aborted, true); assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0, "Unmount must clear the pending deadline immediately");
  h.requests[0].resolve(response()); await pending;
  await hook.request("lower carbon"); assert.equal(h.requests.length, 1); assert.equal(h.writes(), count);
});

test("deadline shows fallback and a late success cannot become a suggestion", async () => {
  const h = harness(); const pending = h.render().request("cheaper");
  h.fireTimers(); assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve(response()); await pending;
  const hook = h.render(); assert.equal(hook.loading, false); assert.equal(hook.suggestion, null);
  assert.match(hook.message, /stopped|timed out/); h.unmount();
});

test("unconfigured provider and malformed responses keep the deterministic fallback", async () => {
  const h = harness(); const pending = h.render().request("cheaper");
  h.requests[0].resolve(Response.json({ error: "unconfigured" }, { status: 503 })); await pending;
  assert.equal(h.render().suggestion, null); assert.match(h.render().message, /no model reply was generated/);
  const malformed = h.render().request("cheaper"); h.requests[1].resolve(new Response("not JSON")); await malformed;
  assert.equal(h.render().suggestion, null); assert.equal(h.render().loading, false); h.unmount();
});

test("local rule clarification is disclosed and unknown or falsely labeled model suggestions are rejected", async () => {
  const h = harness(); const local = h.render().request("cheaper by 7 AM");
  h.requests[0].resolve(Response.json({ source: "local-guard", suggestion: { kind: "clarify", reason: "constraint-change" } })); await local;
  assert.equal(h.render().suggestion?.kind, "clarify"); assert.match(h.render().message, /no model was called/);
  for (const source of [undefined, "cloud", "local-guard"]) {
    const pending = h.render().request("cheaper"), latest = h.requests[h.requests.length - 1];
    latest.resolve(Response.json({ source, suggestion: { kind: "plan", mode: "cost" } })); await pending;
    assert.equal(h.render().suggestion, null);
  }
  h.unmount();
});

test("OpenAI suggestions retain strict validation and identify external model output for review", async () => {
  const h = harness(); const pending = h.render().request("lower carbon");
  h.requests[0].resolve(response("carbon", "openai")); await pending;
  assert.deepEqual(h.render().suggestion, { kind: "plan", mode: "carbon" });
  assert.match(h.render().message, /OpenAI/); assert.match(h.render().message, /review/i);
  assert.match(h.render().message, /schedule has not changed/);
  assert.deepEqual(JSON.parse(h.requests[0].body), { text: "lower carbon" });
  for (const suggestion of [{ kind: "approve" }, { kind: "plan", mode: "cost", costUsd: 0 }, { kind: "plan", mode: "cost", execute: true }]) {
    const invalid = h.render().request("cheaper");
    h.requests[h.requests.length - 1].resolve(Response.json({ source: "openai", suggestion })); await invalid;
    assert.equal(h.render().suggestion, null);
  }
  h.unmount();
});

test("late OpenAI responses cannot cross reset, timeout or appliance-context boundaries and never retry", async () => {
  for (const cancel of ["clear", "timeout", "context", "hide", "unmount"] as const) {
    const h = harness(); const pending = h.render().request("lower carbon");
    if (cancel === "clear") h.render().clear();
    if (cancel === "timeout") h.fireTimers();
    if (cancel === "context") h.render("other-home:bubbles");
    if (cancel === "hide") { h.hide(); h.document.hidden = false; }
    if (cancel === "unmount") h.unmount();
    const writes = h.writes();
    h.requests[0].resolve(response("carbon", "openai")); await pending;
    assert.equal(h.requests.length, 1, "No retry may generate another billable request");
    assert.equal(h.writes(), writes); assert.equal(h.requests[0].signal.aborted, true);
    assert.equal(h.timers.size, 0);
    if (cancel !== "unmount") { assert.equal(h.render(cancel === "context" ? "other-home:bubbles" : undefined).suggestion, null); h.unmount(); }
  }
});

test("provider failures show only authored diagnostics and never retry or create a suggestion", async () => {
  const cases: [string, RegExp][] = [
    ["provider-authentication", /credentials/], ["provider-access-denied", /permissions/],
    ["provider-quota", /quota/], ["provider-rate-limit", /rate limit/],
    ["provider-credit-balance", /prepaid credits/], ["provider-spend-limit", /spending limit/],
    ["provider-usage-limit", /usage limit/], ["provider-limit-unknown", /before retrying/],
    ["provider-request-rejected", /request settings/], ["provider-token-limit", /output limit/],
    ["provider-refused", /declined/], ["provider-timeout", /timed out/],
    ["invalid-provider-response", /suggestion checks/], ["provider-unavailable", /unavailable/],
    ["secret-provider-message", /request failed/], ["toString", /request failed/],
  ];
  for (const [error, message] of cases) {
    const h = harness(), pending = h.render().request("cheaper");
    h.requests[0].resolve(Response.json({ error, message: "secret-provider-message" }, { status: 502 }));
    await pending;
    assert.match(h.render().message, message); assert.doesNotMatch(h.render().message, /secret-provider-message/);
    assert.equal(h.render().suggestion, null); assert.equal(h.render().loading, false);
    assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0); h.unmount();
  }
  const h = harness(), pending = h.render().request("cheaper");
  h.requests[0].resolve(new Response("secret upstream HTML", { status: 502 })); await pending;
  assert.match(h.render().message, /request failed/); assert.doesNotMatch(h.render().message, /secret/); h.unmount();
});

test("late error bodies cannot overwrite cancellation, timeout, new contexts or unmounted state", async () => {
  for (const cancellation of ["clear", "timeout", "context", "hide", "unmount"] as const) {
    const h = harness(), pending = h.render().request("cheaper");
    let finish!: (body: unknown) => void;
    let reading!: () => void;
    const bodyStarted = new Promise<void>(resolve => { reading = resolve; });
    const errorResponse = new Response(null, { status: 502 });
    errorResponse.json = () => new Promise(resolve => { finish = resolve; reading(); });
    h.requests[0].resolve(errorResponse); await bodyStarted;
    if (cancellation === "clear") h.render().clear();
    if (cancellation === "timeout") h.fireTimers();
    if (cancellation === "context") h.render("new-context");
    if (cancellation === "hide") h.hide();
    if (cancellation === "unmount") h.unmount();
    const writes = h.writes();
    finish({ error: "provider-quota" }); await pending;
    assert.equal(h.writes(), writes); assert.equal(h.requests.length, 1);
    assert.equal(h.timers.size, 0); h.unmount();
  }
});
