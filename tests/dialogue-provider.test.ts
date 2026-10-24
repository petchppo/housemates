import * as dialogueTransport from "../src/server/dialogue-transport";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { handleDialogueRequest, readDialogueConfig, type DialogueConfig } from "../src/server/dialogue-provider";
import { isSameOrigin } from "../src/server/request-origin";
import * as dialogueContract from "../src/domain/dialogue-contract";

const config: DialogueConfig = { baseUrl: "http://127.0.0.1:11434", model: "local-model:test" };
const env = (url = config.baseUrl, model = config.model) => ({ HOUSEMATES_DIALOGUE_OLLAMA_URL: url, HOUSEMATES_DIALOGUE_OLLAMA_MODEL: model });
const request = (body: unknown = { text: "Find a cheaper plan" }, headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/dialogue", {
  method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});
const modelResponse = (value: unknown) => Response.json({ done: true, message: { role: "assistant", content: JSON.stringify(value) } });
const noFetch: typeof fetch = async () => { assert.fail("Unexpected provider request"); };

test("configuration is default-off, loopback-only, credential-free and excludes cloud model names", () => {
  assert.equal(readDialogueConfig({}), null);
  assert.deepEqual(readDialogueConfig(env()), config);
  assert.deepEqual(readDialogueConfig(env("http://[::1]:11434")), { ...config, baseUrl: "http://[::1]:11434" });
  for (const url of ["https://example.com", "http://192.168.1.2:11434", "http://localhost.evil.test", "http://127.0.0.1@evil.test", "http://u:p@127.0.0.1:11434", "http://127.0.0.1/api", "http://127.0.0.1/?secret=x", "file:///tmp/model"]) assert.equal(readDialogueConfig(env(url)), null, url);
  for (const name of ["", "paid-cloud", "model:cloud", "model\nsecret", "x".repeat(129)]) assert.equal(readDialogueConfig(env(config.baseUrl, name)), null, name);
});

test("status does not expose model or endpoint or imply a successful handshake; disabled POST never calls network", async () => {
  const status = await handleDialogueRequest(new Request("http://localhost:3000/api/dialogue"), config, noFetch);
  assert.deepEqual(await status.json(), { status: "configured" });
  assert.equal(status.headers.get("cache-control"), "no-store");
  const absent = await handleDialogueRequest(new Request("http://localhost:3000/api/dialogue"), null, noFetch);
  assert.deepEqual(await absent.json(), { status: "unconfigured" });
  const disabled = await handleDialogueRequest(request(), null, noFetch);
  assert.equal(disabled.status, 503);
  assert.deepEqual(await disabled.json(), { error: "unconfigured" });
});

test("same-origin, JSON-only strict body, text and byte limits fail before provider", async () => {
  assert.equal((await handleDialogueRequest(request(undefined, { origin: "https://attacker.test" }), config, noFetch)).status, 403);
  assert.equal((await handleDialogueRequest(request(undefined, { origin: "" }), config, noFetch)).status, 403);
  assert.equal((await handleDialogueRequest(request(undefined, { "content-type": "text/plain" }), config, noFetch)).status, 415);
  for (const body of [null, [], {}, { text: "" }, { text: 1 }, { text: "a".repeat(1201) }, { text: "Cost first", url: "http://attacker" }]) assert.equal((await handleDialogueRequest(request(body), config, noFetch)).status, 400);
  assert.equal((await handleDialogueRequest(request({ text: "x".repeat(5000) }), config, noFetch)).status, 413);
  assert.equal((await handleDialogueRequest(request(undefined, { "content-length": "5000" }), config, noFetch)).status, 413);
});

