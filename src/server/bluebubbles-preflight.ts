import { readBridgeConfig, type BridgeConfig } from "./imessage-bridge";
import { isSameOrigin } from "./request-origin";

export type BlueBubblesPreflight = {
  status: "unconfigured" | "reachable" | "unavailable";
  message: string;
};

type Dependencies = { fetcher?: typeof fetch; timeoutMs?: number };
const MAX_RESPONSE_BYTES = 4096;
const unavailable = (): BlueBubblesPreflight => ({
  status: "unavailable",
  message: "The bridge check did not succeed. Check the private server settings and try again. No message was sent.",
});

/** Authenticated ping only: never requests chats, history, contacts, or message delivery. */
export async function checkBlueBubbles(
  config: BridgeConfig | null,
  { fetcher = fetch, timeoutMs = 5000 }: Dependencies = {},
): Promise<BlueBubblesPreflight> {
  if (!config) return {
    status: "unconfigured",
    message: "The messaging bridge is not configured. In-app chat remains available.",
  };

  const abort = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abort.abort(); reject(new Error("Preflight timed out")); }, timeoutMs);
    });
    const probe = async (): Promise<BlueBubblesPreflight> => {
      const url = new URL("/api/v1/ping", config.url);
      url.searchParams.set("password", config.password);
      const response = await fetcher(url, {
        method: "GET", redirect: "error", cache: "no-store", signal: abort.signal,
        headers: { Accept: "application/json" },
      });
      // Error bodies may contain credentials or personal data. Never parse or return them.
      if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !response.body) {
        void response.body?.cancel().catch(() => {});
        return unavailable();
      }
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) return unavailable();
        chunks.push(chunk.value);
      }
      const payload: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("status" in payload) || payload.status !== 200) return unavailable();
      return {
        status: "reachable",
        message: "The bridge accepted an authenticated ping. Phone pairing and message delivery have not been checked. No message was sent.",
      };
    };
    return await Promise.race([probe(), deadline]);
  } catch {
    // Never expose provider responses, URLs, addresses, credentials, or fetch exception text.
    return unavailable();
  } finally {
    clearTimeout(timer);
    abort.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}

/** GET is configuration-only. A same-origin POST explicitly opts into a provider ping. */
export async function handleBlueBubblesPreflight(
  request: Request,
  env: Readonly<Record<string, string | undefined>>,
  dependencies: Dependencies = {},
): Promise<Response> {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405, headers: { ...headers, Allow: "GET, POST" } });
  }
  if (request.method === "POST" && !isSameOrigin(request)) {
    return Response.json({ error: "Same-origin browser request required." }, { status: 403, headers });
  }
  const config = readBridgeConfig(env);
  if (request.method === "GET") return Response.json({ configured: !!config }, { headers });
  return Response.json(await checkBlueBubbles(config, dependencies), { headers });
}
