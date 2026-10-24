# Judge demo and integration workflow

Open `/judge-demo` on the existing local development server. This new route isolates the dialogue and graph work from the onboarding, dashboard, Pip, chat, weather, recognition and scheduler files being edited by other sessions. It starts a synthetic Bangkok EV/dishwasher scenario; it never reads or writes household memory. Reload starts a fresh judge session.

## Short demonstration

1. Select **Use local planner** with `Find a cheaper plan`. The existing deterministic command engine calculates a proposal; execution remains idle.
2. Select **Try: dishes finished by 10 PM**. The graph recalculates all three objectives with this completion cutoff.
3. Select **Propose carbon-first**. Inspect the USD/ modeled kg CO₂e table and the current proposal's schedule. Bubbles still finishes at 22:00.
4. Type `approve` and submit. Execution remains idle. Use **Approve current proposal** to start the simulation, then **Advance simulation 1 hour** to advance its separate clock. Chart proposal actions are locked while an approved run exists.
5. **Reset judge session** clears this session only. Your saved household is untouched.
6. **Ask optional AI** displays a truthful unavailable message until configured. Choose OpenAI API or local Ollama as described below. With OpenAI selected, admitted text is sent to OpenAI and may incur API charges; the UI discloses this before the action. The result is a strictly validated objective suggestion or application-authored explanation, not broad free-form dialogue. **Use suggestion to create proposal** is distinct from approval.
7. **Check bridge reachability** performs only a configured BlueBubbles ping. It never pairs a phone or sends a message. Missing configuration is explicit.

All prices/grid intensities are authored synthetic scenarios. Carbon is modeled, not measured or necessarily avoided marginal emissions. Only EV and dishwasher flexible sessions enter this graph; Chill and other protected/background loads are excluded. Three objective recommendations are not a complete Pareto frontier. Coincident points remain coincident, with shared labels. Negative costs and signed increases are preserved.

## Enable the OpenAI option

Use the [official OpenAI API quickstart](https://developers.openai.com/api/docs/quickstart) to create a project API key privately. Add the following to the ignored project `.env.local`, replacing only the placeholder in that private file:

```dotenv
HOUSEMATES_DIALOGUE_PROVIDER=openai
OPENAI_API_KEY=<your private project API key>
HOUSEMATES_DIALOGUE_OPENAI_MODEL=<your-supported-model-id>
```

Use a currently supported model available to your API project with Responses and Structured Outputs support; the adapter does not choose a default. Keep the key out of chat, Git and all `NEXT_PUBLIC_` variables. Arrange a restart with the current development-server owner so the process reads the settings; if no server is running, use `npm run dev`. Then open `/judge-demo`. The configuration status check makes no inference request. Clicking **Ask optional AI** with an admitted objective-only request invokes the selected provider; choosing **Use local planner** does not.

An API key by itself does not activate OpenAI. Explicit OpenAI selection with missing configuration stays unavailable and never falls back to Ollama. Local Ollama remains an optional alternative; full settings, model compatibility, API data-processing boundaries and fixture/live verification limits are in `DIALOGUE.md`. `store:false` is used for OpenAI requests but does not promise zero provider retention.

## Ownership and workflow

The session used all four available slots: lead integration, dialogue specialist, BlueBubbles specialist, and graph specialist. Existing shared application files stayed with their other-session owners. No dependency was added.

- Dialogue owns the new suggestion contract, server adapter, `/api/dialogue`, shared strict request-origin helper, and focused tests. Configuration is in `DIALOGUE.md`. This first slice is deliberately objective-only; external voice, broad free-form dialogue and constraint interpretation are not implemented.
- BlueBubbles owns the new read-only preflight and `/api/imessage/preflight`, its tests and `BLUEBUBBLES-SETUP.md`. The existing messaging adapter and connection UI were not changed.
- Graph owns the new `buildPlanTradeoffs` helper, `CostCarbonTradeoff` component/CSS and its regression tests. It calls the existing scheduler without modifying it.
- Lead owns `/judge-demo`, `JudgeDemo`, `useJudgeDialogue`, this runbook and integrated acceptance. The messaging specialist independently added actual-hook/component regression coverage; the graph specialist independently viewed rendered screenshots.

Each lane follows implement → scoped tests → independent reproduction/review → repair → rerun. Lead performs combined gates and actual browser interaction; visual findings require fresh capture/review. Checkpoint only owned changes after their required underlying changes have been committed by their owners.

## Handoff to the main dashboard owner

`buildPlanTradeoffs({requests, energyProfile, sharedPowerLimitKw?})` returns baseline and three recomputed objective results. For a command session, pass `session.pending?.requests ?? session.approved?.requests ?? session.requests`, never the original scenario requests after negotiation. Pass the same validated energy profile and explicit shared cap used by the authoritative planner.

`CostCarbonTradeoff` takes `comparison`, `selectedMode`, `onPropose(mode)` and optional `disabled`. Wire selection to the existing proposal callback; disable it while an approved run exists. It has no approval callback or persistence.

`useJudgeDialogue(context)` returns a reviewable suggestion/status with explicit `request(text)` and `clear()` operations. Context must include household identity, proposal revision, approval state and target. Clear on edits/reset/any new proposal. It validates source labels and schema, aborts and invalidates late responses, and has no planner/approval callback. Keep `useDemoCommands.send` synchronous for existing messaging; do not replace it with an async model call. Review the suggestion, obtain `suggestionCommand`, then submit that canonical command through the existing engine.

The existing `imessage-bridge.ts` compares Origin with `request.url` directly. On this development server, Next exposes an internal bind hostname, so legitimate browser requests can fail that check. The new endpoints use `isSameOrigin(request)` to compare the actual Host and protocol without trusting forwarded headers. The messaging owner should apply and regression-test the same fix in its existing adapter; this session did not edit their files.

## Evidence and remaining setup

Actual browser testing covered cutoff negotiation across objectives, infeasibility disabling approval, typed approval refusal, explicit keyboard approval, manual execution advance, approved chart locking, reset and refresh isolation, and both real unconfigured service responses. Actual hook/component regressions cover stale proposals, changed contexts, hidden pages, cancellation, timeout, unmount, source labels and no household-storage access.

Independent screenshot review inspected 1280×900, 768×1024, 390×844, 320×740 and 844×390. Repairs addressed mobile SVG type, point-label collisions, axis spacing, section order and SVG-title hydration. No animation is introduced by the new workbench/chart. Physical phones, screen readers, microphones and configured-service execution were not verified.

OpenAI is supported as an explicitly selected provider, with local Ollama retained as an alternative. No live OpenAI/Ollama inference or BlueBubbles phone delivery was verified in this checkpoint. No model was installed, no machine permissions or messaging databases were accessed, and verification made no billable API call. `DIALOGUE.md` and `BLUEBUBBLES-SETUP.md` give the owner setup and live-test steps. Keep credentials in ignored server environment settings, never in chat or client bundles.

Before the OpenAI follow-up, combined checkpoint verification passed lint, full typecheck, 292 automated tests, production build and whitespace checks. The OpenAI follow-up's final gates and exact evidence are recorded separately in `PROGRESS.md`; the earlier test count does not certify later changes. The shared work remains uncommitted because the new preflight depends on the messaging owner’s uncommitted bridge module; no other session’s changes were staged.
