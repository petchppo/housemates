# Character dialogue in your home

`/demo/home` now uses the existing character conversation and **Send** button for AI-written replies. Evie, Bubbles, Chill and the seven expanded-party characters have distinct authored personalities, with original portraits and the existing household scene. There is no separate “Ask AI” action in this flow. Chat options contain optional history, planner details and browser voice; plan review appears only when a proposal exists.

Each explicit send runs the deterministic local command engine first. If OpenAI is configured, the character endpoint then generates a short natural-language reply using the selected persona, the user's message, the exact local planner reply and at most six ephemeral user/assistant turns for that character. The existing planner still owns all figures, deadlines, constraints, proposals and approval. The AI reply never becomes a command. Exact local replies remain in Planner details; only explicit approval starts a simulation.

The UI distinguishes authored local replies, thinking, AI dialogue and local fallback. It discloses text processing and possible API charges before sending. Conversation is not persisted. The core home conversation preserves separate character histories across selection changes and serializes web, reviewed voice and paired-phone turns. Household/planning execution changes, hiding the page and unmounting invalidate pending work. Expanded-party dialogue remains separate and cancels when its panel closes. No automatic retries run. Photo data, microphone audio, raw household profiles and credentials are never included; a reviewed voice transcript is text and uses the same disclosed Send path. Browser speech retains its separate opt-in processing disclosure.

The older `/judge-demo` objective classifier remains an isolated diagnostic workbench. Its bounded objective-only vocabulary does not restrict home character conversation. Ollama remains supported only in that older workbench; the new home character endpoint uses explicitly configured OpenAI, with deterministic local fallback when unavailable.

## Character request and response boundaries

`GET /api/character-dialogue` reports configuration without inference. Same-origin `POST` accepts exactly `{character,text,plannerReply,history}`: a catalog ID, user text up to 1,200 characters, local planner reply up to 6,000 characters and at most six `{role,text}` turns of up to 600 characters. The request is byte-bounded to 49,152 bytes. Successful output is exactly `{source:"openai",reply:string}`; strict structured output and a runtime guard bound the prose to 600 characters and three sentences. A validated reply is still model-generated conversation, not authoritative telemetry or a planning result.

All ten personas reuse catalog names/roles. Evie is an eager early bird, Bubbles a playful cleanup companion, Chill a calm comfort advocate, Spin organized and upbeat, Tumble patient and cozy, Ember hospitable, Misty dry-witted, Rover curious, Frost dependable and Breeze easygoing. Protected cooling, refrigeration and water heating stay protected; Breeze's routine remains fixed.

The output guard rejects quantities, invented numeric amounts, direct execution/completion/approval claims, protected-device shutdown advice, unsafe markup and links. These lexical checks are defense in depth, not a proof of every possible sentence's meaning. Model mistakes fall back to the actual planner reply; generated prose can never mutate state, approve a run or call a device tool. Both sides revalidate output. Server timeout is 20 seconds, client timeout 25 seconds, output cap 1,024 tokens and concurrency two. The selected exact `gpt-6-luna` uses `reasoning.effort:none`; other model IDs do not inherit that setting.

## OpenAI setup

1. Create a project API key privately in the OpenAI dashboard, following the [official API quickstart](https://developers.openai.com/api/docs/quickstart). Keep the key out of chat, screenshots, client code and Git. The configured API project must have access to the chosen model and sufficient API billing/quota.
2. Add these **server-only** settings to the project's ignored `.env.local`. Replace the key placeholder privately; do not copy a real key into documentation:

```dotenv
HOUSEMATES_DIALOGUE_PROVIDER=openai
OPENAI_API_KEY=<your private project API key>
HOUSEMATES_DIALOGUE_OPENAI_MODEL=<your-supported-model-id>
```

3. Reopen `/demo/home` after saving configuration. The development server may reload the environment automatically; check status first and coordinate a restart only if needed. If no server is running, start it with `npm run dev`.
4. `GET /api/character-dialogue` is a configuration check only. In the home, enter a greeting or planning request in the existing character composer and choose **Send** after reading its processing/charges disclosure. When configured, this intentionally requests an AI character reply.
5. Read the character reply. For a supported planning request, inspect the local proposal and its computed totals/timing. Only the explicit plan approval control can start the simulated run; ordinary conversation never does.

Replace the model placeholder with a currently supported model available to your API project that supports **Responses and Structured Outputs**. There is no implicit default model; saving a name does not establish account access or compatibility with this adapter's 20-second OpenAI timeout and 1,024-output-token cap. This adapter uses the fixed OpenAI Responses endpoint with a strict JSON-schema response, then independently checks the character reply contract; the older workbench also checks the admitted objective. [OpenAI's Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs) describes the response format and refusal/incomplete-response cases. Verify current model status rather than copying an old model ID from a tutorial.

