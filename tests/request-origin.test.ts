import assert from "node:assert/strict";
import test from "node:test";
import { isSameOrigin } from "../src/server/request-origin";

const request = (origin: string, host = "home.example", url = "http://0.0.0.0:3000/api/dialogue", headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { origin, host, ...headers } });

test("local Host and native HTTPS retain exact origin and port matching", () => {
  assert.equal(isSameOrigin(request("http://localhost:3000", "localhost:3000"), {}), true);
  assert.equal(isSameOrigin(request("https://home.example", "home.example", "https://internal.example/api"), {}), true);
  assert.equal(isSameOrigin(new Request("http://localhost:3000/api", { headers: { origin: "http://localhost:3000" } }), {}), true);
  for (const origin of ["https://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"])
    assert.equal(isSameOrigin(request(origin, "localhost:3000"), {}), false);
});

test("trusted deployment metadata permits TLS termination only for the same Host", () => {
  const env = { VERCEL: "1", VERCEL_URL: "deploy.vercel.app", VERCEL_BRANCH_URL: "branch.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "home.example" };
  for (const host of ["deploy.vercel.app", "branch.vercel.app", "home.example"])
    assert.equal(isSameOrigin(request(`https://${host}`, host), env), true, host);
  assert.equal(isSameOrigin(request("https://home.example", "deploy.vercel.app"), env), false, "aliases are not the same origin");
  assert.equal(isSameOrigin(request("https://home.example:444", "home.example:444"), env), false);
  assert.equal(isSameOrigin(request("https://other.vercel.app", "other.vercel.app"), env), false, "no wildcard trust");
  assert.equal(isSameOrigin(request("https://home.example"), { ...env, VERCEL: "0" }), false);
});

test("an explicit bounded HTTPS origin list supports custom proxy domains without trusting forwarding", () => {
  const env = { HOUSEMATES_TRUSTED_ORIGINS: "https://home.example, https://other.example:444" };
  assert.equal(isSameOrigin(request("https://home.example"), env), true);
  assert.equal(isSameOrigin(request("https://other.example:444", "other.example:444"), env), true);
  assert.equal(isSameOrigin(request("https://home.example", "internal.example", undefined, { "x-forwarded-host": "home.example", "x-forwarded-proto": "https" }), env), false);
  assert.equal(isSameOrigin(request("https://home.example", "home.example", undefined, { "x-forwarded-proto": "https", "x-vercel-deployment-url": "home.example" }), {}), false);
  assert.equal(isSameOrigin(request("http://home.example", "home.example", "https://home.example/api"), env), false);
});

test("malformed origin, Host, and deployment settings cannot expand trust", () => {
  const env = { HOUSEMATES_TRUSTED_ORIGINS: "https://home.example" };
  for (const origin of ["null", "https://home.example/", "https://user@home.example", "https://home.example#x", "https://home.example,https://evil.example"])
    assert.equal(isSameOrigin(request(origin), env), false, origin);
  for (const host of ["", "home.example/path", "user@home.example", "home.example,evil.example", "home.example\\evil.example"])
    assert.equal(isSameOrigin(request("https://home.example", host), env), false, host);
  for (const configured of ["*", "http://home.example", "https://home.example/", "https://home.example,", "https://home.example," + "x".repeat(4096), Array(17).fill("https://home.example").join(",")])
    assert.equal(isSameOrigin(request("https://home.example"), { HOUSEMATES_TRUSTED_ORIGINS: configured }), false, configured.slice(0, 80));
  for (const domain of ["https://home.example", "home.example/path", "home.example:443", "user@home.example", "*.example"])
    assert.equal(isSameOrigin(request("https://home.example"), { VERCEL: "1", VERCEL_URL: domain }), false, domain);
});
