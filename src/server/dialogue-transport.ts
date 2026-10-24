// Shared bounded transport and fixed diagnostics for the optional server-only dialogue adapters.
type FailureCode = "body-too-large" | "invalid-json" | "invalid-request" | "provider-timeout" | "provider-unavailable" | "invalid-provider-response"
  | "provider-authentication" | "provider-access-denied" | "provider-quota" | "provider-rate-limit" | "provider-request-rejected"
  | "provider-token-limit" | "provider-refused" | "provider-credit-balance" | "provider-spend-limit" | "provider-usage-limit" | "provider-limit-unknown" | "unsafe-character-reply";
export class DialogueFailure extends Error {
  constructor(public status: number, public code: FailureCode) { super(code); }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function upstreamFailureCode(status: number, payload: unknown): FailureCode {
  if (status === 401) return "provider-authentication";
  if (status === 403) return "provider-access-denied";
  if (status === 429) {
    if (!record(payload) || !record(payload.error)) return "provider-limit-unknown";
    const { code, type } = payload.error;
    // Specific billing codes take priority over their broader insufficient_quota type.
    if (code === "credit_balance_exhausted") return "provider-credit-balance";
    if (code === "organization_spend_limit_exceeded" || code === "project_spend_limit_exceeded") return "provider-spend-limit";
    if (code === "organization_usage_limit_exceeded") return "provider-usage-limit";
    if (code === "insufficient_quota" || type === "insufficient_quota") return "provider-quota";
    if (code === "rate_limit_exceeded" || code === "slow_down" || type === "rate_limit_error") return "provider-rate-limit";
    return "provider-limit-unknown";
  }
  if ([400, 404, 422].includes(status)) return "provider-request-rejected";
  return "provider-unavailable";
}

export async function readJson(body: Request | Response, limit: number, signal: AbortSignal): Promise<unknown> {
  const declared = body.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new DialogueFailure(413, "body-too-large");
  if (!body.body) throw new DialogueFailure(400, "invalid-json");
  const reader = body.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let size = 0, text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      if (signal.aborted) throw new DialogueFailure(504, "provider-timeout");
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new DialogueFailure(413, "body-too-large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof DialogueFailure) throw error;
    throw new DialogueFailure(400, "invalid-json");
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
  }
}
