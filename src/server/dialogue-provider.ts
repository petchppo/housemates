import { DialogueFailure, readJson, upstreamFailureCode } from "./dialogue-transport";
import { assessDialogueRequest, parseDialogueSuggestion, suggestionMatchesRequest } from "../domain/dialogue-contract";
import { isSameOrigin } from "./request-origin";
import { publicAiAvailable, reservePublicAiQuota, type PublicAiQuotaOptions } from "./public-ai-quota";

export type DialogueConfig =
  | { provider?: "ollama"; baseUrl: string; model: string }
  | { provider: "openai"; apiKey: string; model: string };
type Fetcher = typeof fetch;
const REQUEST_BYTES = 4096;
const RESPONSE_BYTES = 16_384;
const ERROR_RESPONSE_BYTES = 4_096;
const OLLAMA_TIMEOUT_MS = 8_000;
const OPENAI_TIMEOUT_MS = 20_000;
let activeRequests = 0;

/** Provider activation is server-only. An API key alone never selects a paid provider. */
export function readDialogueConfig(env: Record<string, string | undefined>): DialogueConfig | null {
  const provider = env.HOUSEMATES_DIALOGUE_PROVIDER;
  if (provider === "openai") {
    const apiKey = env.OPENAI_API_KEY;
    const model = env.HOUSEMATES_DIALOGUE_OPENAI_MODEL;
    if (!apiKey || !/^[a-zA-Z0-9_-]{20,512}$/.test(apiKey) || !model || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(model)) return null;
    return { provider: "openai", apiKey, model };
  }
  if (provider !== undefined && provider !== "ollama") return null;
  const baseUrl = env.HOUSEMATES_DIALOGUE_OLLAMA_URL;
  const model = env.HOUSEMATES_DIALOGUE_OLLAMA_MODEL;
  if (!baseUrl || !model || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(model) || /cloud/i.test(model)) return null;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return { baseUrl: url.origin, model };
  } catch { return null; }
}

const schema = {
  oneOf: [
    { type: "object", properties: { kind: { type: "string", enum: ["plan"] }, mode: { type: "string", enum: ["cost", "carbon", "balanced"] } }, required: ["kind", "mode"], additionalProperties: false },
    { type: "object", properties: { kind: { type: "string", enum: ["clarify"] }, reason: { type: "string", enum: ["unsupported-request", "constraint-change", "ambiguous-objective"] } }, required: ["kind", "reason"], additionalProperties: false },
    { type: "object", properties: { kind: { type: "string", enum: ["explain"] }, topic: { type: "string", enum: ["cost", "carbon", "tradeoff", "approval"] } }, required: ["kind", "topic"], additionalProperties: false },
  ],
};
// Responses strict structured output requires an object at the root; unions may be nested.
const openAiSchema = {
  type: "object", properties: { suggestion: { anyOf: schema.oneOf } },
  required: ["suggestion"], additionalProperties: false,
};
const instructions = "Classify an objective-only household planning request. Never provide prose, numbers, deadlines, windows, appliance changes or execution. If unsure return a clarify suggestion. Cost and carbon are separate objectives; never drop a constraint.";

const respond = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseProviderOutput(output: unknown, provider: "openai" | "ollama"): unknown {
  const invalid = () => new DialogueFailure(502, "invalid-provider-response");
  if (!record(output)) throw invalid();
  let text: string;
  if (provider === "openai") {
    if (output.object === "response" && output.status === "incomplete" && record(output.incomplete_details)) {
      if (output.incomplete_details.reason === "max_output_tokens") throw new DialogueFailure(502, "provider-token-limit");
      if (output.incomplete_details.reason === "content_filter") throw new DialogueFailure(502, "provider-refused");
    }
    if (output.object !== "response" || output.status !== "completed" || output.error != null || output.incomplete_details != null ||
        !Array.isArray(output.output) || !output.output.length || output.output.length > 8 ||
        output.output.some(item => !record(item) || (item.type !== "message" && item.type !== "reasoning"))) throw invalid();
    // Reasoning metadata is never displayed or interpreted. Tools and every other output type fail closed.
    const messages: unknown[] = output.output.filter(item => record(item) && item.type === "message");
    if (messages.length !== 1) throw invalid();
    const message: unknown = messages[0];
    if (!record(message) || message.type !== "message" || message.role !== "assistant" || message.status !== "completed" ||
        !Array.isArray(message.content) || message.content.length !== 1) throw invalid();
    const content: unknown = message.content[0];
    if (record(content) && content.type === "refusal") throw new DialogueFailure(502, "provider-refused");
    if (!record(content) || content.type !== "output_text" || typeof content.text !== "string") throw invalid();
    text = content.text;
  } else {
    if (output.done !== true || !record(output.message) || output.message.role !== "assistant" ||
        typeof output.message.content !== "string" || output.message.tool_calls !== undefined) throw invalid();
    text = output.message.content;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw invalid(); }
  if (provider === "openai") {
    if (!record(parsed) || Object.keys(parsed).join(",") !== "suggestion") throw invalid();
    return parsed.suggestion;
  }
  return parsed;
}

/** Pure HTTP adapter with injectable transport; default-off requests never contact a provider.
 * timeoutMs is a server/test option, never an accepted browser field. */
