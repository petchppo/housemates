# Housemates progress

Updated: October 24, 2026 (America/Los_Angeles).

## Current status

**Phases 2–5 complete and verified locally.** All final acceptance criteria below have implementation and verification evidence. No blocking issues remain. No public deployment, remote push, paid API call, special documentation package, or device connection was performed.

Branch: `codex/housemates-mvp`.

## Git checkpoints

- `061cf28` — Initial Housemates foundation. Preserved ancestor; homepage, agent definitions, synthetic data, arithmetic, configuration and assets.
- `f3465c8` — Implement verified energy intelligence and mission contracts. Adds the scheduler/laboratory, energy regression coverage, shared state contract, and persistent mission documents. The previously verified engine was uncommitted when this mission began; it is now saved here.
- `9b8c4d9` — Complete household parliament memory and training MVP. Verified integrated Phases 3–5 code, persistence, progression, tests, and demo runbook.
- A documentation-only follow-up records this release hash; use `git log -1` for that final handoff commit.

## Completed phases

### Phase 2 — energy intelligence

Pure TypeScript evaluation and exhaustive hourly-start search over a 48-hour fictional horizon. EV defaults to 12 kWh, with configurable power/energy. Dishwasher duration/total consumption/hourly profile are configurable; complete cycle is continuous. Cost, carbon and normalized balanced objectives; fixed-start baseline comparisons; signed savings/carbon changes; optional explicit shared cap checked against actual per-hour phase power; structured reasons/assumptions. Chill excluded/protected.

Existing /energy-parliament remains a runnable laboratory. Data and arithmetic are reused, not duplicated. Internal carbon remains grams; interfaces display kilograms explicitly.

### Phase 3 — appliance conversation

New /household with deterministic structured intents and computed replies from Evie/Bubbles/Chill. Supports whole-hour deadlines, windows, objectives, revisions, rejection, explanations, explicit approval/save, and clear clarification for unsupported requests. Proposal fingerprints prevent stale approvals; saving reruns feasibility. Conversation never executes hardware commands or invents numeric savings.

### Phase 4 — memory and progression

Versioned and bounded local storage preserves preferences, settings, up to 12 saved input snapshots, recent conversation, XP/history. Restored inputs are validated and totals recomputed. Meaningful unique actions award 25 XP; levels at 0/50/100/175 XP unlock actual routine, tradeoff, and coordination shortcuts. Core optimizer always available. Chill’s shortcut explains comfort. Self-reports never become measured savings. Reset only affects Housemates data; failed reads/writes/erasure get truthful session-only notices.

### Phase 5 — integrated demo and polish

Preserved homepage links to /household and /energy-parliament. Four integrated panels: Parliament, The plan, Meet & train, Preferences. Shared timeline/table, editable appliance profiles, saved plans, accessible forms/dialog, keyboard send, visible focus, reduced-motion-aware progress animation, responsive layout, explicit synthetic/model labels. DEMO.md contains the verified 90-second script and recovery steps.

## Actual final verification

| Check | Result |
| --- | --- |
| `npm run lint` | PASS, no code warnings/errors |
| `npm run typecheck` | PASS; includes Next route type generation |
| `npm test` | PASS: 84/84 (33 energy, 28 conversation, 17 memory, 6 browser-store) |
| `npm run build` | PASS; `/`, `/energy-parliament`, `/household` generated successfully |
| `git diff --check` | PASS |
| Browser runtime error log | No errors observed |
| Desktop/browser viewport | 1280px, no horizontal overflow |
| Phone-sized browser viewport | 390px; chat, plan, crew and preferences no horizontal overflow |

The environment emits a nonblocking npm `http-proxy` configuration warning; this is not an application error. A Next.js smooth-scroll configuration warning encountered during navigation was repaired per bundled Next16 documentation (`data-scroll-behavior="smooth"`).

### Browser acceptance journey actually executed

