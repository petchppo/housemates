# Character dialogue integration handoff

Updated October 24, 2026. Shared workspace; read current files before patching. The user explicitly requested coordination with the other active agent. Cross-chat messaging tools are unavailable in this session, so this file is the shared handoff.

## Current user direction

The user wants AI-written character conversation inside the existing `/demo/home` Evie/other-appliance chat, not a separate Ask AI classifier. Latest UI correction: remove the extra preset and pagination buttons. The resulting chat has character + complete reply + message field + Send; native Chat options contains optional details/history/voice. Review plan appears only when a local proposal exists. Keep explicit approval and all deterministic scheduling constraints.

## Ownership and current state

This session owns the character integration below. UI source is frozen for final checks; backend reply-guard repair is in progress after live false-positive candidates. Please coordinate changes to these files through this handoff rather than overwriting them while final checks run:

- New backend/contract: `src/domain/character-dialogue.ts`, `src/data/character-personas.ts`, `src/server/character-dialogue.ts`, `src/server/dialogue-transport.ts`, `src/app/api/character-dialogue/route.ts`.
- New hook: `src/components/use-character-dialogue.ts` and its test.
- Existing UI integration: `src/components/appliance-chat.tsx/.css`, `src/components/applimon-team-panel.tsx/.css`, corresponding tests.
- Existing dashboard: only `send()` now returns the local reply, `dialogueContext` and expanded `active` props are passed, and scoped `.is-home` CSS makes the final dialogue grid row grow naturally. Preserve these alongside your other dashboard changes.
- Existing `src/server/dialogue-provider.ts` imports the extracted shared transport helpers; original objective-classifier behavior and diagnostics remain covered.
- Documentation: `DIALOGUE.md`, append-only `PROGRESS.md`, this handoff.

This session does not own scene/camera, onboarding, weather, recognition/OCR, catalog/scheduler implementation or existing iMessage behavior. Existing working changes remain unstaged. No local commit yet because the integration sits on other sessions' uncommitted dependencies; do not stage/reset/clean unrelated work.

## Shared API and component contract

`GET /api/character-dialogue` returns `{status:"configured"|"unconfigured"}` without inference. `POST` is same-origin and accepts exactly:

```ts
{
  character: ApplimonId, // all ten catalog characters
  text: string, // 1..1200 chars
  plannerReply: string, // 1..6000 chars, actual deterministic result
  history: { role: "user" | "assistant", text: string }[] // <=6 turns, <=600 chars each
}
```

Success is exactly `{source:"openai",reply:string}`. Errors contain only fixed application error codes. Reply is bounded to600 chars/3 sentences; guard rejects quantities, direct action/approval/telemetry claims, unsafe markup/URLs and known protected-device advice. These lexical guards are defense in depth, not semantic proof. Generated text cannot invoke planner state changes or approval. Exact local facts remain separately available.

`useCharacterDialogue(character, contextKey, active = true)` returns status/reply/loading/notice/history/request/clear. `request(text, plannerReply)` only executes after explicit sending; mounted GET is free configuration checking. History is ephemeral and per-character, no localStorage. Request generation guards reject stale results after new sends, context changes, reset, hidden page/panel and unmount. No automatic retries. Expanded panel's `active={panel === "team"}` cancels AI while preserving its existing simulation clock.

`ApplianceChat.onSend` may return a local reply string; the dashboard returns `commands.send(...)`. The controller itself remains synchronous and untouched so iMessage stays deterministic. The UI invokes local planner first, then character prose. Its expected-local-result tracking preserves its own new proposal while invalidating on external changes. Voice still requires reviewed transcript send; generated dialogue is not silently read aloud.

## Configuration, live requests and important bug repair

Existing ignored `.env.local` is configured for OpenAI and gpt-6-luna. Never print/read a key into tool output, put credentials in client code/Git, alter billing, or repeat account setup. Luna uses `reasoning.effort:none`, store:false, max1024 output tokens,20s server timeout,25s client deadline. Other configured model IDs receive no new reasoning override.

The user authorized **at most six live test requests for this integration**. Root alone executes/tracks them. **All SIX conservative root attempts are consumed. No further paid tests are authorized. Do not send live requests from another agent.** One attempt failed in local module loading before inference; one browser planning attempt overlapped active browser/hot reload and is conservatively counted. Evie's actual integrated Send and Bubbles' actual endpoint persona reply have succeeded. User's own manual interactions are separate; the browser is shared and the user is actively using it.

A real integration defect appeared when new exports were added to an already-loaded Turbopack module: `instanceof DialogueFailure` saw an undefined import. Helpers now live in fresh `dialogue-transport.ts`, directly imported by both adapters. Actual same-origin POST `{}` now returns400 `{error:"invalid-request"}` before inference. Do not reintroduce the old imports. No server restart/cache deletion was required.

## Verification and remaining work

- Earlier combined gate after character implementation: lint PASS, typecheck PASS, full suite422/422 PASS. This precedes latest removal of preset/pagination controls.
- Latest UI-owner isolated tests19/19 PASS + scoped lint; all ten character dispatch paths covered. Independent source reviewer accepted lifecycle/privacy and planner approval boundaries.
- Backend isolated45/45 PASS (new character + prior classifier contracts/providers), scoped lint and independent review PASS.
- Hook isolated7/7 PASS, actual lifecycle regressions including hidden modal, stale error bodies, no persistence and no automatic retry.
- Actual desktop1280x900, phone390x844, narrow320x740, landscape844x390 screenshots were independently viewed. Fixed clipped replies/invisible errors by ordinary page flow and intrinsic dock rows. All four passed before the newest button cleanup. Final cleanup screenshots still need recapture/review.
- Current user household only has Evie; do not silently recruit/change passports to get more screenshots. Expanded all-seven routing is fixture-tested; live expanded visual coverage remains limited.
- Root remaining: repair guard after the final Evie planning and Chill refusal tests returned upstream HTTP200 but application unsafe-character-reply; exact rejected wording is unknown because prose is not logged. Any further paid verification needs a new explicit exception. Then final cleaned UI screenshot/keyboard review, full combined gates/build, update PROGRESS and this handoff.
- Healthy localhost:3000 server preserved. No deployment, account purchase or unrelated Git changes.


## Shared iMessage wiring — active user request

Read IMESSAGE-CHAT-HANDOFF.md for the transport-owned contract. This session now also owns new use-household-conversation.ts/tests, controlled ApplianceChat rendering, dashboard dispatch and shared dashboard integration tests. Existing MessagesConnection, message-conversation.ts and bridge files remain transport-owned and untouched. One serialized core conversation will own canonical planner invocation, character history, exact reply and completed outbound turns. Selection preserves histories; household/context/visibility cancellation blocks stale work. No real Messages send or additional paid API test is being performed. Integration checks are pending.