test("same-origin uses actual Host when Next's URL contains an internal bind address, without trusting forwarding", async () => {
  const proxied = (origin: string, host = "localhost:3000", url = "http://0.0.0.0:3000/api/dialogue") => new Request(url, {
    method: "POST", headers: { host, origin, "content-type": "application/json", "x-forwarded-host": "attacker.test", "x-forwarded-proto": "https" },
    body: JSON.stringify({ text: "Find a cheaper plan" }),
  });
  assert.equal(isSameOrigin(proxied("http://localhost:3000")), true);
  assert.equal((await handleDialogueRequest(proxied("http://localhost:3000"), null, noFetch)).status, 503);
  for (const origin of ["http://127.0.0.1:3000", "http://0.0.0.0:3000", "http://localhost:3001", "https://localhost:3000", "https://attacker.test", "http://localhost:3000/", "http://user@localhost:3000", "null"]) {
    assert.equal(isSameOrigin(proxied(origin)), false, origin);
  }
  for (const host of ["", "localhost:3000,attacker.test", "localhost:3000/path", "user@localhost:3000", "localhost:3000\\attacker", "localhost:3000?x=1"]) assert.equal(isSameOrigin(proxied("http://localhost:3000", host)), false, host);
  assert.equal(isSameOrigin(proxied("https://localhost:3000", "localhost:3000", "https://0.0.0.0:3000/api/dialogue")), true);
});

test("constraint requests return explicitly local clarification without contacting Ollama", async () => {
  const response = await handleDialogueRequest(request({ text: "Find a cheaper plan and finish by 7 AM" }), config, noFetch);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { source: "local-guard", suggestion: { kind: "clarify", reason: "constraint-change" } });
});

test("configured request uses bounded non-streaming schema output and returns suggestions only", async () => {
  let calls = 0;
  const response = await handleDialogueRequest(request(), config, async (url, init) => {
    calls++;
    assert.equal(url, "http://127.0.0.1:11434/api/chat");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, config.model);
    assert.equal(body.stream, false);
    assert.equal(body.options.num_predict, 96);
    assert.equal(body.format.oneOf.length, 3);
    assert.equal(body.tools, undefined);
    assert.equal(body.messages.length, 2);
    return modelResponse({ kind: "plan", mode: "cost" });
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { source: "ollama", suggestion: { kind: "plan", mode: "cost" } });
});

test("provider cannot invent amounts, approve, change objectives, add tool calls or return partial output", async () => {
  const malicious = [
    modelResponse({ kind: "plan", mode: "cost", costUsd: 0 }), modelResponse({ kind: "approve" }),
    modelResponse({ kind: "plan", mode: "carbon" }), modelResponse({ kind: "explain", topic: "cost" }),
    Response.json({ done: false, message: { role: "assistant", content: '{"kind":"plan","mode":"cost"}' } }),
    Response.json({ done: true, message: { role: "assistant", content: '{"kind":"plan","mode":"cost"}', tool_calls: [] } }),
    Response.json({ done: true, message: { role: "assistant", content: "You saved $100!" } }),
    new Response("bad upstream private content"),
  ];
  for (const upstream of malicious) {
    const result = await handleDialogueRequest(request(), config, async () => upstream);
    assert.equal(result.status, 502);
    assert.deepEqual(await result.json(), { error: "invalid-provider-response" });
  }
});

test("provider failures are sanitized and oversized chunked responses are cancelled", async () => {
  const failed = await handleDialogueRequest(request(), config, async () => { throw new Error("secret upstream details"); });
  assert.deepEqual(await failed.json(), { error: "provider-unavailable" });
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(16_385)); }, cancel() { cancelled = true; } });
  const oversized = await handleDialogueRequest(request(), config, async () => new Response(body));
  assert.equal(oversized.status, 502);
  assert.equal(cancelled, true);
  assert.deepEqual(await oversized.json(), { error: "invalid-provider-response" });
});

test("deadline bounds stalled fetch and response-body streams and releases concurrency slots", async () => {
  let signal: AbortSignal | null | undefined;
  const stalled = await handleDialogueRequest(request(), config, async (_url, init) => {
    signal = init?.signal;
    return new Promise<Response>(() => {});
  }, 5);
  assert.equal(stalled.status, 504);
  assert.equal(signal?.aborted, true);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const stalledBody = await handleDialogueRequest(request(), config, async () => new Response(stream), 5);
  assert.equal(stalledBody.status, 504);
  assert.equal(cancelled, true);
  const next = await handleDialogueRequest(request(), config, async () => modelResponse({ kind: "plan", mode: "cost" }));
  assert.equal(next.status, 200);
});

