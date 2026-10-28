import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isPublicAiDeployment, publicAiAvailable, reservePublicAiQuota } from "../src/server/public-ai-quota";
import { handleDialogueRequest, type DialogueConfig } from "../src/server/dialogue-provider";
import { handleCharacterDialogueRequest } from "../src/server/character-dialogue";

const env = { HOUSEMATES_PUBLIC_DEMO: "1", UPSTASH_REDIS_REST_URL: "https://fixture.upstash.io", UPSTASH_REDIS_REST_TOKEN: "fixture-redis-token-not-real", HOUSEMATES_AI_QUOTA_SECRET: "fixture-quota-secret-never-real-123456789", HOUSEMATES_AI_DAILY_LIMIT: "1" };
const config: DialogueConfig = { provider: "openai", apiKey: "sk-fixture-not-a-real-api-key", model: "fixture-model" };
const body = { character: "evie", text: "Hello!", plannerReply: "No plan is approved.", history: [] };
const post = (character = false, headers: Record<string, string> = {}) => new Request(`http://localhost:3000/api/${character ? "character-dialogue" : "dialogue"}`, {
  method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers }, body: JSON.stringify(character ? body : { text: "Find a cheaper plan" }),
});
const noFetch: typeof fetch = async () => { assert.fail("Unexpected network request"); };
const signal = () => new AbortController().signal;
const envelope = (value: unknown) => Response.json({ object: "response", status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });

test("public configuration fails closed while private adapters need no store", async () => {
  assert.equal(isPublicAiDeployment({ VERCEL: "1" }), true);
  assert.equal(isPublicAiDeployment({ HOUSEMATES_PUBLIC_DEMO: "1" }), true);
  assert.equal(publicAiAvailable({}), true);
  assert.equal(publicAiAvailable({ VERCEL: "1" }), false);
  assert.equal(publicAiAvailable(env), true);
  for (const update of [{ UPSTASH_REDIS_REST_URL: "http://127.0.0.1" }, { UPSTASH_REDIS_REST_URL: "https://fixture.upstash.io.evil.example" }, { UPSTASH_REDIS_REST_URL: "https://user@fixture.upstash.io" }, { UPSTASH_REDIS_REST_URL: "https://fixture.upstash.io/path" }, { UPSTASH_REDIS_REST_URL: "https://fixture.upstash.io?token=private" }, { UPSTASH_REDIS_REST_TOKEN: "short" }, { HOUSEMATES_AI_QUOTA_SECRET: "short" }, { HOUSEMATES_AI_DAILY_LIMIT: "0" }, { HOUSEMATES_AI_DAILY_LIMIT: "1001" }, { HOUSEMATES_AI_DAILY_LIMIT: "1.5" }])
    assert.equal(publicAiAvailable({ ...env, ...update }), false);
  assert.deepEqual(await reservePublicAiQuota(post(), { env: {}, fetcher: noFetch }, signal()), { ok: true });
  assert.deepEqual(await reservePublicAiQuota(post(), { env: { VERCEL: "1" }, fetcher: noFetch }, signal()), { ok: false, status: 503, error: "public-ai-unavailable" });
});

test("GET never reserves and absent public quota blocks both providers before network", async () => {
  for (const handler of [handleDialogueRequest, handleCharacterDialogueRequest]) {
    const options = { env: { HOUSEMATES_PUBLIC_DEMO: "1" }, fetcher: noFetch };
    assert.deepEqual(await (await handler(new Request("http://localhost:3000/api/dialogue"), config, noFetch, undefined, options)).json(), { status: "unconfigured" });
    const denied = await handler(post(true), config, noFetch, undefined, options);
    assert.equal(denied.status, 503);
    assert.deepEqual(await denied.json(), { error: "public-ai-unavailable" });
    assert.deepEqual(await (await handler(new Request("http://localhost:3000/api/dialogue"), config, noFetch, undefined, { env, fetcher: noFetch })).json(), { status: "configured" });
  }
});