export async function handleDialogueRequest(request: Request, config: DialogueConfig | null, fetcher: Fetcher = fetch, timeoutMs?: number, quotaOptions: PublicAiQuotaOptions = {}): Promise<Response> {
  const quota = { ...quotaOptions, fetcher: quotaOptions.fetcher ?? fetcher };
  const available = publicAiAvailable(quota.env ?? {});
  if (request.method === "GET") return respond(200, { status: config && available ? "configured" : "unconfigured" });
  if (request.method !== "POST") return respond(405, { error: "method-not-allowed" });
  if (!isSameOrigin(request)) return respond(403, { error: "same-origin-required" });
  if (!config) return respond(503, { error: "unconfigured" });
  if (!available) return respond(503, { error: "public-ai-unavailable" });
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return respond(415, { error: "json-required" });
  if (activeRequests >= 2) return respond(429, { error: "assistant-busy" });
  // Validate injected configuration too; only the fixed OpenAI endpoint or numeric loopback may be called.
  const safeConfig = readDialogueConfig(config.provider === "openai"
    ? { HOUSEMATES_DIALOGUE_PROVIDER: "openai", OPENAI_API_KEY: config.apiKey, HOUSEMATES_DIALOGUE_OPENAI_MODEL: config.model }
    : { HOUSEMATES_DIALOGUE_PROVIDER: config.provider, HOUSEMATES_DIALOGUE_OLLAMA_URL: config.baseUrl, HOUSEMATES_DIALOGUE_OLLAMA_MODEL: config.model });
  if (!safeConfig) return respond(503, { error: "unconfigured" });
  const provider = safeConfig.provider === "openai" ? "openai" : "ollama";
  const providerTimeout = safeConfig.provider === "openai" ? OPENAI_TIMEOUT_MS : OLLAMA_TIMEOUT_MS;
  let attemptedProvider = false;
  let upstreamStatus: number | null = null;
  activeRequests++;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const disconnected = () => controller.abort();
  request.signal.addEventListener("abort", disconnected, { once: true });
  if (request.signal.aborted) controller.abort();
  try {
    const operation = async () => {
      const raw = await readJson(request, REQUEST_BYTES, controller.signal);
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).join(",") !== "text") throw new DialogueFailure(400, "invalid-request");
      const text = (raw as { text?: unknown }).text;
      if (typeof text !== "string" || !text.trim() || text.length > 1200) throw new DialogueFailure(400, "invalid-request");
      const assessment = assessDialogueRequest(text);
      if ("clarification" in assessment) return respond(200, { suggestion: assessment.clarification, source: "local-guard" });
      if (controller.signal.aborted) throw new DialogueFailure(504, "provider-timeout");
      const endpoint = safeConfig.provider === "openai" ? "https://api.openai.com/v1/responses" : `${safeConfig.baseUrl}/api/chat`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (safeConfig.provider === "openai") headers.Authorization = `Bearer ${safeConfig.apiKey}`;
      const body = safeConfig.provider === "openai" ? {
        model: safeConfig.model, store: false, stream: false, max_output_tokens: 1024,
        // This configured model supports none; the tiny classification task needs no reasoning budget.
        ...(safeConfig.model === "gpt-6-luna" ? { reasoning: { effort: "none" } } : {}),
        instructions: `${instructions} Return only a JSON object with a suggestion property conforming to the provided schema.`,
        input: [{ role: "user", content: text }],
        text: { format: { type: "json_schema", name: "housemates_dialogue", strict: true, schema: openAiSchema } },
      } : {
        model: safeConfig.model, stream: false, format: schema, options: { temperature: 0, num_predict: 96 }, messages: [
          { role: "system", content: `${instructions} Return only JSON conforming to this schema: ${JSON.stringify(schema)}.` },
          { role: "user", content: text },
        ],
      };
      const reservation = await reservePublicAiQuota(request, quota, controller.signal);
      if (!reservation.ok) return respond(reservation.status, { error: reservation.error });
      if (controller.signal.aborted) throw new DialogueFailure(504, "provider-timeout");
      attemptedProvider = true;
      const response = await fetcher(endpoint, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers, body: JSON.stringify(body),
      });
      upstreamStatus = response.status;
      if (!response.ok) {
        let errorPayload: unknown = null;
        try { errorPayload = await readJson(response, ERROR_RESPONSE_BYTES, controller.signal); }
        catch { /* Classification remains status-only when the bounded error body is unusable. */ }
        throw new DialogueFailure(502, upstreamFailureCode(response.status, errorPayload));
      }
      let output: unknown;
      try { output = await readJson(response, RESPONSE_BYTES, controller.signal); }
      catch { throw new DialogueFailure(502, "invalid-provider-response"); }
      const parsed = parseProviderOutput(output, provider);
      const suggestion = parseDialogueSuggestion(parsed);
      if (!suggestion || !suggestionMatchesRequest(suggestion, assessment)) throw new DialogueFailure(502, "invalid-provider-response");
      return respond(200, { suggestion, source: provider });
    };
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new DialogueFailure(504, "provider-timeout")); controller.abort(); }, typeof timeoutMs === "number" && Number.isFinite(timeoutMs) ? Math.max(1, Math.min(timeoutMs, providerTimeout)) : providerTimeout);
    });
    return await Promise.race([operation(), deadline]);
  } catch (error) {
    const failure = error instanceof DialogueFailure ? error : new DialogueFailure(502, "provider-unavailable");
    // Only application-owned enums and a numeric HTTP status are logged. Never provider text, IDs,
    // prompts, keys, URLs, request bodies, response bodies or reasoning/output content.
    if (attemptedProvider) console.warn(`housemates:dialogue ${JSON.stringify({ provider, status: upstreamStatus, error: failure.code })}`);
    return respond(failure.status, { error: failure.code });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
    request.signal.removeEventListener("abort", disconnected);
    activeRequests--;
  }
}