test("concurrent generation is bounded and cannot become an unbounded local inference queue", async () => {
  let started = 0;
  let notify!: () => void;
  const bothStarted = new Promise<void>(resolve => { notify = resolve; });
  const releases: (() => void)[] = [];
  const fetcher: typeof fetch = async () => new Promise<Response>(resolve => {
    releases.push(() => resolve(modelResponse({ kind: "plan", mode: "cost" })));
    if (++started === 2) notify();
  });
  const first = handleDialogueRequest(request(), config, fetcher);
  const second = handleDialogueRequest(request(), config, fetcher);
  await bothStarted;
  assert.equal((await handleDialogueRequest(request(), config, noFetch)).status, 429);
  releases.forEach(release => release());
  assert.deepEqual((await Promise.all([first, second])).map(response => response.status), [200, 200]);
});

test("an injected remote configuration cannot bypass the server config policy", async () => {
  const response = await handleDialogueRequest(request(), { ...config, baseUrl: "https://attacker.test" }, noFetch);
  assert.equal(response.status, 503);
});

test("actual GET route waits for a connection before reading configuration with Cache Components", async () => {
  let connected = false, configReads = 0;
  let connect!: () => void;
  const ready = new Promise<void>(resolve => { connect = () => { connected = true; resolve(); }; });
  const testModule = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), "src/app/api/dialogue/route.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: testModule, exports: testModule.exports, process: { env: {} },
    require: (name: string) => {
      if (name === "next/server") return { connection: () => ready };
      if (name === "../../../server/dialogue-provider") return {
        readDialogueConfig: () => { assert.equal(connected, true); configReads++; return null; },
        handleDialogueRequest: (value: Request, settings: null) => handleDialogueRequest(value, settings, noFetch),
      };
      throw new Error(name);
    },
  });
  const route = testModule.exports as { GET(request: Request): Promise<Response> };
  const pending = route.GET(new Request("http://localhost:3000/api/dialogue"));
  assert.equal(configReads, 0);
  connect();
  assert.deepEqual(await (await pending).json(), { status: "unconfigured" });
  assert.equal(configReads, 1);
  await route.GET(new Request("http://localhost:3000/api/dialogue"));
  assert.equal(configReads, 2);
});

// Deliberately fake credential: these fixtures never read environment keys or call a live API.
const openAiConfig: DialogueConfig = { provider: "openai", apiKey: "sk-fixture-only-never-a-real-api-key", model: "fixture-structured-model" };
const openAiEnv = { HOUSEMATES_DIALOGUE_PROVIDER: "openai", OPENAI_API_KEY: openAiConfig.apiKey, HOUSEMATES_DIALOGUE_OPENAI_MODEL: openAiConfig.model };
const openAiEnvelope = (suggestion: unknown) => ({
  object: "response", status: "completed", error: null, incomplete_details: null,
  output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ suggestion }), annotations: [] }] }],
});

test("OpenAI requires an explicit provider plus key and model; no key-only activation or invalid-provider fallback", () => {
  assert.deepEqual(readDialogueConfig(openAiEnv), openAiConfig);
  assert.equal(readDialogueConfig({ OPENAI_API_KEY: openAiConfig.apiKey, HOUSEMATES_DIALOGUE_OPENAI_MODEL: openAiConfig.model }), null);
  assert.deepEqual(readDialogueConfig({ ...env(), OPENAI_API_KEY: openAiConfig.apiKey }), config);
  assert.deepEqual(readDialogueConfig({ ...env(), HOUSEMATES_DIALOGUE_PROVIDER: "ollama" }), config);
  for (const settings of [
    { ...env(), HOUSEMATES_DIALOGUE_PROVIDER: "openai" },
    { ...openAiEnv, OPENAI_API_KEY: "" }, { ...openAiEnv, HOUSEMATES_DIALOGUE_OPENAI_MODEL: "" },
    { ...openAiEnv, OPENAI_API_KEY: "sk-fixture-only\nInjected-header: bad" },
    { ...openAiEnv, HOUSEMATES_DIALOGUE_OPENAI_MODEL: "model\nother" },
    { ...env(), HOUSEMATES_DIALOGUE_PROVIDER: "unknown" }, { ...env(), HOUSEMATES_DIALOGUE_PROVIDER: "" },
  ]) assert.equal(readDialogueConfig(settings), null);
});