1. Homepage → Enter Appliance Parliament.
2. Send the exact required morning request using Enter; inspect computed dialogue and proposal.
3. Send “I don't want the dishwasher running after 10 PM.” Bubbles moves to20–22; totals recompute.
4. Inspect original/proposed schedules, Day 2 timeline and 24 hourly rows.
5. Approve/save; verify one saved simulated plan and level 2 unlock.
6. Refresh; verify approval, conversation, Bubbles cutoff 22, saved plan, XP persist; no false new XP reward appears.
7. Use Bubbles’ remembered-routine shortcut; receive a fresh feasible plan respecting22.
8. Reject → no approval button; revise → new pending proposal.
9. Set Bubbles deadline 21 → explicit infeasibility, no approval or savings. Restore 22.
10. Set EV 3 kW, later deadline/window and dishwasher profile 0.9/0.3; inspect distinct computed cost/carbon options and select a new objective.
11. At 390px, check all four panels for overflow and usable controls.
12. Open Reset with keyboard; confirm focus lands on safe cancel button, Escape closes it. Confirm reset, refresh, verify initial four messages/no preferences/no saved plans.
13. Repeat the morning request/cutoff/approval and leave the browser in a working saved-demo state.

Snapshots produced locally: `/private/tmp/housemates-mvp-desktop.png`, `/private/tmp/housemates-mvp-mobile.png`. These are verification artifacts, not application assets or committed telemetry.

## Self-correcting swarm record

Actual native specialists were used, with disjoint file ownership:

- Energy engineer: energy/profile validation,10 new engine regressions; then independent adversarial review of conversation, memory, and UI.
- Conversation engineer: parser/orchestrator, 28 integration/regression tests; repaired reviewer findings and reran tests.
- Memory/progression engineer: validated storage, training, 17 tests; then frontend/UX review and 6 reproducible actual-source browser-store failure tests.
- Lead: shared contracts, UI/routes, integration, docs, local browser acceptance, final commands, and Git checkpoints.

All followed implement → verify → inspect → repair/regression → reverify → independent review → integrate → checkpoint → continue. No separate orchestration package was installed.

| Finding | Repair and verification |
| --- | --- |
| Fingerprints changed on object reconstruction | Canonical planning scalar fields; approved/pending restore regressions |
| Explicit day suffix ignored; latest-start became deadline | Bounded parser supports qualifier placement and distinct boundaries; tests + independent reproductions |
| Negated/unsupported instructions silently selected objectives | Clarification without state mutation; regression inputs for days, battery/energy/cycle quantities, conflicting modes |
| Saved-plan retention/ID overflow broke restoration | Consistent 12-plan bound, safe counters, regressions and reviewer replay |
| Household entry could omit an appliance | Require exactly Evie+Bubbles; preserve valid state and withdraw stale proposal; roundtrip regression |
| Nonuniform cycle used average power for shared cap | Per-interval power checks, zero-energy phases, midnight integration tests |
| Refresh looked like a new XP reward | Initialize previous XP only after ready; browser verified zero false announcements |
| Advertised skills had missing/mismatched actions | All three convenience levels linked; Chill shortcut invokes comfort explanation |
| Storage badge/reset overclaimed success | Save status only after write; removal-first reset with explicit failure notices; 6 reproducible tests |
| Capped chat stopped autoscrolling | Observe message reference instead of capped count |
| Reset/saved-plan actions lacked clarity | Named/described native dialog; explicit preference-replacement wording; keyboard and browser checks |
| Zero comparison was called a decrease | Explicit unchanged wording for zero |

Independent reviewers reported **no outstanding blocking findings**. The lead separately verified the UI and integrated checks; acceptance is not based only on agent claims.

## Acceptance ledger

