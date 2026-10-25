# iMessage pipeline

The optional Messages card in `/demo/home` connects an existing household to a **user-managed BlueBubbles Mac bridge**. It is disabled until that service is configured. The current local bridge was configured by its owner; live pairing and bidirectional replies were verified on October 24, 2026, including user-confirmed phone receipt. No public deployment is implied.

The implementation includes an authenticated webhook, phone-to-browser pairing, an expiring request mailbox, foreground browser consumption, and reply delivery through BlueBubbles. Its asynchronous `onCommand` contract accepts the shared web conversation dispatcher, including AI reply text and source. The dispatcher owns persona, history and validated planner results; transport does not invoke another model. See IMESSAGE-CHAT-HANDOFF.md for the active web-controller wiring handoff. There is no second server-side household model that could silently disagree with the dashboard.

## Why a Mac bridge

Apple's [Messages framework](https://developer.apple.com/documentation/messages) supports native iOS app extensions. It is not a generic web bot API. The official [Messages for Business](https://register.apple.com/messages) channel is intended for qualified businesses using a messaging service provider; it needs separate business/provider onboarding.

For a local prototype, [BlueBubbles REST and webhooks](https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks) supply a concrete Mac-to-iMessage transport. Its [webhook setup guide](https://docs.bluebubbles.app/server/developer-guides/simple-web-server-for-webhooks) explains registration. Housemates uses plain-text AppleScript mode only; it does not require BlueBubbles Private API features or changes to macOS system protections.

## Setup prerequisites

1. A Mac running a maintained BlueBubbles server, configured by its owner and signed into a **dedicated bridge iMessage identity**. The user's sending phone must be a different sender identity: same-account/self-sent messages are deliberately ignored. BlueBubbles may require macOS permissions to access Messages; Housemates does not grant those permissions, read Messages databases, or install the server for you.
2. The server's base URL and password. Local loopback HTTP is supported; a remote URL must use HTTPS. Keep this bridge private; the prototype is not a public multi-tenant messaging service.
3. A single allowed phone number in E.164 format (`+15551234567`) or Apple-account email, plus the distinct bridge recipient number/email the phone will message.
4. One running Housemates Node process. Ephemeral sessions are not shared across processes/serverless instances. Verified pairing is remembered across refreshes and Node restarts; temporary message queues are not. For a deployed service, replace this mailbox with authenticated accounts and a durable shared queue before scaling it.

Create the following **server-only** settings in an ignored `.env.local`; use actual values privately, never commit them or put them in `NEXT_PUBLIC_` variables:

```dotenv
HOUSEMATES_IMESSAGE_URL=http://127.0.0.1:1234
HOUSEMATES_IMESSAGE_PASSWORD=<your BlueBubbles server password>
HOUSEMATES_IMESSAGE_WEBHOOK_SECRET=<independent random secret, at least 32 characters>
HOUSEMATES_IMESSAGE_ALLOWED_SENDER=<your phone number or iMessage email>
HOUSEMATES_IMESSAGE_RECIPIENT=<the distinct bridge iMessage identity>
```

Restart the Next server after configuration. In BlueBubbles **API & Webhooks → Add Webhook**, register **New Message** at:

```text
http://127.0.0.1:3000/api/imessage?key=<HOUSEMATES_IMESSAGE_WEBHOOK_SECRET>
```

Loopback works when both services run on the same Mac. If separated, use a private HTTPS endpoint that BlueBubbles can reach. The webhook key is a bearer secret because BlueBubbles's documented webhook configuration supplies a URL rather than a signed-body contract. Do not paste the URL into public logs; redact query strings in access logs. No signature verification is claimed. Sending API credentials stay on the Housemates server.

The repository does not need an additional MCP to make these HTTP calls. The missing prerequisites are the owner-configured Mac service, distinct iMessage identity and credentials. The in-app deterministic chat remains fully functional without them.

## Use

1. Open `/demo/home` with a completed household. Choose **Pair my iPhone**.
2. From the configured phone sender, send the displayed `PAIR ...` code to the displayed bridge recipient. The single-use code expires after five minutes. It proves the phone identity and saves a remembered binding for this browser and reviewed household. You only need this code for initial pairing or after explicitly forgetting the phone/configuration changes. A new tab or reload becomes the active conversation; the older tab stops syncing.
3. Keep the household tab open and visible. Send commands such as:

```text
hi
lmao
Find a cheaper plan
Hey Bubbles, don’t run the dishwasher after 10 PM
Chill: Status
```

4. The browser imports each request into its existing conversation, computes a validated projection and sends that exact reply back. Requests for an unrecruited appliance get a clear explanation. **Review and approve the proposal in the web demo**. A text saying `approve` does not start execution.
5. Ask `Evie: Status` for the current approved simulated progress. Completion and estimates remain synthetic; no household device receives a command. Background push notifications and automatic completion messages to iMessage are not implemented.

No character name or command prefix is required. Plain messages use Evie on a new pairing or restored session, then the last explicitly addressed teammate or successfully mirrored web teammate. To switch, optionally use a greeting such as `Hey Bubbles, how are you?`, a name with a comma, or the older `Evie:` / `Bubbles:` / `Chill:` format. Ordinary colon sentences such as `Question: why?` pass through unchanged. An explicit address to an unsupported catalog teammate is ignored with a private diagnostic rather than silently retargeted. Casual mentions elsewhere do not switch the conversation. Photo attachments, SMS, groups, self-sent messages, other senders, non-message events and old/future-dated events are ignored. Apple and the bridge process these texts; do not describe external messaging as on-device-only.

## Transport and security contract

- `GET /api/imessage` exposes only availability/status, never credentials or sender identity. Configured means settings are present, not that a live provider handshake was verified.
- Same-origin `POST {action:"pair",contextKey}` creates an unpredictable browser bearer capability and random pairing code. It grants no phone messages until the configured sender proves control with that code. Session creation is bounded to 16 pending/active sessions; pairing attempts are bounded. This endpoint has no account login and is appropriate only for the local/private prototype.
- Browser `poll`, `reply`, `publish`, `dismiss` and `detach` use a temporary bearer capability and matching Origin. The temporary capability stays in memory, not localStorage or URLs. Remembered identity uses an HttpOnly, SameSite=Strict cookie, Secure on HTTPS, with a renewable one-year lifetime. `resume` requires that cookie and the matching household context. `remember` requires a phone-proven temporary capability. `disconnect` revokes remembered identity and clears the cookie; `detach` only releases the current temporary connection.
- Webhook requests require the independent secret, current timestamp, expected sender and matching one-to-one iMessage chat. Event GUIDs deduplicate ingress; replay records are kept for the two-hour session horizon. Queues hold at most 20 messages, each expiring after five minutes. Reply destinations come only from the paired verified chat, never from a browser-supplied recipient.
- The browser marks a command consumed **before** running the planner. A failed reply never re-runs the command. The server attempts one outbound reply per request, with a stable `tempGuid`; uncertain transport results are not automatically retried because delivery may already have occurred.
- Hiding the page stops importing commands. In-flight results are guarded on hide, household change and unmount. Disconnect explicitly forgets the binding. Expired temporary access is recovered automatically after a successful remembered resume; an immediately failing replacement is not retried in a loop. Server restart can restore the binding but not old queued commands. Temporary RAM holds necessary message/capability data; no chat/audio/photo persistence is introduced. Bridge/Apple services have their own retention.
- Outbound fields `message`, `chatGuid`, `tempGuid`, and `method: "apple-script"` are verified against the [upstream message validator](https://github.com/BlueBubblesApp/bluebubbles-server/blob/master/packages/server/src/server/api/http/api/v1/validators/messageValidator.ts). Incoming `dateCreated` is Unix milliseconds as emitted by the [upstream serializer](https://github.com/BlueBubblesApp/bluebubbles-server/blob/master/packages/server/src/server/api/serializers/MessageSerializer.ts). Redirects are rejected to avoid forwarding credentials; the transport has a bounded timeout.

## Verification and limitations

Twelve new automated regressions exercise the actual server/client sources: unavailable configuration, origin/token/webhook checks, sender/chat/time/schema rejection, pairing/expiry/revocation, request replay, existing-planner proposals, explicit approval boundaries, delivery uncertainty, outbound schema, hidden/in-flight cleanup, duplicate client consumption and expired UI state. Network transport is mocked; no real iMessage has been sent. The actual browser displays **Not connected** when the service is absent.

For a public product, use a supported business messaging provider or separately reviewed native integration, authenticated household membership, durable revocation/deduplication, shared storage, delivery reconciliation and monitored operations. Those requirements are not hidden behind a simulated connected state here.

### Connection recovery diagnostics

Browser bridge actions have a 20-second deadline covering response headers and body. A stalled poll releases the polling loop and retries on a later interval while visible. A stalled reply is never automatically resent or applied to the planner twice. The Link panel reports interrupted polling and recovery, plus private session-scoped timestamps for the last verified inbound request and bridge-accepted/unconfirmed reply. Bridge acceptance is not phone receipt. Unsupported prefixes are reported explicitly after a verified paired event; absent inbound diagnostics cannot distinguish an absent webhook from a rejected payload. Diagnostics contain no transcript, phone address, message ID or secret.

### Shared conversation transport

`MessagesConnection` awaits `onCommand(id,text,{signal,messageId})` for the exact website reply and its `openai`/`local` source. The shared controller bounds each model call, while transport allows queued work up to the verified message/session expiry; cancellation suppresses stale delivery, consumes the request once, and never invokes a second model. The callback must honor its signal and use the web controller’s own serialized context. Phone-origin turns are excluded from outbound mirroring to prevent echoes.

Completed new web turns can be supplied via `outboundTurns`; turns already present before phone proof are not replayed. Publishing sends one labeled transcript containing the website user text and exact response to the fixed paired chat. Phone replies contain the exact conversation body and a compact character signature. Local fallback is explicitly labeled; AI use is disclosed when pairing and in the web conversation. Website mirrors retain the user text and character reply without repeated technical banners or approval footers. These do not change the sender’s Apple identity or recipient contact name. Successful web publishing changes the default phone follow-up target unless a newer explicitly targeted phone event arrived meanwhile.

Publish requires the same origin and paired bearer capability, bounded safe IDs/text, explicit source, and no supplied recipient or extra fields. Combined reply/publish attempts are capped at 128 per pairing. Duplicate, concurrent and uncertain sends never trigger automatic resends. Short sessions, queues and conversation history remain temporary. Remembered phone authorization persists locally until disconnected, invalidated by configuration changes, or its renewable cookie lifetime ends. Both the foreground web app and configured Mac bridge must remain available; this is not a background standalone bot.

Transport waits for the phone turn to appear in the shared committed conversation before sending. It mirrors earlier web turns first and later turns afterward, preserving conversation order across React commits. A completed turn removed by context reset is dropped from the unsent queue. Source/history updates happen during layout commit so timer polling cannot use a stale committed snapshot.


## Remembered pairing storage and recovery

The local single-process server keeps only remembered binding metadata in ignored `.housemates/imessage-pairings.json`: a SHA-256 credential hash, household/context hash, bridge configuration fingerprint, verified chat destination and timestamps. It never stores the cookie credential itself, codes, message bodies, conversations, photos, microphone audio or provider keys. The directory is mode 0700 and the file is mode 0600; writes use atomic replacement. Invalid, corrupt or inaccessible storage fails closed with a fixed error. Clearing browser cookies or losing this file requires a fresh phone proof. Do not copy this private registry into Git or a public deployment.

Weather refreshes, synthetic weather experiments and planning-mode changes do not invalidate the remembered household. Different reviewed household settings remain isolated. Only one tab owns the current phone conversation: resuming in a newer tab replaces the old temporary capability, which receives a 409 and cannot automatically reclaim it. Replacement bookkeeping is bounded and fails closed at capacity. Re-pairing with phone proof revokes the previous remembered binding for that sender.

Remembered does not mean always-running: the Mac, BlueBubbles and Housemates must be running, and the household browser must remain open and visible for AI/planner replies. Closed/offline pages do not generate responses. Reopen the home, let it restore the phone, and send a fresh request; transcripts and old commands are not replayed after refresh/restart. Chat cannot approve a plan.

For short greetings, laughter and thanks, the model is prompted to respond conversationally rather than redirect to planning. If it fails validation or is unavailable, a narrowly matched, authored local character reply replaces the command-help wall. Mixed scheduling/approval requests retain the exact validated planner fallback. The model response guard and explicit browser approval are unchanged.