test("OpenAI uses the fixed Responses endpoint, private bearer, no storage/tools/retries and a strict wrapped schema", async () => {
  let calls = 0;
  const result = await handleDialogueRequest(request(), openAiConfig, async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${openAiConfig.apiKey}`);
    assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "fixture-structured-model");
    assert.equal(body.store, false);
    assert.equal(body.stream, false);
    assert.equal(body.max_output_tokens, 1024);
    assert.equal(body.reasoning, undefined);
    assert.equal(body.tools, undefined);
    assert.equal(body.previous_response_id, undefined);
    assert.equal(body.messages, undefined);
    assert.deepEqual(body.input, [{ role: "user", content: "Find a cheaper plan" }]);
    assert.equal(JSON.stringify(body).includes(openAiConfig.apiKey), false);
    const format = body.text.format;
    assert.equal(format.type, "json_schema");
    assert.equal(format.strict, true);
    assert.equal(format.schema.type, "object");
    assert.equal(format.schema.anyOf, undefined);
    assert.equal(format.schema.oneOf, undefined);
    assert.equal(format.schema.additionalProperties, false);
    assert.deepEqual(format.schema.required, ["suggestion"]);
    const variants = format.schema.properties.suggestion.anyOf;
    assert.equal(variants.length, 3);
    for (const variant of variants) {
      assert.equal(variant.type, "object");
      assert.equal(variant.additionalProperties, false);
      assert.deepEqual([...variant.required].sort(), Object.keys(variant.properties).sort());
      assert.equal(variant.properties.kind.type, "string");
      assert.equal(variant.properties.kind.enum.length, 1);
    }
    return Response.json(openAiEnvelope({ kind: "plan", mode: "cost" }));
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { source: "openai", suggestion: { kind: "plan", mode: "cost" } });
  const status = await handleDialogueRequest(new Request("http://localhost:3000/api/dialogue"), openAiConfig, noFetch);
  assert.deepEqual(await status.json(), { status: "configured" });
});

test("OpenAI constraint requests stay local and completed structured output must still match the requested meaning", async () => {
  const refusal = await handleDialogueRequest(request({ text: "Make a cheaper plan before breakfast" }), openAiConfig, noFetch);
  assert.deepEqual(await refusal.json(), { source: "local-guard", suggestion: { kind: "clarify", reason: "constraint-change" } });
  for (const suggestion of [{ kind: "approve" }, { kind: "plan", mode: "carbon" }, { kind: "plan", mode: "cost", costUsd: 0 }]) {
    const response = await handleDialogueRequest(request(), openAiConfig, async () => Response.json(openAiEnvelope(suggestion)));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "invalid-provider-response" });
  }
});

test("OpenAI refuses incomplete, failed, refusal, tool-call, multiple-message and malformed output envelopes", async () => {
  const good = openAiEnvelope({ kind: "plan", mode: "cost" });
  const message = good.output[0];
  const malformed = [
    { ...good, status: "incomplete" }, { ...good, status: "failed" }, { ...good, object: "chat.completion" },
    { ...good, error: { message: openAiConfig.apiKey } }, { ...good, incomplete_details: { reason: "max_output_tokens" } },
    { ...good, output: [] }, { ...good, output: [message, message] },
    { ...good, output: [{ type: "function_call", name: "approve", arguments: "{}" }] },
    { ...good, output: [{ ...message, role: "user" }] }, { ...good, output: [{ ...message, status: "incomplete" }] },
    { ...good, output: [{ ...message, content: [message.content[0], { type: "refusal", refusal: "No" }] }] },
    { ...good, output: [{ ...message, content: [{ type: "output_text", text: '{"kind":"plan","mode":"cost"}' }] }] },
    { ...good, output: [{ ...message, content: [{ type: "output_text", text: '{"suggestion":{"kind":"plan","mode":"cost"},"amount":0}' }] }] },
    { ...good, output: [{ ...message, content: [{ type: "output_text", text: "not JSON" }] }] },
  ];
  for (const upstream of malformed) {
    const response = await handleDialogueRequest(request(), openAiConfig, async () => Response.json(upstream));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "invalid-provider-response" });
  }
});

test("OpenAI ignores reasoning metadata only while still requiring exactly one safe assistant message", async () => {
  const good = openAiEnvelope({ kind: "plan", mode: "cost" });
  const reasoning = { type: "reasoning", summary: [{ type: "summary_text", text: "Not user-facing; never render arbitrary numbers 999" }] };
  const accepted = await handleDialogueRequest(request(), openAiConfig, async () => Response.json({ ...good, output: [reasoning, ...good.output] }));
  assert.deepEqual(await accepted.json(), { source: "openai", suggestion: { kind: "plan", mode: "cost" } });
  for (const output of [[reasoning], [reasoning, ...good.output, { type: "function_call", name: "approve" }],
    [reasoning, ...good.output, ...good.output], [{ type: "future_unknown" }, ...good.output]]) {
    const rejected = await handleDialogueRequest(request(), openAiConfig, async () => Response.json({ ...good, output }));
    assert.equal(rejected.status, 502);
  }
});

test("OpenAI authentication/rate/network failures stay sanitized, make one attempt and never retry another provider", async () => {
  for (const [status, code] of [[401, "provider-authentication"], [403, "provider-access-denied"], [429, "provider-limit-unknown"],
    [400, "provider-request-rejected"], [404, "provider-request-rejected"], [422, "provider-request-rejected"],
    [500, "provider-unavailable"], [302, "provider-unavailable"]] as const) {
    let calls = 0;
    const response = await handleDialogueRequest(request(), openAiConfig, async () => {
      calls++;
      return new Response(openAiConfig.apiKey, { status });
    });
    assert.equal(calls, 1);
    assert.deepEqual(await response.json(), { error: code });
  }
  const failure = await handleDialogueRequest(request(), openAiConfig, async () => { throw new Error(openAiConfig.apiKey); });
  assert.deepEqual(await failure.json(), { error: "provider-unavailable" });
});

test("exact GPT-6 Luna uses documented none effort while other configured models retain provider defaults", async () => {
  for (const model of ["gpt-6-luna", "gpt-6-luna-other", "fixture-structured-model"]) {
    let calls = 0;
    const response = await handleDialogueRequest(request(), { ...openAiConfig, model }, async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.reasoning, model === "gpt-6-luna" ? { effort: "none" } : undefined);
      assert.equal(body.max_output_tokens, 1024);
      assert.equal(body.store, false);
      return Response.json(openAiEnvelope({ kind: "plan", mode: "cost" }));
    });
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
  }
});

test("OpenAI token exhaustion and refusal remain rejected but report distinct fixed diagnostic codes", async () => {
  const good = openAiEnvelope({ kind: "plan", mode: "cost" });
  for (const [payload, code] of [
    [{ ...good, status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }, "provider-token-limit"],
    [{ ...good, status: "incomplete", incomplete_details: { reason: "content_filter" }, output: [] }, "provider-refused"],
    [{ ...good, output: [{ ...good.output[0], content: [{ type: "refusal", refusal: openAiConfig.apiKey }] }] }, "provider-refused"],
    [{ ...good, status: "incomplete", incomplete_details: { reason: openAiConfig.apiKey } }, "invalid-provider-response"],
  ] as const) {
    const response = await handleDialogueRequest(request(), openAiConfig, async () => Response.json(payload));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: code });
  }
});

test("only allowlisted limit codes classify billing/rate failures; arbitrary provider data never escapes in serialized logs", async () => {
  const logs: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...values: unknown[]) => { logs.push(values); };
  try {
    for (const [payload, code] of [
      [{ error: { code: "insufficient_quota", message: openAiConfig.apiKey, param: "Find a cheaper plan", type: "private-account" } }, "provider-quota"],
      [{ error: { type: "insufficient_quota", code: null } }, "provider-quota"],
      [{ error: { code: "credit_balance_exhausted", type: "insufficient_quota" } }, "provider-credit-balance"],
      [{ error: { code: "organization_spend_limit_exceeded", type: "insufficient_quota" } }, "provider-spend-limit"],
      [{ error: { code: "project_spend_limit_exceeded", type: "insufficient_quota" } }, "provider-spend-limit"],
      [{ error: { code: "organization_usage_limit_exceeded", type: "insufficient_quota" } }, "provider-usage-limit"],
      [{ error: { code: `insufficient_quota ${openAiConfig.apiKey}`, message: openAiConfig.apiKey } }, "provider-limit-unknown"],
      [{ error: { code: { secret: openAiConfig.apiKey } } }, "provider-limit-unknown"],
      [{ error: { type: `rate_limit_error ${openAiConfig.apiKey}` } }, "provider-limit-unknown"],
      [{ error: null }, "provider-limit-unknown"], [null, "provider-limit-unknown"],
      [{ error: { code: "rate_limit_exceeded", message: openAiConfig.apiKey } }, "provider-rate-limit"],
      [{ error: { code: "slow_down", type: "rate_limit_error" } }, "provider-rate-limit"],
      [{ error: { type: "rate_limit_error", code: null } }, "provider-rate-limit"],
    ] as const) {
      let calls = 0;
      const response = await handleDialogueRequest(request(), openAiConfig, async () => {
        calls++;
        return Response.json(payload, { status: 429, headers: { "x-request-id": openAiConfig.apiKey } });
      });
      assert.equal(calls, 1);
      assert.deepEqual(await response.json(), { error: code });
      const last = logs.at(-1);
      assert.equal(last?.length, 1);
      assert.equal(typeof last?.[0], "string");
      assert.deepEqual(JSON.parse((last![0] as string).slice("housemates:dialogue ".length)), { provider: "openai", status: 429, error: code });
      assert.deepEqual(last, [`housemates:dialogue ${JSON.stringify({ provider: "openai", status: 429, error: code })}`]);
    }
    const network = await handleDialogueRequest(request(), openAiConfig, async () => { throw new Error(`private ${openAiConfig.apiKey}`); });
    assert.deepEqual(await network.json(), { error: "provider-unavailable" });
    assert.deepEqual(logs.at(-1), ['housemates:dialogue {"provider":"openai","status":null,"error":"provider-unavailable"}']);
    assert.equal(JSON.stringify(logs).includes(openAiConfig.apiKey), false);
    assert.equal(JSON.stringify(logs).includes("Find a cheaper plan"), false);
    assert.equal(JSON.stringify(logs).includes("private-account"), false);
  } finally { console.warn = originalWarn; }
});

test("provider error bodies are byte-bounded and cancelled; malformed payloads keep status-only diagnostics", async () => {
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(4097))); },
    cancel() { cancelled = true; },
  });
  const response = await handleDialogueRequest(request(), openAiConfig, async () => new Response(oversized, { status: 429 }));
  assert.equal(cancelled, true);
  assert.deepEqual(await response.json(), { error: "provider-limit-unknown" });
  const malformed = await handleDialogueRequest(request(), openAiConfig, async () => new Response("malformed private content", { status: 401 }));
  assert.deepEqual(await malformed.json(), { error: "provider-authentication" });
});

test("OpenAI response limits and deadlines retain transport cancellation without exposing provider data", async () => {
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(16_385)); }, cancel() { cancelled = true; } });
  const result = await handleDialogueRequest(request(), openAiConfig, async () => new Response(oversized));
  assert.equal(result.status, 502);
  assert.equal(cancelled, true);
  let signal: AbortSignal | null | undefined;
  const stalled = await handleDialogueRequest(request(), openAiConfig, async (_url, init) => {
    signal = init?.signal;
    return new Promise<Response>(() => {});
  }, 5);
  assert.equal(stalled.status, 504);
  assert.equal(signal?.aborted, true);
  assert.deepEqual(await stalled.json(), { error: "provider-timeout" });
});

test("actual provider deadlines give OpenAI twenty seconds and Ollama eight, and test overrides cannot increase them", async () => {
  const delays: number[] = [];
  const testModule = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), "src/server/dialogue-provider.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: testModule, exports: testModule.exports, AbortController, Response, TextDecoder, URL,
    setTimeout: (callback: () => void, delay: number) => { delays.push(delay); return setTimeout(callback, delay); }, clearTimeout,
    require: (name: string) => {
      if (name === "../domain/dialogue-contract") return dialogueContract;
      if (name === "./request-origin") return { isSameOrigin };
      if (name === "./dialogue-transport") return dialogueTransport;
      throw new Error(name);
    },
  });
  const handler = (testModule.exports as { handleDialogueRequest: typeof handleDialogueRequest }).handleDialogueRequest;
  for (const [settings, override] of [[openAiConfig, undefined], [config, undefined], [openAiConfig, 90_000], [config, 90_000]] as const) {
    const response = await handler(request(), settings, async () => settings.provider === "openai"
      ? Response.json(openAiEnvelope({ kind: "plan", mode: "cost" })) : modelResponse({ kind: "plan", mode: "cost" }), override);
    assert.equal(response.status, 200);
  }
  assert.deepEqual(delays, [20_000, 8_000, 20_000, 8_000]);
});