- [x] Foundation remains functional; no recreation.
- [x] Real computed optimization, multi-hour/midnight correctness, invalid/infeasible handling, signed tradeoffs.
- [x] Evie/Bubbles conversation updates validated state and plans; Chill protected.
- [x] Users change constraints, inspect calculations, reject/revise, approve/save only current feasible proposals.
- [x] Preferences, settings, context, saved inputs and progress survive refresh.
- [x] Meaningful progression and usable shortcuts; core planner never gated.
- [x] Desktop and phone-sized UI verified; keyboard sending/reset checked.
- [x] Synthetic data and simulated activity consistently labeled; no device claim.
- [x] Automated checks and production build pass; local demo runs on 3000.
- [x] DEMO.md and persistent mission context completed; verified code saved in local commits on codex/housemates-mvp.

## Known limitations / honest scope

- Deterministic bounded English intent grammar, not an LLM or general language understanding. Whole-hour AM/PM times; unsupported instructions clarify. UI settings cover additional numeric controls.
- Continuous EV charging, hourly starts, per-hour dishwasher averages, 48 fictional hours, repeated synthetic rates. No thermal model, DST scenario, live tariff, other-home-load model, or physical device integration.
- Carbon is modeled average grid intensity, not measured or necessarily avoided marginal emissions; savings are estimates excluding fixed charges/taxes/losses.
- Browser-local memory only, with bounded history and 12 saved plans; no accounts, encryption service, or cross-device/tab synchronization. Blocked storage uses a clearly labeled session fallback.
- Verified at desktop and phone-sized browser viewports, not physical smart-home hardware.

## Remaining optional improvements (not completed)

1. Broader intent-language support with constrained server-side LLM rendering and structured validation, if later authorized/configured.
2. Richer tariff/charging-loss and interrupted-EV models, with corresponding tests and explicit assumptions.
3. Real energy-data providers and, separately, carefully authorized device adapters and defensible AC thermal models.
4. Optional cross-device persistence, voice input and additional animation after core reliability.

## Design revision — complete and verified

Starting checkpoint: `6a8ab67`, clean working tree. Redesigned the existing UI without changing the engine, data, storage schema, or domain tests. Original code-native SVG artwork and CSS perspective provide a low-poly miniature home, selectable Evie/Bubbles/Chill, day/dusk lighting, pixel-style controls, and a dimensional phone with a readable scripted conversation. The homepage reuses the phone and new theme while retaining its appliance and energy-data content.

The judge-facing composer deliberately displays an API-not-connected placeholder. It makes no network/model request and does not change constraints. Separate simulation controls continue to run the real deterministic planner. Preferences, training, approval, saved plans, and an expandable keyboard-scrollable planning history remain available. No packages, copied characters, downloaded assets, or external services were added.

### Actual self-correcting visual team

- Lead: integrated shell, navigation, homepage, accessibility, browser verification, documentation and final checks.
- Scene specialist: owned only `household-world.tsx` and `.css`; built original art, interactive controls and phone; ran scoped lint and repaired reviewer findings.
- Independent visual reviewer: actually viewed desktop and mobile screenshots, reviewed composition, readability and honest labels; re-viewed repaired screenshots and accepted them.
- Independent mobile/accessibility reviewer: actually viewed desktop/mobile screenshots and final household/homepage phone-width captures; reviewed source for targets, motion and callbacks; accepted final repairs.

First renders exposed tiny phone text, faint API/simulation disclosures, undersized touch targets, and a phone preview too far down the mobile page. Repairs enlarged phone dialogue to 13px, key disclosures to at least 11px, controls to 44–46px and the mobile composer to 16px; darkened text; moved the phone after the scene; and balanced narrow navigation into two columns. Final polish left-aligned phone messages, removed a decorative mobile caption overlap and raised composer-placeholder contrast to 5.30:1. Source-only review was not counted as visual acceptance.

