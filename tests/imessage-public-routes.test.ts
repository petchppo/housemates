import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Routes = { GET(request: Request): Promise<Response>; POST(request: Request): Response | Promise<Response> };
function fixture(preflight: boolean, env: Record<string, string | undefined>) {
  const file = `src/app/api/imessage/${preflight ? "preflight/" : ""}route.ts`;
  const compiled = ts.transpileModule(readFileSync(resolve(process.cwd(), file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls = { connection: 0, store: 0, bridge: 0, config: 0, handler: 0, preflight: 0 };
  const testModule = { exports: {} };
  runInNewContext(compiled, { module: testModule, exports: testModule.exports, process: { env }, Response, Date,
    require(name: string) {
      if (name === "next/server") return { connection: async () => { calls.connection++; } };
      if (name === "@/server/imessage-pairing-store") return { FilePairingStore: class { constructor() { calls.store++; } } };
      if (name === "@/server/imessage-bridge") return {
        IMessageBridge: class { constructor() { calls.bridge++; } },
        readBridgeConfig: () => { calls.config++; return { fixture: true }; },
        handleBridgeRequest: (request: Request) => { calls.handler++; return Response.json({ local: true, method: request.method }); },
      };
      if (name === "@/server/bluebubbles-preflight") return { handleBlueBubblesPreflight: (request: Request) => { calls.preflight++; return Response.json({ local: true, method: request.method }); } };
      throw Error(`Unexpected import: ${name}`);
    },
  });
  return { routes: testModule.exports as Routes, calls };
}

test("public Messages and preflight fail closed before any store, config or provider work despite configured secrets", async () => {
  for (const deployment of [{ VERCEL: "1" }, { HOUSEMATES_PUBLIC_DEMO: "1" }]) for (const preflight of [false, true]) {
    const env = { ...deployment, HOUSEMATES_IMESSAGE_URL: "https://fixture-private.example", HOUSEMATES_IMESSAGE_PASSWORD: "fixture-private-password", HOUSEMATES_IMESSAGE_ALLOWED_SENDER: "fixture-private-sender@example.com", HOUSEMATES_IMESSAGE_RECIPIENT: "fixture-private-recipient@example.com", HOUSEMATES_IMESSAGE_WEBHOOK_SECRET: "fixture-private-key" };
    const h = fixture(preflight, env);
    assert.equal(h.calls.store, 0, "Importing a public route must not construct a filesystem store");
    for (const method of ["GET", "POST"] as const) {
      const response = await h.routes[method](new Request("https://public.example/api/imessage", { method, ...(method === "POST" ? { body: "not even JSON", headers: { Authorization: "Bearer fixture-private-token", Cookie: "remembered=fixture-private-cookie" } } : {}) }));
      assert.equal(response.status, method === "GET" ? 200 : 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("set-cookie"), null);
      const text = await response.text(), body = JSON.parse(text);
      assert.equal(body.status, "beta"); assert.equal(body[preflight ? "configured" : "available"], false);
      if (method === "POST") assert.equal(body.error, "imessage-beta-unavailable");
      assert.doesNotMatch(text, /fixture-private|token|recipient|PAIR|cookie/);
    }
    assert.deepEqual(h.calls, { connection: 1, store: 0, bridge: 0, config: 0, handler: 0, preflight: 0 });
  }
});

test("deployment mode is checked per request and cannot fall through to a previously created local bridge", async () => {
  const env: Record<string, string> = {};
  const h = fixture(false, env);
  for (const method of ["GET", "POST"] as const) assert.deepEqual(await (await h.routes[method](new Request("http://localhost/api/imessage", { method }))).json(), { local: true, method });
  assert.deepEqual(h.calls, { connection: 1, store: 1, bridge: 1, config: 2, handler: 2, preflight: 0 });
  env.VERCEL = "1";
  assert.equal((await h.routes.POST(new Request("http://localhost/api/imessage", { method: "POST" }))).status, 503);
  assert.equal(h.calls.handler, 2); assert.equal(h.calls.config, 2); assert.equal(h.calls.store, 1);
});

test("ordinary local preflight delegates unchanged and never constructs the pairing store", async () => {
  const h = fixture(true, {});
  for (const method of ["GET", "POST"] as const) assert.deepEqual(await (await h.routes[method](new Request("http://localhost/api/imessage/preflight", { method }))).json(), { local: true, method });
  assert.deepEqual(h.calls, { connection: 1, store: 0, bridge: 0, config: 0, handler: 0, preflight: 2 });
});