**Provider selection is explicit:** an `OPENAI_API_KEY` alone never activates OpenAI. Selecting `HOUSEMATES_DIALOGUE_PROVIDER=openai` with a missing or malformed key/model setting returns unconfigured; it never silently switches to Ollama or another provider. Configuration checks do not authenticate a key: a revoked key, unavailable model or insufficient API quota can still fail at request time. Keep every setting server-only; never add `NEXT_PUBLIC_` to a key variable. Housemates does not create API accounts, purchase credits or install a model for you.

The application requests `store:false` and does not persist these prompts or replies itself. This is **not** a zero-retention promise: OpenAI processing and applicable provider retention controls still apply. See the [official API data controls](https://developers.openai.com/api/docs/guides/your-data). No photos, microphone audio, saved household memory or appliance-control credentials are part of this text suggestion request.

## Diagnosing an optional AI failure

Earlier workbench investigation: the original generic failure did not preserve the upstream error body, so its cause is not established. A subsequent read-only `GET /v1/models/gpt-6-luna` returned HTTP 200: that confirms the configured key could see that model at the time, not that a Responses request completed, that quota was sufficient, or that the original request settings were accepted. That earlier investigation made no paid inference retry. The later home-character live checks are recorded below.

On your next intentional **Send** in the home (or **Ask optional AI** in the older workbench), the UI translates a fixed application error code into a specific explanation. No retry runs automatically. The local planner stays available, and a failed AI request never creates or approves a proposal.

| Application code | Classification | Next check |
| --- | --- | --- |
| `provider-authentication` | Provider returned HTTP 401. | Check the private server API key and whether it was revoked. |
| `provider-access-denied` | Provider returned HTTP 403. | Check API project/key access and provider restrictions. This category alone does not prove which permission failed. |
| `provider-credit-balance` | HTTP 429 with `credit_balance_exhausted`. | Check API prepaid credit balance. |
| `provider-spend-limit` | HTTP 429 with `organization_spend_limit_exceeded` or `project_spend_limit_exceeded`. | Check the relevant organization/project spending limit. |
| `provider-usage-limit` | HTTP 429 with `organization_usage_limit_exceeded`. | Check the organization's approved usage allowance. |
| `provider-quota` | HTTP 429 with provider code or type `insufficient_quota`. | Check API billing and quota. |
| `provider-rate-limit` | HTTP 429 with `rate_limit_exceeded`, `slow_down`, or type `rate_limit_error`. | Wait before another intentional attempt; inspect provider rate limits. |
| `provider-limit-unknown` | Other HTTP 429, including an unreadable error body. | Check billing, usage and rate limits; temporary throttling is not established. |
| `provider-request-rejected` | HTTP 400, 404 or 422. | Check the configured model and request compatibility. This category does not identify the rejected parameter. |
| `provider-token-limit` | Response is incomplete because of `max_output_tokens`. | The bounded response did not finish; no partial suggestion is used. Review the model's output/reasoning needs rather than repeatedly clicking. |
| `provider-refused` | Explicit refusal or incomplete output marked `content_filter`. | Revise the request or use the local planner. Refusal text is not rendered. |
| `provider-timeout` | The operation exceeded its deadline. | Check provider availability and latency. OpenAI is bounded to 20 seconds; Ollama to eight. |
| `invalid-provider-response` | Output failed parsing, schema, message-shape or objective-consistency checks. | Inspect the fixed diagnostic category; arbitrary model text and altered objectives are never accepted as a fallback. |
| `provider-unavailable` | Network failure or other upstream failure. | Check provider/network availability. |

Provider failures return application HTTP 502 with the fixed code above, except `provider-timeout`, which returns 504. Local setup/concurrency/origin failures remain separate: `unconfigured` (503), `assistant-busy` (429), and `same-origin-required` (403). The browser renders application-authored explanations, never raw upstream error messages.

For configured `gpt-6-luna` **only**, the adapter now sends `reasoning: { effort: "none" }` for this small classification task. The [official GPT-6 Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna) documents support for `none`. Other model IDs receive no new reasoning override. The 1,024-output-token cap and 20-second OpenAI deadline remain unchanged. This is a compatibility adjustment, not proof that reasoning caused the original failure.

Failed provider attempts write one serialized string with prefix `housemates:character-dialogue` (home) or `housemates:dialogue` (workbench) and JSON fields `{provider, status, error}`: a fixed provider enum, numeric upstream HTTP status (or `null` when none arrived), and a fixed application error code. Rejected home character prose additionally records a fixed rejectionReason category (format, quantity, sentence-count, privacy-or-certainty, action-claim or device-state), never the rejected text. Serialization preserves these fields in Next's development log, which collapsed the earlier object argument to `{}`. Upstream error bodies are read only within a 4,096-byte limit to classify failures. Logs and browser responses exclude keys, authorization headers, prompts, URLs, request/response IDs, raw provider messages, model output and reasoning content. Malformed or oversized error bodies fall back to status-only classification. Never paste a private key or raw upstream response into chat while diagnosing a failure.

The user's first retry displayed the earlier `provider-rate-limit` message, confirming an upstream HTTP 429 but not whether it represented credits, spending, quota or temporary throttling. The mapping above follows the current [OpenAI error-code guide](https://developers.openai.com/api/docs/guides/error-codes); billing and quota errors cannot be resolved merely by retrying. No new inference request was made by this session to resolve that historical ambiguity.

## Optional local Ollama setup

The operator must separately provide a running **local-only Ollama daemon** and an already installed local model. Housemates does not download models, change daemon settings, install services or configure accounts. Configure Ollama to disallow cloud execution (for example its [documented `OLLAMA_NO_CLOUD=1` setting](https://docs.ollama.com/faq#how-do-i-disable-ollamas-cloud-features)) before enabling this integration. A loopback address proves only where Housemates sends its request; it cannot attest to a daemon's internal network behavior.

Set these server-only values privately in the ignored root `.env.local`:

```dotenv
HOUSEMATES_DIALOGUE_PROVIDER=ollama
HOUSEMATES_DIALOGUE_OLLAMA_URL=http://127.0.0.1:11434
HOUSEMATES_DIALOGUE_OLLAMA_MODEL=<an already installed local model name>
```

No default model is downloaded or selected. Only numeric loopback `127.0.0.1` and `[::1]` HTTP base URLs are accepted; credentials, paths, query parameters, remote hosts and model names containing `cloud` are rejected. Keep variables server-only, without `NEXT_PUBLIC_`. Environment changes require the operator to arrange a development-server restart; this work does not stop a healthy server.

The request uses Ollama's [documented structured-output chat interface](https://docs.ollama.com/capabilities/structured-outputs): non-streaming `/api/chat`, JSON schema `format`, and a bounded generated output. No actual inference or model installation was performed during fixture testing.

## HTTP and shared contract

- `GET /api/dialogue` returns only `{status:"configured"}` or `{status:"unconfigured"}`. Configured means settings pass validation, **not** that a provider handshake succeeded.
- Same-origin `POST /api/dialogue` accepts exactly `{text:string}` with 1–1,200 characters and at most 4,096 body bytes. Origin validation uses the actual Host header and request protocol because Next's internal request URL may contain its bind address. Forwarded host/protocol headers are not trusted, and another loopback hostname or port is not automatically accepted.
- Valid provider output returns `{suggestion,source:"openai"}` or `{suggestion,source:"ollama"}`. Local admission refusals return `{suggestion,source:"local-guard"}` without a provider request. The source label must remain visible in any future UI.
- Suggestions are strictly `{kind:"plan",mode:"cost"|"carbon"|"balanced"}`, `{kind:"clarify",reason:...}`, or `{kind:"explain",topic:...}`. No arbitrary prose, amounts, schedules, power, tool calls or execution commands are accepted. Model output must also agree with the admitted request's objective/explanation; schema validity alone is insufficient.
- Errors are bounded sanitized codes. The adapter limits concurrent requests to two and response bodies to 16,384 bytes. The whole operation, including body consumption, is limited to 20 seconds for OpenAI and eight seconds for Ollama. OpenAI output is capped at 1,024 tokens; interrupted, refused or incomplete output is not accepted as a suggestion. It rejects redirects and uses `no-store` responses. No request transcripts are persisted or logged by this code.
- Missing configuration returns `503 unconfigured` without network access. Existing deterministic commands are the fallback; no model output is simulated.

`src/domain/dialogue-contract.ts` exports `DialogueSuggestion`, `parseDialogueSuggestion`, `suggestionCommand`, `dialogueSuggestionText`, input admission and semantic-consistency checks. `suggestionCommand` returns an existing canonical planning command only for a plan suggestion; explanation/clarification yields `null`. All explanation text is application-authored. Numeric plan figures must continue to come from validated scheduler results.

This endpoint is for the local/private prototype. Same-origin checks are not user authentication, and its process-local concurrency bound is not a distributed quota. Do not publish it as an unauthenticated public inference proxy.

## Integration handoff

The existing `useDemoCommands.send` is synchronous and supplies replies to the iMessage bridge. It remains unchanged; the home UI layers character conversation around its returned local reply. The new `useJudgeDialogue` requests an **optional asynchronous suggestion** in `/judge-demo`; it binds results to the selected appliance/context/proposal revision, shows suggestions for review and invalidates stale results on subsequent requests, context changes, hiding and unmount. The workbench also clears suggestions on edits and reset. Only a reviewed canonical command reaches the existing domain command gate. Only that gate's explicit current-proposal approval starts a simulated run. The workbench is session-only and does not use saved household memory.

Paired iMessage uses the same core home conversation dispatcher as typed and reviewed voice sends. It invokes the browser planner once, generates at most one character reply and returns that exact displayed reply to the transport. Completed web turns are offered to the existing transport, which mirrors only turns completed after pairing and suppresses phone echoes. The model cannot approve execution; the browser planner remains authoritative. External speech can later produce an editable transcript for the same reviewed path; this slice adds no external voice provider. The legacy `/household` judge composer remains a labeled placeholder until its owner wires a reviewed integration.

## Verification boundaries

Automated tests use the actual contract and HTTP adapter with mocked transport. They cover fabricated output, wrong objectives, constraint loss, malicious/oversized bodies, same-origin checks, sanitized failures, unavailable configuration, stalled bodies/fetches, cancellation and concurrency. Automated provider verification uses fixture Responses envelopes, never a real key or billable request. These automated tests do not establish live provider behavior. Separate user-authorized home-character checks succeeded for Evie in the actual composer and Bubbles through the local endpoint. The initial six-request budget was exhausted with final planning/refusal checks rejected by the application guard after upstream HTTP200. Their raw wording was not retained, so their exact rejection cause remains unknown. After the guard repair, the user explicitly authorized two additional web-chat tests and delivery to the paired phone. Both succeeded: Evie answered the actual cheaper-plan/deadline request, then gave an early-bird/road-trip personality follow-up. The transport accepted both mirrored web turns. A user-originated phone planning request also appeared in the shared website log with an AI reply. External voice and every-character live coverage remain unverified.

Scoped verification includes isolated TypeScript compilation into `/private/tmp/housemates-dialogue-tests` and ESLint for the new source/test files. Independent core review found no numeric/approval/constraint-loss bypass. Integration caught two framework issues: Cache Components forbids an explicit `runtime` route export, and Next's internal URL host differed from the browser host. The route now uses the default runtime and waits for `connection()` before reading status configuration; shared strict Host-based origin validation repairs local browser requests. Regression tests cover both cases. Combined application gates and rendered workbench acceptance belong to the integration checkpoint.