### Verification after redesign

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: PASS, all 84 tests; existing domain and browser-store regressions unchanged.
- `npm run build`: PASS, all three application routes generated. The initial sandboxed build failed because the Turbopack CSS worker could not bind its local port; the same build succeeded with the required execution permission. No application workaround or dependency change was needed.
- `git diff --check`: PASS.
- Browser error log: empty.
- Desktop 1280px and mobile 390px: scene/homepage reviewed; all four household panels checked for horizontal overflow (none).
- Character selection, day/dusk toggle, phone straightening and Enter submission work. Placeholder text did not mutate the original plan or cutoff.
- Morning scenario → quiet-hours cutoff → computed proposal → approval/save works. The tested default quiet-hours plan was $3.21 / 3.505 kg CO₂e; these are observed engine outputs, not constants in the UI.
- Proposal focus moves accessibly after scenario controls. Day 2 timeline and training/preferences views remain accessible.
- Impossible Bubbles deadline produced explicit infeasibility and no approval. Reject withdrew approval; restored constraints produced feasible plans.
- Reset initially focused the safe cancel control; Escape canceled. Confirmed reset cleared scene preview and stored state; refresh retained defaults.
- Repeated morning/cutoff/approval then refresh preserved the saved plan and 10pm cutoff without a false XP announcement.

Local review artifacts (not committed application assets): `/private/tmp/housemates-redesign-desktop-v2.png`, `/private/tmp/housemates-redesign-mobile-v2.png`, `/private/tmp/housemates-redesign-desktop-final.png`, `/private/tmp/housemates-redesign-mobile-final.png`, `/private/tmp/housemates-redesign-home-desktop.png`, `/private/tmp/housemates-redesign-home-mobile.png`. One initial desktop capture had the wrong viewport width; it was corrected and re-reviewed at a verified 1280px before acceptance.

### Current limitations

The world is an original SVG/CSS illustration with simulated activity, not real telemetry or a WebGL physics simulation. The phone is a CSS 3D illustration with scripted sample text. Live AI replies remain explicitly unimplemented until an API is supplied. Free-text preview state is temporary; actual planning preferences and saved plans retain existing browser-local persistence. Reduced-motion behavior was inspected in CSS; no physical-device or external screen-reader certification is claimed. Existing energy-model limitations above still apply.

Local release checkpoint is recorded by the `Redesign Housemates as an interactive pixel household` commit on `codex/housemates-mvp`; no remote push or public deployment.

## Actual 3D / scroll-play revision — verification in progress

Starting checkpoint: f80e2db. User requested actual rotatable/zoomable geometry, pinned scroll sequences, pixel character portraits, schedule-derived live simulation stats, progressive phone dialogue and a more game-like UI. Follow-up feedback required substantially larger scene framing, simpler buttons, and gradual pastel day/dusk/night transitions. Three native specialists were assigned exclusive files; lead integrates and verifies actual browser behavior. Three.js and its type package are the only new direct dependencies.

### Completed 3D / scroll-play implementation

- Original procedural Three.js house, floating lawn, trees and three appliance models; explicit rotate/zoom/reset, keyboard controls, responsive camera fitting, WebGL fallback and disposal.
- User correction supersedes the initial full orbit: scroll now follows a gentle ±15° front-facing arc and advances the fictional clock from day 1 08:00 to day 2 08:00. Manual clock controls override scroll-follow; Scroll time resumes it. Manual camera rotation stays within front-facing bounds.
- Continuous pastel sage → peach/lavender → muted night sky, interpolated scene lighting, warm windows and idle sleep animation. Active scheduled appliances stay awake. Night-to-day browser samples showed intermediate darkness values 0.3932 → 0.1108 → 0.0024, with actual screenshots confirming changes to geometry illumination as well as the backdrop.
- Pixel portraits throughout; game-style HUD reports schedule-derived power, elapsed cycle progress, energy, cost and modeled carbon via the pure validated simulation ledger. Seven new regressions cover boundaries, midnight/partial sessions, zero-energy phases, invalid ledgers, negative prices and exact totals.
- Native pinned world/phone stages with Skip; phone starts empty and progressively reveals four sample messages. Manual reveal/restart controls work. Short landscape and reduced motion use ordinary flow. Free text remains a local API placeholder; existing planner, approval, preferences and saved plans remain functional.

### Self-correcting visual review and repairs