test("both endpoints compete for the same last shared atomic reservation before inference", async () => {
  // The fixture models an atomic store, not two independent process counters.
  // Lua implementation itself is inspected independently; no live Redis is required.
  let remaining = 1, paid = 0;
  const keys: unknown[] = [];
  const store: typeof fetch = async (url, init) => {
    assert.equal(url, env.UPSTASH_REDIS_REST_URL);
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`);
    const command = JSON.parse(String(init?.body));
    assert.equal(command[0], "EVAL"); assert.equal(command[2], 1); assert.equal(command.at(-1), 1);
    assert.match(command[1], /redis.call\('TIME'\)/); assert.match(command[1], /HSET/);
    keys.push(command[3]);
    const reserved = remaining > 0 ? (remaining--, 1) : 0;
    await Promise.resolve();
    return Response.json({ result: reserved });
  };
  const provider: typeof fetch = async (_url, init) => {
    paid++;
    const payload = JSON.parse(String(init?.body));
    return envelope(payload.text.format.name === "housemates_character_reply" ? { reply: "Good to see you!" } : { suggestion: { kind: "plan", mode: "cost" } });
  };
  const options = { env, fetcher: store };
  const responses = await Promise.all([handleDialogueRequest(post(), config, provider, undefined, options), handleCharacterDialogueRequest(post(true), config, provider, undefined, options)]);
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 429]);
  assert.equal(paid, 1); assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
  assert.deepEqual(await responses.find(row => row.status === 429)!.json(), { error: "public-ai-limit" });
  assert.equal(JSON.stringify(keys).includes(env.HOUSEMATES_AI_QUOTA_SECRET), false);
});

test("trusted Vercel client identity is hashed; arbitrary public proxies get no IP trust", async () => {
  const commands: unknown[][] = [];
  const fetcher: typeof fetch = async (_url, init) => { commands.push(JSON.parse(String(init?.body))); return Response.json({ result: 1 }); };
  const ip = "203.0.113.15";
  const vercel = { ...env, VERCEL: "1" };
  assert.deepEqual(await reservePublicAiQuota(post(false, { "x-forwarded-for": ip }), { env: vercel, fetcher }, signal()), { ok: true });
  assert.equal(commands[0][2], 2); assert.equal(JSON.stringify(commands).includes(ip), false);
  for (const value of ["", "attacker", "203.0.113.15,203.0.113.16"])
    assert.equal((await reservePublicAiQuota(post(false, { "x-forwarded-for": value }), { env: vercel, fetcher: noFetch }, signal())).ok, false);
  await reservePublicAiQuota(post(false, { "x-forwarded-for": "attacker" }), { env, fetcher }, signal());
  assert.equal(commands[1][2], 1);
  assert.deepEqual(await reservePublicAiQuota(post(), { env, fetcher: async () => Response.json({ result: 2 }) }, signal()), { ok: false, status: 429, error: "public-ai-burst-limit" });
});

test("store failure, malformed/oversized data, and exhausted quotas never reach either provider", async () => {
  for (const response of [() => Response.json({ result: 0 }), () => Response.json({ result: "1" }), () => Response.json({ result: 1, error: "secret provider text" }), () => Response.json({ result: -1 }), () => new Response("not JSON"), () => new Response("x".repeat(2049)), () => Response.json({ result: 1 }, { status: 503 })]) {
    for (const [handler, character] of [[handleDialogueRequest, false], [handleCharacterDialogueRequest, true]] as const) {
      let calls = 0;
      const result = await handler(post(character), config, noFetch, undefined, { env, fetcher: async () => { calls++; return response(); } });
      assert.ok([429, 503].includes(result.status)); assert.equal(calls, 1);
      assert.match(JSON.stringify(await result.json()), /^\{"error":"public-ai-(limit|unavailable)"\}$/);
    }
  }
});

test("quota transport is bounded, cancels streams and never retries ambiguous reservations", async () => {
  let calls = 0, captured: AbortSignal | null | undefined;
  const stalled = await reservePublicAiQuota(post(), { env, timeoutMs: 5, fetcher: async (_url, init) => { calls++; captured = init?.signal; return new Promise<Response>(() => {}); } }, signal());
  assert.equal(stalled.ok, false); assert.equal(calls, 1); assert.equal(captured?.aborted, true);
  let canceled = false;
  const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(2049)); }, cancel() { canceled = true; } });
  assert.equal((await reservePublicAiQuota(post(), { env, fetcher: async () => new Response(oversized) }, signal())).ok, false);
  assert.equal(canceled, true);
  const abort = new AbortController(); abort.abort();
  assert.equal((await reservePublicAiQuota(post(), { env, fetcher: noFetch }, abort.signal)).ok, false);
  assert.deepEqual(await reservePublicAiQuota(post(), { env, fetcher: async () => { throw new Error(`${env.UPSTASH_REDIS_REST_TOKEN} private upstream detail`); } }, signal()),
    { ok: false, status: 503, error: "public-ai-unavailable" });
});

test("invalid inputs cannot consume allowance and a failed provider attempt is never refunded", async () => {
  const malformed = new Request("http://localhost:3000/api/character-dialogue", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: "{}" });
  assert.equal((await handleCharacterDialogueRequest(malformed, config, noFetch, undefined, { env, fetcher: noFetch })).status, 400);
  let reservations = 0, providerCalls = 0;
  const store: typeof fetch = async () => Response.json({ result: ++reservations === 1 ? 1 : 0 });
  const provider: typeof fetch = async () => { providerCalls++; return Response.json({}, { status: 503 }); };
  const options = { env, fetcher: store };
  assert.equal((await handleDialogueRequest(post(), config, provider, undefined, options)).status, 502);
  assert.equal((await handleCharacterDialogueRequest(post(true), config, provider, undefined, options)).status, 429);
  assert.equal(reservations, 2); assert.equal(providerCalls, 1);
});

test("local provider behavior and local semantic clarification do not consume public allowance", async () => {
  const local = await handleDialogueRequest(post(), config, async () => envelope({ suggestion: { kind: "plan", mode: "cost" } }), undefined, { env: {}, fetcher: noFetch });
  assert.equal(local.status, 200);
  const clarify = new Request("http://localhost:3000/api/dialogue", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ text: "Finish by 7 AM" }) });
  const result = await handleDialogueRequest(clarify, config, noFetch, undefined, { env, fetcher: noFetch });
  assert.equal(result.status, 200); assert.equal((await result.json()).source, "local-guard");
});

test("actual route wrappers pass current server deployment policy to GET and POST", async () => {
  for (const character of [false, true]) {
    const file = `src/app/api/${character ? "character-dialogue" : "dialogue"}/route.ts`;
    const handlerName = character ? "handleCharacterDialogueRequest" : "handleDialogueRequest";
    const routeModule = { exports: {} };
    const policies: unknown[] = [];
    let connected = false;
    runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: routeModule, exports: routeModule.exports, process: { env }, require(name: string) {
        if (name === "next/server") return { connection: async () => { connected = true; } };
        if (name.includes("dialogue-provider") || name.includes("character-dialogue")) return {
          readDialogueConfig: (actual: unknown) => { assert.equal(actual, env); return config; },
          [handlerName]: (_request: Request, _config: unknown, _fetch: unknown, _timeout: unknown, options: { env: unknown }) => { policies.push(options.env); return Response.json({ status: "unconfigured" }); },
        };
        throw Error(name);
      },
    });
    const route = routeModule.exports as { GET(request: Request): Promise<Response>; POST(request: Request): Response };
    await route.GET(new Request("http://localhost:3000/api/dialogue")); assert.equal(connected, true);
    route.POST(post(character)); assert.deepEqual(policies, [env, env]);
  }
});
