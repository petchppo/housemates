import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { checkBlueBubbles, handleBlueBubblesPreflight } from "../src/server/bluebubbles-preflight";
import { readBridgeConfig } from "../src/server/imessage-bridge";

const env = {
  HOUSEMATES_IMESSAGE_URL: "https://private-bridge.example.test",
  HOUSEMATES_IMESSAGE_PASSWORD: "private-password-must-not-escape",
  HOUSEMATES_IMESSAGE_WEBHOOK_SECRET: "private-webhook-secret-1234567890-1234567890",
  HOUSEMATES_IMESSAGE_ALLOWED_SENDER: "+15551234567",
  HOUSEMATES_IMESSAGE_RECIPIENT: "private-bridge@example.test",
};
const config = readBridgeConfig(env)!;
const endpoint = "http://localhost:3000/api/imessage/preflight";
const post = (origin: string | null = "http://localhost:3000") => new Request(endpoint, {
  method: "POST", headers: origin ? { Origin: origin } : {},
});
const forbiddenFetch: typeof fetch = async () => { throw new Error("Provider must not be called"); };
function assertSanitized(value: unknown) {
  const output = JSON.stringify(value);
  for (const secret of Object.values(env)) assert.ok(!output.includes(secret), "Diagnostic must never expose configuration values");
}

test("preflight GET only reports configuration and never contacts a provider", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error("Unexpected network"); };
  for (const [settings, configured] of [[{}, false], [env, true]] as const) {
    const response = await handleBlueBubblesPreflight(new Request(endpoint), settings, { fetcher });
    assert.deepEqual(await response.json(), { configured });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(calls, 0);
});

test("unconfigured POST makes no provider call and exposes no missing field values", async () => {
  let calls = 0;
  const response = await handleBlueBubblesPreflight(post(), {}, { fetcher: async () => { calls++; return forbiddenFetch(endpoint); } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "unconfigured");
  assert.equal(calls, 0);
});

test("preflight requires same-origin POST and rejects other methods before any provider access", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return forbiddenFetch(endpoint); };
  for (const origin of [null, "https://other.example.test", "null"]) {
    assert.equal((await handleBlueBubblesPreflight(post(origin), env, { fetcher })).status, 403);
  }
  assert.equal((await handleBlueBubblesPreflight(new Request(endpoint, { method: "PUT" }), env, { fetcher })).status, 405);
  assert.equal(calls, 0);
});

test("preflight checks the actual Host when Next exposes an internal bind address", async () => {
  const request = (origin: string, host = "localhost:3000", forwarded?: string) => new Request("http://0.0.0.0:3000/api/imessage/preflight", {
    method: "POST", headers: { Origin: origin, Host: host, ...(forwarded ? { "X-Forwarded-Host": forwarded } : {}) },
  });
  const allowed = await handleBlueBubblesPreflight(request("http://localhost:3000"), {}, { fetcher: forbiddenFetch });
  assert.equal(allowed.status, 200); assert.equal((await allowed.json()).status, "unconfigured");
  for (const origin of ["http://evil.example", "https://localhost:3000", "http://localhost:4000", "http://0.0.0.0:3000"]) {
    assert.equal((await handleBlueBubblesPreflight(request(origin), {}, { fetcher: forbiddenFetch })).status, 403);
  }
  assert.equal((await handleBlueBubblesPreflight(request("http://evil.example", "localhost:3000", "evil.example"), {}, { fetcher: forbiddenFetch })).status, 403);
});

test("successful preflight uses only authenticated ping and does not claim message delivery", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, config.url);
    assert.equal(url.pathname, "/api/v1/ping");
    assert.equal(url.searchParams.get("password"), config.password);
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    assert.equal(init?.body, undefined);
    return Response.json({ status: 200, message: config.password, data: env });
  };
  const response = await handleBlueBubblesPreflight(post(), env, { fetcher });
  const data = await response.json();
  assert.equal(data.status, "reachable");
  assert.match(data.message, /pairing and message delivery have not been checked/);
  assertSanitized(data);
  assert.equal(calls, 1);
});

test("auth failure, malformed bodies, redirects and network errors all return sanitized unavailable", async () => {
  const cases: Array<() => Response | Promise<Response>> = [
    () => Response.json({ status: 401, error: config.password }, { status: 401 }),
    () => Response.json({ status: 500, data: env }),
    () => Response.json({ status: "200" }),
    () => Response.json([200]),
    () => Response.json(null),
    () => Response.json({ message: "Pong" }),
    () => new Response("not JSON " + config.password, { headers: { "Content-Type": "application/json" } }),
    () => new Response("<html>" + config.password, { headers: { "Content-Type": "text/html" } }),
    () => new Response(null, { status: 302, headers: { Location: "https://elsewhere.example.test" } }),
    () => { throw new Error(config.url + "?password=" + config.password); },
  ];
  for (const fixture of cases) {
    const data = await checkBlueBubbles(config, { fetcher: async () => fixture() });
    assert.equal(data.status, "unavailable");
    assertSanitized(data);
  }
});

test("oversized streamed provider responses are bounded and canceled", async () => {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(4097))); },
    cancel() { canceled = true; },
  });
  const data = await checkBlueBubbles(config, { fetcher: async () => new Response(body, { headers: { "Content-Type": "application/json" } }) });
  assert.equal(data.status, "unavailable");
  assert.equal(canceled, true);
  assertSanitized(data);
});

test("deadline bounds both a stalled fetch and a stalled response body", async () => {
  for (const bodyStalls of [false, true]) {
    let signal: AbortSignal | null | undefined;
    let canceled = false;
    const fetcher: typeof fetch = async (_input, init) => {
      signal = init?.signal;
      if (!bodyStalls) return new Promise<Response>(() => {});
      return new Response(new ReadableStream<Uint8Array>({ cancel() { canceled = true; } }), { headers: { "Content-Type": "application/json" } });
    };
    const data = await checkBlueBubbles(config, { fetcher, timeoutMs: 10 });
    assert.equal(data.status, "unavailable");
    assert.equal(signal?.aborted, true);
    if (bodyStalls) assert.equal(canceled, true);
    assertSanitized(data);
  }
});

test("actual GET route waits for request time and reads current configuration without provider activity", async () => {
  let connected = false, reads = 0;
  let currentEnv: Record<string, string | undefined> = {};
  let connect!: () => void;
  const incoming = new Promise<void>(resolve => { connect = () => { connected = true; resolve(); }; });
  const fixtureModule = { exports: {} };
  const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/app/api/imessage/preflight/route.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, {
    module: fixtureModule, exports: fixtureModule.exports,
    process: { get env() { assert.equal(connected, true, "Do not capture build-time configuration"); reads++; return currentEnv; } },
    require: (name: string) => {
      if (name === "next/server") return { connection: () => incoming };
      if (name === "@/server/bluebubbles-preflight") return { handleBlueBubblesPreflight: (request: Request, settings: Record<string, string | undefined>) => handleBlueBubblesPreflight(request, settings, { fetcher: forbiddenFetch }) };
      throw Error(name);
    },
  });
  const route = fixtureModule.exports as { GET(request: Request): Promise<Response> };
  const waiting = route.GET(new Request(endpoint)); assert.equal(reads, 0); connect();
  assert.deepEqual(await (await waiting).json(), { configured: false });
  currentEnv = env;
  assert.deepEqual(await (await route.GET(new Request(endpoint))).json(), { configured: true });
  assert.equal(reads, 2);
});