Three specialists implemented disjoint scene, phone/scroll, and simulation/sprite files. Independent reviewers actually viewed desktop/tablet/mobile/narrow/landscape and lighting-state screenshots. Repairs included larger camera framing, softer compact buttons, stronger 12px secondary HUD values, moving a tree away from Chill, matching model/sprite colors, fixing blank frames after canvas resize, and gradual lighting/sleep states. Latest review caught four clock buttons squeezing narrow screens and camera controls overlaying the island: clock controls now use a four-column mobile row and camera controls sit below the phone canvas. A short-landscape flex-height gap was corrected with an explicit 350px scene.

### Verification for this revision

- Lint and TypeScript pass. Automated tests: 91/91 pass (previous 84 plus seven simulation tests). Final production build passes for all three application routes, including the last responsive CSS repairs.
- Actual browser captures at 1280×900, 768×1024, 390×844, 320×740, 844×390: no horizontal overflow. Landscape clock and bottom HUD reachable through native scrolling.
- World remained pinned at top 0 while scrolling changed clock 08:00 → 19:30 → 00:00. Front of house stayed visible in all sampled states. Independent reviewer accepted the actual morning/dusk/night and intermediate fade images.
- Jump to job showed Bubbles at 0.6 kW, 0.06 kWh; playback advanced to 0.25 kWh with computed cost/carbon, then paused. End-of-horizon Play correctly restarts the clock. Keyboard rotation, zoom/reset and character selection work; browser error log empty.
- Phone Restart/Next changed visible bubbles 0 → 1; Skip reaches the actual plan. Placeholder submission left saved plan amounts and cutoff unchanged. Home mobile screenshot has no horizontal overflow. Earlier full approval/persistence/reset checks above remain backed by the unchanged domain/browser-store tests.
- Review artifacts are temporary files under /private/tmp, not application assets: housemates-cycle-{morning,dusk,night}.png, housemates-fade-{early,middle,day}.png, housemates-accepted-{mobile,small}.png, housemates-accepted-landscape-fixed.png, and prior phone/desktop/tablet captures.

### Current limitations (supersedes prior SVG-world note)

The household is actual WebGL geometry, not real hardware or a physics/thermal model. The iPhone is a CSS perspective frame with sample dialogue. Live replies remain placeholders pending an API. Simulation clock/scene selections are temporary; saved planning preferences retain browser-local persistence. Physical-device, assistive-technology and low-end GPU certification were not performed; reduced-motion behavior is implemented and source-reviewed. No external assets, paid calls, remote deployment or device connection were used.

Final independent review accepted the repaired 390px, 320px and landscape screenshots; no material visual findings remain. Whitespace checks pass. Release is saved by the local commit titled `Add interactive 3D household and scroll-driven day cycle`; no push or deployment.

## Guided onboarding demo — in progress

Starting checkpoint a12674f, clean tree. User authorized autonomous multi-agent implementation and review loop. Region/residence choices, public weather with honest fallback, team recruitment, procedural construction and a platform mascot are in scope. No image-recognition API is configured; local capture/manual confirmation planned. New setup remains separate from saved household plans.

### Guided onboarding completed — October 24, 2026

User clarified **synthetic weather only** and authorized research into the best recognition approach. The finished demo makes no weather/geolocation request. Optional public-weather helper code remains dormant and tested for possible future use; it is not imported by the onboarding UI. Camera setup now supports real optional on-device CLIP rather than a recognition placeholder.

Implemented `/demo` and homepage/household Join-the-demo links; five guided stages; six regional landscapes; apartment/townhouse/detached models; staged ground/path/planting/building/roof/weather/appliance drop-ins; finish/replay; original 3D Pip and contextual guidance; synthetic weather graph and bounded what-if controls; selected-team optimizer integration; local setup persistence separate from household memory; and optional local-photo suggestions with manual confirmation. ONBOARDING.md explains the pipeline/workflow; RECOGNITION.md records model details, test photographs and limitations.

