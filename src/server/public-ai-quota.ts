import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { readJson } from "./dialogue-transport";

type Environment = Record<string, string | undefined>;
export type PublicAiQuotaOptions = { env?: Environment; fetcher?: typeof fetch; timeoutMs?: number };
type QuotaResult = { ok: true } | { ok: false; status: 429 | 503; error: "public-ai-unavailable" | "public-ai-limit" | "public-ai-burst-limit" };
const unavailable: QuotaResult = { ok: false, status: 503, error: "public-ai-unavailable" };
const TIMEOUT_MS = 1500;

export const isPublicAiDeployment = (env: Environment): boolean => env.VERCEL === "1" || env.HOUSEMATES_PUBLIC_DEMO === "1";

function configuration(env: Environment) {
  const endpoint = env.UPSTASH_REDIS_REST_URL, token = env.UPSTASH_REDIS_REST_TOKEN, secret = env.HOUSEMATES_AI_QUOTA_SECRET;
  const rawLimit = env.HOUSEMATES_AI_DAILY_LIMIT ?? "100";
  if (!endpoint || endpoint.length > 512 || !token || token.length < 20 || token.length > 2048 || /\s/.test(token) ||
      !secret || secret.length < 32 || secret.length > 256 || /\s/.test(secret) || !/^[1-9]\d{0,3}$/.test(rawLimit) || Number(rawLimit) > 1000) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || !/^[a-z0-9][a-z0-9-]*\.upstash\.io$/i.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return { endpoint: url.origin, token, secret, limit: Number(rawLimit) };
  } catch { return null; }
}

/** Configuration readiness only; GET never contacts Redis or reserves an inference. */
export function publicAiAvailable(env: Environment): boolean {
  return !isPublicAiDeployment(env) || configuration(env) !== null;
}

// One atomic EVAL, shared by both endpoints and every instance using the same secret/store.
// Redis TIME determines UTC day/minute, so client clocks and instance clock skew cannot reset it.
// Reservation is never refunded: a timeout may already have caused a billable provider request.
const RESERVE = `
local now = tonumber(redis.call('TIME')[1])
local day = math.floor(now / 86400)
local minute = math.floor(now / 60)
local function counter(key, period)
  local value = redis.call('HMGET', key, 'period', 'count')
  if not value[1] and not value[2] then return 0 end
  local previous, count = tonumber(value[1]), tonumber(value[2])
  if not previous or not count or previous ~= math.floor(previous) or count ~= math.floor(count) or count < 0 or previous > period then return nil end
  if previous ~= period then return 0 end
  return count
end
local total = counter(KEYS[1], day)
if not total then return -1 end
if total >= tonumber(ARGV[1]) then return 0 end
local burst = 0
if #KEYS == 2 then
  burst = counter(KEYS[2], minute)
  if not burst then return -1 end
  if burst >= 6 then return 2 end
end
redis.call('HSET', KEYS[1], 'period', day, 'count', total + 1)
redis.call('EXPIRE', KEYS[1], 172800)
if #KEYS == 2 then
  redis.call('HSET', KEYS[2], 'period', minute, 'count', burst + 1)
  redis.call('EXPIRE', KEYS[2], 120)
end
return 1`;

/** A shared request-attempt cap, not a dollar budget or user authentication system.
 * Route wrappers must explicitly pass server env; injected adapters default to private tests. */
export async function reservePublicAiQuota(request: Request, options: PublicAiQuotaOptions, signal: AbortSignal): Promise<QuotaResult> {
  const env = options.env ?? {};
  if (!isPublicAiDeployment(env)) return { ok: true };
  const config = configuration(env);
  if (!config || signal.aborted) return unavailable;
  const hash = (value: string) => createHmac("sha256", config.secret).update(value).digest("hex");
  const prefix = `housemates:ai:{${hash("public-ai-quota-v1")}}`;
  const keys = [`${prefix}:daily`];
  if (env.VERCEL === "1") {
    // Vercel documents that its edge overwrites X-Forwarded-For. Never use it on
    // arbitrary self-hosted public deployments, and reject lists/invalid identities.
    const ip = request.headers.get("x-forwarded-for");
    if (!ip || ip.length > 45 || !isIP(ip)) return unavailable;
    keys.push(`${prefix}:client:${hash(ip)}`);
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel!: () => void;
  const stopped = new Promise<never>((_, reject) => {
    cancel = () => { controller.abort(); reject(new Error("quota-unavailable")); };
    signal.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(cancel, Number.isFinite(options.timeoutMs) ? Math.max(1, Math.min(TIMEOUT_MS, options.timeoutMs!)) : TIMEOUT_MS);
  });
  try {
    const operation = async (): Promise<QuotaResult> => {
      const response = await (options.fetcher ?? fetch)(config.endpoint, {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
        body: JSON.stringify(["EVAL", RESERVE, keys.length, ...keys, config.limit]),
      });
      if (!response.ok) { void response.body?.cancel().catch(() => {}); return unavailable; }
      const payload = await readJson(response, 2048, controller.signal);
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).join(",") !== "result") return unavailable;
      const result = (payload as { result: unknown }).result;
      if (result === 1) return { ok: true };
      if (result === 0) return { ok: false, status: 429, error: "public-ai-limit" };
      if (result === 2) return { ok: false, status: 429, error: "public-ai-burst-limit" };
      return unavailable;
    };
    return await Promise.race([operation(), stopped]);
  } catch { return unavailable; }
  finally {
    if (timer !== undefined) clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    controller.abort();
  }
}
