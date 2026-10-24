# BlueBubbles live setup and verification

Current status: no BlueBubbles server or credentials have been configured for this work. Automated checks use network fixtures. No real message delivery, phone pairing, or provider handshake has been verified. The existing in-app planner remains usable.

The read-only preflight endpoint checks configuration or performs one authenticated ping. It does not install a server, access message history, create pairing, send messages, or start a simulation.

## Owner setup

1. On the Mac that will host the bridge, the owner installs/configures BlueBubbles following its [official installation guidance](https://docs.bluebubbles.app/server/installation-guides). Use a dedicated bridge iMessage identity, different from the phone sender. The owner handles any required macOS access decisions; an agent must not grant system permissions, access personal Messages databases, or enable Private API features. Leave Private API disabled; this integration sends plain text with AppleScript mode.
2. Keep this a local/private, single-Node-process prototype. Loopback HTTP is supported on the same Mac; a remote bridge must use HTTPS. No public forwarding or cloud account is required for the same-Mac check.
3. Privately populate an ignored `.env.local` in the project root. Never paste actual credentials in chat or screenshots, commit them, or use `NEXT_PUBLIC_` names:

   ```dotenv
   HOUSEMATES_IMESSAGE_URL=http://127.0.0.1:1234
   HOUSEMATES_IMESSAGE_PASSWORD=<private server password>
   HOUSEMATES_IMESSAGE_WEBHOOK_SECRET=<independent random secret, 32–256 characters>
   HOUSEMATES_IMESSAGE_ALLOWED_SENDER=<phone E.164 number or Apple-account email>
   HOUSEMATES_IMESSAGE_RECIPIENT=<distinct bridge iMessage identity>
   ```

   The URL must be an origin only, with no path, query, username, or password. Sender and recipient must differ. Confirm `git check-ignore .env.local` reports that file. Next environment files expand `$` references; escape literal dollar signs in secret values as `\$`.
4. Arrange a controlled reload of the existing Next server so it reads the environment. Coordinate with agents using localhost:3000; do not kill a healthy shared preview without arranging the reload.
5. Before using real credentials, ensure provider/proxy/Next request logging does not retain query strings. BlueBubbles authenticates its ping/send URLs with a password parameter; its inbound webhook uses a bearer key in the URL. This endpoint emits no application logs and returns only static diagnostics, but cannot control infrastructure logs.

## Read-only checks

`GET /api/imessage/preflight` returns only `{ "configured": false }` or `{ "configured": true }` and makes **zero provider requests**. Configured means all required settings passed validation; it does not prove a connection.

To deliberately check connectivity, open a Housemates page on localhost:3000 and run this browser-console request, or use a future explicit UI check button:

```js
await fetch('/api/imessage/preflight', { method: 'POST' }).then(r => r.json())
```

The browser supplies its Origin. Cross-origin or missing-Origin POST requests return 403. No user-provided URL or credential is accepted. The server requests only `/api/v1/ping`, rejects redirects, limits the check to five seconds and the response body to 4 KiB, and returns:

| Status | Meaning |
| --- | --- |
| `unconfigured` | Required server configuration is absent or invalid; no provider request occurred. |
| `reachable` | The bridge accepted an authenticated ping. Phone pairing and message delivery are still unverified. |
| `unavailable` | Authentication, transport, timeout, or response validation failed. Check private setup locally; no provider error details are exposed. |

The diagnostic never returns provider URL, addresses, credentials, response bodies, or fetch error text. A reachable result is a point-in-time check, not continuous monitoring. Do not repeatedly poll this endpoint.

## Owner-assisted live message test

1. Open BlueBubbles Server → **API & Webhooks** → **Manage** → **Add Webhook**. Register only **New Message** events. Use the private webhook URL below, substituting the same secret value saved in ignored `.env.local`; do not send that value through chat. The endpoint is a POST receiver, so opening the URL in a browser is not a delivery test.

   Generate an independent 32-byte secret on your own Mac with `openssl rand -hex 32`, and save it as `HOUSEMATES_IMESSAGE_WEBHOOK_SECRET`. BlueBubbles and Housemates must use the identical value.

   For a same-Mac setup, the private webhook URL is `http://127.0.0.1:3000/api/imessage?key=<private webhook secret>`. Do not put this real URL in screenshots or logs. The webhook key is bearer authentication, not a signed-body claim.
2. Open `/demo/home` with a completed household and select **Pair my iPhone**. From the configured allowed sender, send the displayed `PAIR …` code to the dedicated bridge identity. Keep the household browser visible. No general message history needs to be read.
3. Send the dedicated test request `Evie: Find a cheaper plan`. Confirm it appears once in the browser, that its computed result matches the reply, and that the phone actually receives the reply. Record these as separate observations: paired, provider accepted reply, phone received reply. API success alone is not proof of phone delivery.
4. Send `Evie: approve` and verify no execution starts. Review the current feasible proposal in the browser; only its explicit approval control starts a simulated run. All results remain synthetic/model estimates, never physical-device execution.
5. Verify disconnect stops further request consumption; refresh requires fresh pairing; hidden tabs defer consumption; stale queued commands expire. Use fixtures for duplicate events and uncertain-send tests rather than replaying real messages. Never retry an ambiguous send automatically.
6. Record sanitized evidence and actual failures. If setup is unavailable, retain the unconfigured state and this explicit blocker. Do not mark live transport verified based on fixture tests or authenticated ping alone.

Reference: [BlueBubbles REST and webhooks](https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks). Existing transport/security behavior and process-local queue limitations are documented in [IMESSAGE.md](IMESSAGE.md).