### Review and repair evidence

- Scene specialist extended one existing Three.js renderer. Data specialist wrote pure scenario/weather/profile helpers and tests. Guide/capture specialist implemented mascot, photo handling, worker inference and tests. Lead owned route/UI/state/integration. Each lane ran scoped checks; different specialists reviewed source and actual renders.
- A stale development-server module produced an SSR/client mismatch even though emitted chunks were current. A controlled preview restart fixed it; subsequent reloads and all four routes produced no new runtime errors. The two old diagnostic log entries remain historical evidence, not unresolved errors.
- First responsive render overflowed because an auto-margin flex child used intrinsic width. Explicit width/min-width and corrected mobile ordering fixed it. Pip now stays sticky while mobile controls scroll; actual 390px and 320px checks measured guide top at 4px and no horizontal overflow.
- Independent review repaired fractional-hour rounding and the hour-48 label, an empty saved team bypass, stale saved notices after edits, and unselected cloudy-button state. Weather offsets/conditions now persist with validated profiles.
- Real initial dishwasher recognition abstained because a vague negative category overlapped the intended class. The engineer used more specific, general descriptions for supported and negative classes, retaining the same acceptance thresholds. Browser WASM then suggested Dishwasher with relative score 0.967; a tiger returned unsupported (animal 0.963). These are observations, not confidence probabilities or an accuracy benchmark. Confirm remained disabled until manual choice. Retry/cancel and local-photo replacement were exercised; no teammate was silently added.
- Reviewers actually viewed initial/repaired desktop/mobile scenes, distinct tropical and Nordic residences, early/middle/complete construction frames, recognition results, and final 1280×900, 768×1024, 390×844, 320×740, 844×390 captures. No material visual findings remain. Minor noted polish: the lawn tip is near the canvas edge on narrow phones, without clipping characters or controls.

### Final verification

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 117/117 (91 existing + 18 demo/weather + 8 recognition/lifecycle tests).
- `npm run build`: PASS, including worker bundling and `/`, `/demo`, `/energy-parliament`, `/household`.
- `git diff --check`: PASS; dependency audit reported zero known vulnerabilities.
- Peer additionally checked 432 region/residence/team/objective combinations with independent sums and objective bounds.
- Browser: join entry, stage navigation, region/home switching, temperature/scenery changes, add/remove, construction replay/build completion, actual positive and negative photo inference, mandatory confirmation, cancellation, save/refresh/resume including +10°C/rain, clock endpoint and sticky guide all exercised.
- Synthetic Bangkok apartment cooling changed from 5.3 to 14.3 kWh when adding 10°C, while flexible appliance scheduling stayed separate. These are computed illustrative model outputs, not hardcoded UI values or real home estimates.
- Browser: all five final dimensions have no horizontal overflow. Original household saved plan and 10pm cutoff remained unchanged; original scheduling lab still renders computed results. Homepage Join the demo leads to the new flow.

### Release limitations

Six representative city scenes, three residence types and three supported appliance characters are provided. Region rates/carbon and weather are synthetic; the background-demand formula is a transparent toy model. Camera capture uses the native mobile file/camera chooser; no physical-phone camera test or assistive-technology certification was performed. Recognition needs a modern worker/WASM-capable browser and roughly 190 MB first-use model/runtime download; offline first use and unsupported devices retain manual setup. Only a dishwasher photo and unrelated tiger photo were exercised as real inference cases; EV-charger and AC accuracy is not benchmarked. All suggestions require confirmation. Pip uses scripted text, not live conversational AI. Messaging integration and actual device control remain unimplemented.

Temporary visual artifacts are under /private/tmp: housemates-onboarding-final-{desktop,tablet,mobile,small,landscape}.png, housemates-onboarding-guide-320.png, housemates-build-{early,middle,complete}.png and housemates-recognition-positive.png. No photos, model weights or QA images are committed as application assets. The local release is identified by `Build guided regional demo with local photo recognition`; no remote push or deployment.
