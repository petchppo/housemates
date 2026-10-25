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

## City landmarks and NPC guide — October 24, 2026

Started from verified clean checkpoint `f9eb9f3`. User delegates design and implementation decisions to the orchestrating team. Four disjoint lanes cover scene geometry, NPC dialogue/aesthetics, cultural metadata/independent review, and lead integration/verification. Selected original miniature landmarks for all six cities and a builder’s field-guide aesthetic for Pip. No new dependency, external asset, AI service or deployment target is needed. Verification and review results follow below when complete.

### Implementation and self-correction evidence

- Added six original low-poly landmark miniatures in the existing renderer, included in stage-zero construction, replay, fitting and disposal. No new dependency or downloaded artwork. A city caption and contextual guide page identify the miniature; official cultural references are stored with metadata. Legacy `/household` reports `data-landmark=none`.
- Added Pip’s field-guide NPC: contextual chapter pages, optional help topics, Next/Back, minimize/reopen and Show-me focus/scroll navigation. The mascot carries an original map/satchel. Guide actions never change setup/profile/plan state; browser checks confirmed all five targets focus their current chapter’s control. Empty team stayed empty after navigation. Expanded mobile dialogue cannot cover controls; minimized header is 62px tall.
- Visual reviewers caught four fallback images during repeated city/chapter navigation. Root cause: keyed dialogue remounted the mascot and browser WebGL contexts were left for garbage collection. Moved the mascot outside the changing key and explicitly released both scene/mascot contexts on true unmount. Thirty-six city/chapter transitions then passed with no fallback. Three new tests cover contextual/read-only targets, stable actual JSX identity across changing context, and renderer/context/frame/observer cleanup.
- Repositioned the landmark bay forward and enlarged bridge/Oslo/Sydney roughly 10% for clearer silhouettes beside tall apartments. Recaptured all six completed apartment scenes after the renderer repair. Review also corrected nonexistent weather-reset guidance, separated visual sky from temperature-driven demand, and removed an unconditional saved-state claim.
- Full lint, TypeScript, 120/120 tests and production build pass. The CommonJS test harness emits Three.js’s CJS deprecation warning; application code uses ES module imports. All four routes build.
- Actual browser captures at 1280×900, 768×1024, 390×844, 320×740 and 844×390 show no horizontal overflow. Keyboard Enter minimizes the guide; page navigation/help/minimize/reopen and Show-me focus were exercised. The existing household still shows the prior saved cutoff and $3.21 / 3.505kg plan; the demo’s saved Oslo setup restores its computed $1.52 / 0.41kg plan. No save was overwritten by guide reading.
- Artifacts: `/private/tmp/housemates-city-final-{california,london,bangkok,tokyo,oslo,sydney}.png`, `/private/tmp/housemates-npc-final-{mobile,small,tablet,landscape}.png`, `/private/tmp/housemates-npc-minimized-small.png`, and `/private/tmp/housemates-landmarks-pip-final.png`. Earlier fallback captures are retained as failure evidence, not acceptance evidence.

Remaining limits: landmarks are symbolic miniatures; small silhouettes are intentionally simplified. Pip is written dialogue, not conversational AI. Weather and activity remain synthetic, while scheduling calculations are functional. Reduced-motion handling is source-reviewed and included in renderer tests; physical phones, assistive technology and low-end GPU behavior are not certified. No deployment destination or Git remote is configured, so no deployment was attempted; the local demo remains available.

Independent final review accepted all six repaired city/apartment renders and five responsive guide captures. No material findings remain; Sydney’s miniature shell silhouette could receive optional future refinement. Verified release is identified by the local commit title `Add city landmarks and Pip tutorial guide`.

## Move-in, floating Pip and daily energy — October24,2026

Started from clean007d25a. User reported a dead-end after move-in, rejected the inline guide box, and requested duck-curve-informed calculations and visible AC use. Team implemented a distinct completed-home route, explicit final build handoff, floating coach, regional authored grid/rate/carbon signals and separately accounted cooling activity. Existing household planner state and legacy fixtures remain separate.

Review-driven repairs so far: distinguish animation skip from completion; preserve selected planningMode across route remount; animate explicitly active Chill without changing legacy callers; use midnight signal at48h rather than previous23h interval; constrain empty-team/direct-URL/blocked-storage paths; remove inherited mobile scene order and provide legible HTML chart tick labels on narrow phones. Floating-guide/camera overlap is under targeted repair and will be re-reviewed before acceptance.

### Verified completion

- `/demo/home` now restores the chosen profile and cost/carbon/balanced objective into a completed-home dashboard. Earlier preview buttons say Skip animation; final scene, primary Finish build & enter home, and Pip Enter use the same handler. Seven actual-component regressions cover both button paths, blocked writes/session fallback, valid/invalid direct visits, empty teams and objective preservation. Browser exercised scene finish and Pip finish, edit/resume and refresh.
- Grid data shows distinct authored regional demand/solar/net-demand curves, including a strong California midday dip, with separate price/carbon signals. EV arrival18:00 and after-dinner dishwasher20:00 baselines stay fixed. Nineteen scoped demo/activity tests and a432-scenario peer sweep pass. Independent review confirmed exact fractional/midnight/48h integration, no double-counting and invariant AC across optimization modes.
- Browser Bangkok example: original routine activates Evie at7kW at18:00; optimized carbon-first moves it to04:00 day2. Chill shows0.76kW at18:00 in both modes. At48h EV reaches12kWh, dishwasher1.2kWh and the repeated cooling trace20.59kWh. These are computed scenario results, not literals or measured usage. Carbon-first survives entry with displayed$1.25 and3.56kg values.
- Actual five-size review1280×900,768×1024,390×844,320×740,844×390 found the floating bubble overlapping camera controls. The owner added target/toolbars/planning-control collision checks, bounded scrollable help and compact short-landscape help; fresh reload/re-capture confirmed no horizontal overflow and no compact-guide camera/clock overlap at all5sizes. Keyboard Escape closes help before minimizing and restores focus. Renderer stays mounted across guide changes; observer/listener/RAF cleanup and explicit-advance-only semantics are tested.
- Final independent visual review accepted the repaired camera/clock access, mobile guidance and short-landscape help. Known UX limit: at320px, explicitly expanded Help can cover part of the planning area until Less help/minimize/Escape is used. This is an optional popover; no claim that every underlying control remains visible with Help expanded.
- Final lint, TypeScript,138/138 automated tests and production build pass for all5application routes. The existing test-runner Three.js CommonJS deprecation warning remains non-fatal; app code uses ES modules. No dependency added. No public deployment attempted.

New artifacts are local QA files: `/private/tmp/housemates-home-accepted-{desktop,tablet,mobile,small,landscape}.png`, `/private/tmp/housemates-help-reviewed-{mobile,small}.png`, `/private/tmp/housemates-help-landscape-final.png`, and `/private/tmp/housemates-completed-home-final.png`. Old overlap captures remain failure evidence, not acceptance screenshots. Release identified by local commit title `Complete move-in flow with floating guide and daily energy model`.

Limits remain explicit: numeric grid/price/carbon/occupancy curves are synthetic, AC is a simple illustrative electrical-demand model without thermal inertia/equipment calibration, and household routines are one representative workday rather than inferred habits. AC is displayed but never optimized or physically controlled. Physical-phone and assistive-technology certification were not performed.

## Appliance chat, browser calls and approved execution — 2026-10-24

Continued verified foundation a41559e; preserved onboarding, home scene, original household and energy lab. Added a shared deterministic command/session engine, dashboard controller, interactive chat/proposal UI and optional native browser voice. No packages or API keys added. Request → computed projection → explicit approval → separate accelerated simulation → computed completion receipt. Chill remains a fixed cooling illustration.

### Review and repairs

Energy, voice and conversation specialists owned disjoint implementation/test files; the lead integrated dashboard/persistence and performed browser QA. Independent source review found proposal-ID reuse across a region change; IDs now remain monotonic across invalidation/reset and stale approval fails. Voice/UI review repaired external appliance selection retaining an old call, protected explicit transcript review, and prevented timer updates/old messages from triggering readout. Integration corrected direct reply source tags so opted-in readout works.

Preview activity now explicitly says projected even while a separate approved run exists. Preview scrubbing cannot complete tasks or accrue execution savings. Actual phone/desktop screenshots found Pip colliding with call controls: the completed-home guide now starts compact and stays with its home controls, becoming hidden when scrolling into the conversation; its renderer remains mounted. Dynamic protected-control queries also cover newly rendered chat/approval controls.

### Verification

- Final lint, TypeScript, production build and 167 automated tests pass. Added 10 domain, 7 controller, 7 browser-voice and 5 chat-component regressions using actual sources with controlled browser/clock/storage adapters. Build generates all existing routes. Non-blocking tooling warnings: npm environment http-proxy option; Three.js CommonJS import in the existing test harness.
- Actual browser: impossible EV deadline disables approval; correcting to 7 AM enables a computed plan; reviewed transcript containing approve cannot start execution; explicit approval starts, pause stops, preview Solar noon leaves the approved clock at 18:00, fast-forward completes with matching totals, reload restores completion, and New day clears the previous run. Typed Chill Status returns its separate modeled cooling trace. Call open stays microphone-off.
- Bangkok carbon-first example: completed13.20 kWh, $1.25 and3.562 kg modeled CO₂e; comparison $1.30 and2.938 kg lower than fixed original routine. All values computed, not fixture claims or physical savings.
- Rendered desktop1280×900, tablet768×1024, phone390×844, narrow320×740 and short landscape844×390 checked without horizontal overflow. Independent conversation specialist viewed actual screenshots and accepted phone call controls/readability; final revised captures reviewed after guide collision repair.

### Boundaries

Calls use browser speech, not telephony or a connected LLM. Recognition/readout may use browser-provider services; the UI discloses this. Physical microphone recognition and audible synthesis were not verified with a real recording; permission denial, unsupported browsers, timeout, stale events and cleanup are regression-tested. Typed fallback remains available. No app audio/transcript storage; only validated approved settings/progress persist, unfinished restores pause. The command parser supports bounded planning/status requests, not unrestricted conversation. Results become completed simulation records, never real device telemetry. No deployment target configured or deployment attempted. See VOICE.md.

## Integrated forecast, recruitment and party review — October 24, 2026

Resumed the retained multi-agent mission; status questions did not cancel its scope. Current work extends Git foundation `3631389` and preserves concurrent game-layout edits from another user session. No reset or replacement application was created.

Implemented/integrated: simple pinned landing world and progressive dimensional phone; `/demo/scan` ten-category recruitment with optional CLIP suggestions, separate local Tesseract nameplate candidates, explicit specification confirmation and duplicate-safe persistence; validated two-day Open-Meteo snapshots and distinct next-day cooling; reviewed EV/dishwasher inputs and generic additional flexible jobs; pixel guide/dialogue; optional authenticated iMessage bridge with honest unconfigured state. Protected AC, refrigerator and water-heater operation remains unoptimized. See README.md, ONBOARDING.md, RECOGNITION.md and IMESSAGE.md.

Self-correction evidence:
- Actual-component review found daytime party windows interpreted as tomorrow. Added explicit day-one parser option, preserving the legacy overnight default; six independent parser regressions cover day qualifiers, midnight and malformed times.
- Fixed typed-start approval guard, named-other-teammate handling, fractional dishwasher integration, morning simulation starts, stale forecast loading after mode changes, and onboarding photo recruitment bypassing specification review.
- Shared game-menu checks exposed accessible-label/whitespace harness mismatches; repaired them without weakening execution/approval assertions.
- Actual browser recruited all seven additional categories through reviewed demo settings, preserving existing three teammates. Spin's 09:00–16:00 request produced a 12:00–13:15 proposal; explicit approval and fast-forward produced computed 0.70 kWh, approximately $0.07 and 0.185 kg modeled carbon. These are this scenario's calculations, never hardcoded results or real-device measurements.
- Browser verified Bangkok live forecast source/local timestamp, two-day cooling disclosure, forecast persistence through Pip's move-in action, completed `/demo/home` navigation, and unconfigured iMessage status. Landing still starts with an empty illustrative phone and reveals bubbles; top/bottom demo entry remains separate from controls.
- Independent reviewer actually viewed full-ten phone/desktop screenshots and 320px/tablet/short-landscape captures. All models fit, with no blocking canvas/frame clipping. Enlarged mobile camera and Call/Log targets to 44px and footer text to 9px, then reviewer rechecked repaired phone and forecast/Pip screenshots. Minor remaining polish: tablet party rail can obscure part of two model labels; desktop world could occupy more horizontal space.

Latest complete automated run: 242/242 tests passed. TypeScript passed. A production build passed before the final touch-target CSS repair; final build/lint confirmation follows below. No physical-phone camera/microphone accuracy test or live iMessage exchange was performed. Real Tesseract read a generated 2000 W / 0.70 kWh fixture; real appliance-nameplate accuracy is unverified.

Limits: prices/carbon remain synthetic; forecast is outdoor model data; protected appliance ratings are not calibrated thermal models. Additional-party chat/execution use a separate session-only clock and totals, while passports persist. No LLM, actual device dispatch, verified execution, cloud account sync or configured iMessage server. Those external integration lanes were explicitly left for other user sessions. Shared workspace changes remain uncommitted while those sessions edit overlapping UI; avoid staging another session's in-progress work as a completed checkpoint.

Final integrated gate: `npm run lint`, `npm run typecheck`, `npm test` (242 passing), and `npm run build` all completed successfully after the repairs. Production routes include `/`, `/demo`, `/demo/home`, `/demo/scan`, `/household`, `/energy-parliament`, `/api/weather` and `/api/imessage`. The existing development server remains on port 3000.


## Single-screen game frontend — October 24, 2026

The latest user request replaces floating Pip and the stacked setup/dashboard presentation with a playable, one-viewport demo and original handheld-RPG dialogue along the bottom. This chat owned demo onboarding, its new `demo-game.css` shell, home dashboard, TutorialNpc and ApplianceChat presentation, and related UI tests. The other active session retained weather, recognition, expanded-party/domain work, messaging/API work and the shared release build. Existing working changes were preserved.

### Workflow and design

Lead integrated onboarding and performed actual browser journeys. A dialogue specialist owned Pip/appliance conversation components; a home specialist owned the completed-home screen; an independent reviewer inspected actual screenshots and source, returned concrete defects directly to owners, and reviewed repairs. Shared `presentation="dock"` interfaces were agreed first, preserving the previous component defaults for other callers. No new dependency, renderer, API connection or paid call was introduced by this frontend work.

The demo is a fixed-height game screen with a persistent world, compact HUD and choices/menu, pixel-framed bottom dialogue, and explicit progression. Optional weather detail, specifications, proposal review, history and voice use bounded panels/native dialogs. Home keeps the renderer and party/messaging controllers mounted across menu changes. The phone layout keeps camera and clock controls accessible; short landscape uses a side-by-side home conversation to preserve usable scene height. Pip remains mounted across setup-context changes and edit/home transitions. All calculated appliance replies are preserved exactly through explicit pages; the transcript remains available in Log. Opening calls remains microphone-off and approval remains an explicit review action.

### Review loop and repairs

1. Baseline desktop/phone review confirmed competing floating guide, large form headings, stacked cards and offscreen advance controls.
2. First game-screen review caught inherited world `top:24px` overlapping the phone menu, and Pip actions overlapping text. Removed the inherited offset and reserved separate dialogue/action rows.
3. Later reviews caught silently clipped long replies, deadline-command overflow, a hidden phone disclosure, expanding Help squeezing the world, and narrow camera/replay clipping. Added exact-content paging, wrapped commands, visible local-command labeling, fixed responsive dock height, focusable bounded Help with scroll hint, and wrapped construction controls.
4. Tablet review caught party controls covering expanded models. The repaired tablet rail occupies its own row above the canvas. Expanded-only households now get a direct Talk-to-teammate action that opens and focuses their actual party composer.
5. World stats use a native dialog with Escape/focus return; recruitment content transitions explicitly focus the new fields. Background page scrolling is scoped off on the game route; internal menus remain scrollable.

### Evidence

- Full combined tree at the earlier integration checkpoint: `npm run lint` PASS, `npm run typecheck` PASS, `npm test` PASS 242/242. Other-session changes continued afterward, so this is not a claim about every later backend addition.
- Final targeted frontend compilation/lint and 30/30 component regressions PASS. Home specialist additionally reran the final four home tests after direct-party focus repair. Tests cover current/stale approval, exact dialogue paging, optional voice/history, docked explicit progression, persistent mascot identity, home-to-edit visibility, storage failures and menu/preview state independence.
- Independent reviewer ran 33/33 party/conversation regressions and source-reviewed approval boundaries and retained controller lifetimes.
- Actual browser journey: region/home/weather/team setup, empty-team disabled progression, confirmed Spin specifications, move-in via Pip, expanded-only home and direct chat, editing a completed home, keyboard selection of Bubbles, typed infeasible deadline with disabled approval, corrected feasible proposal, review/approve, pause, solar-noon preview independent of execution, refresh restoring paused at18:00, fast-forward completion (13.20 kWh, $2.73, 2.836 kg modeled CO2e in the tested synthetic San Francisco scenario), and New day reset. Optional call opened without activating Listen; Escape restored Call focus. World-stats and Help Escape focus return were exercised. Help PageDown scrolled its bounded region.
- Independent visual reviewer actually viewed desktop1280x900, tablet768x1024, phone390x844, narrow320x740 and landscape844x390 screenshots; all six city scenes; setup/recruitment; repaired Pip Help; paged appliance replies; approval modal; expanded-only home and focused party conversation. Final verdict: no material visual blockers. At checked dimensions the document matched the viewport without horizontal overflow.
- Reduced-motion handling remains in the existing renderer/mascot and is covered by source/component review; no browser media-emulation override was available in this session. No physical-phone, screen-reader, microphone or low-end GPU certification is claimed.

### Handoff and limits

The user explicitly chose “Keep reviewing; I’ll handle the shared build afterward” while another session was changing the shared app. One build attempt encountered another build's lock; a later attempt overlapped a newly introduced `/api/dialogue` configuration error which its owner repaired. This chat canceled only its own in-progress build and left the healthy port3000 preview running. No successful final production build or new Git commit is claimed by this chat. The other session owns the combined build/checkpoint; do not overwrite or reset its work.

Screenshots are local QA artifacts in `/private/tmp/housemates-game-*`, including `final-home-tablet`, `final-longreply-mobile`, `final-longreply-page2-mobile`, `final-help-small`, `r3-home-{desktop,mobile,small,landscape}`, `r5-setup-{small,landscape}`, `expanded-only-mobile`, `expanded-conversation-mobile`, and `city-{california,london,bangkok,tokyo,oslo,sydney}` (all `.jpg`). Earlier failed/overlap captures are not acceptance evidence. Small-phone scenes are necessarily compact; longer help, specifications and settings scroll inside their explicit panels. All activity remains simulated and energy prices/carbon synthetic; this design preserves the other session's separately labeled weather functionality.


## Isolated judge graph, optional dialogue and bridge diagnostics — October 24, 2026

This session used the lead plus three native specialists, with exclusive new-file ownership. The user assigned onboarding/home/Pip/chat styles to one other session and weather/recognition/OCR/scheduling/messaging to another. Those existing files were not modified here. `/judge-demo` is a separate, session-only synthetic Bangkok EV/dishwasher workbench; it never reads, changes or clears saved household memory. See JUDGE-DEMO.md for workflow, contracts and the integration handoff.

Implemented:
- Three objective recommendations plus fixed baseline in a native SVG and accessible HTML table, computed by the existing validated scheduler from current negotiated requests. Internal grams become displayed kilograms; negative costs/signed changes, tied points, infeasibility and shared caps are preserved. This is not a complete Pareto frontier; Chill and background loads are excluded.
- Optional server-only local Ollama objective/explanation adapter, disabled without configuration, strict schema and semantic checks, bounded time/body/concurrency, no arbitrary generated numbers or execution actions. Suggestions require explicit review before the existing command engine creates a proposal. Existing synchronous chat/messaging contracts remain unchanged. No external speech provider or broad natural-language constraint parser was added. See DIALOGUE.md.
- Explicit BlueBubbles read-only preflight with no message/history calls, credential-redacting status, bounded timeout/body and redirect rejection. Configuration, reachability, pairing and actual receipt remain separate claims. See BLUEBUBBLES-SETUP.md.

Independent review and repairs:
- Messaging specialist reproduced late AI replies after timeout/cancellation and bridge state updates after unmount. Root repaired request generations, immediate timeout fallback, timer cleanup and stale-response checks; actual hook/component tests verify them.
- Local rule refusals now explicitly say no model was called; unknown/misrepresented response sources are rejected.
- Actual browser exposed incompatible explicit `runtime` exports with Cache Components and valid requests rejected against Next's internal bind hostname. New routes use default runtime, request-time configuration reads, and a strict actual-Host/protocol origin helper; forwarded headers and cross-host/port/protocol requests remain rejected.
- Graph reviewer actually viewed desktop, phone, narrow, tablet and landscape screenshots. Repairs enlarged mobile SVG labels, separated nearby leader labels without moving points, added axis spacing, aligned mobile visual/keyboard order, and fixed split SVG title children causing hydration mismatch. Repaired screenshots were independently accepted; no material remaining visual finding.

Verification:
- `npm run lint`: PASS. `npm run typecheck`: PASS. `npm test`: PASS, 292/292 in the shared working-tree snapshot, including 49 new regressions in this lane. Final hook copy refinement rechecked against all 8 actual-hook tests.
- `npm run build`: PASS, including `/judge-demo`, `/api/dialogue` and `/api/imessage/preflight` plus existing routes. Initial sandboxed build stayed idle at compilation; only that build process was terminated. The permitted retry compiled in 10 seconds and finished successfully. Healthy localhost:3000 development server was preserved.
- `git diff --check`: PASS.
- Actual browser: cheaper proposal → 22:00 dishwasher cutoff → carbon objective preserves cutoff; impossible 19:00 cutoff disables approval; typed approval leaves idle; explicit keyboard approval starts simulated state; manual advance changes clock; approved chart actions locked; reset and refresh restore isolated initial state. Optional AI and bridge checks display actual unconfigured responses. No provider result or message was invented.
- Browser checked 1280×900, 768×1024, 390×844, 320×740 and 844×390; no horizontal overflow. Keyboard Tab reaches the local-planner control and Enter approves explicitly. Runtime style inspection found zero animated/transitioned workbench elements, so the new view is static for reduced-motion users. No physical-phone, assistive-technology or configured-service certification is claimed.
- Temporary acceptance images: `/private/tmp/housemates-judge-desktop-repaired.png`, `housemates-judge-mobile-repaired.png`, `housemates-judge-narrow-final.png`, `housemates-judge-tablet-final.png`, `housemates-judge-landscape-final.png`; final preview `/private/tmp/housemates-judge-preview.png`. Earlier images/log errors are repaired findings, not unresolved acceptance evidence.

Remaining setup and checkpoint: neither Ollama nor BlueBubbles is provisioned/configured, and no real inference/message receipt was tested. The existing messaging adapter has the same internal-host origin check problem; its owner must apply/review the helper before live browser pairing. Its uncommitted bridge module is also a dependency of the new preflight, so a self-contained checkpoint awaits the owning session's dependency checkpoint. This session did not stage or commit other sessions' working changes, change OS permissions, access Messages databases, install models, make paid calls, or deploy.


### Actual-weather-only demo — October 24

Latest user request removes the synthetic what-if weather option. `/demo` now uses only validated actual city forecasts in its visible weather and completed home. Removed manual temperature/sky controls and updated Pip’s weather help. Migrated saved synthetic demo profiles to request real weather while retaining residence, reviewed team and planning objective. Forecast-dependent controls and home display wait for actual data; unavailable responses show retry rather than fictional temperatures. A failed refresh retains the dated actual planning snapshot. Browser fetch/body requests have a 12-second timeout, abort and stale-response protection. Legacy domain fixtures and synthetic electricity/carbon disclosure remain intact.

Browser evidence: real London Open-Meteo forecast displayed 15°C, 93% humidity, dated 2026-10-24 20:30 Europe/London, with source link. Captured desktop1280×900 and phone390×844; independent visual reviewer viewed both. Reviewer caught outdated sky-selector help and pale advance hover; repaired both and reviewer viewed/accepted the repaired phone capture. Actual hover DOM style confirmed darkgreen rgb(49,87,71), light text rgb(255,249,223). Captures: `actual-weather-desktop.jpg`, `actual-weather-mobile-repaired.jpg` under the session visualization directory. No new motion added; prior reduced-motion/keyboard behavior preserved.

Verification: first focused regression pass30/30, targeted ESLint and project tsc passed before the timeout addition. Fresh timeout and final checks pending below; an old compiled test rerun failed because its VM lacked the new timer globals, so it is not final evidence. Shared production build/checkpoint remains delegated to the other session at the user’s explicit request. No competing build or commit of shared changes.

Final weather follow-up: independent reviewer ran current-source weather integration tests via in-memory test transpilation: PASS11/11 including the new request timeout. No material source or visual blockers remain. Final full test compilation and targeted lint repeat stalled without diagnostics in the shared environment and were canceled; earlier lint/project typecheck PASS and focused30/30 remain the completed baseline, with the11/11 current-source pass covering final hook changes. No final full-build claim is made.

## Focused scanner evaluation and consumer flow — October 24, 2026

User requested actual reviewer testing with legitimate/fake images and spec sheets, a photo-to-Applimon animation, and less text. Implemented scan-first camera/upload presentation, concise optional disclosures, category/sprite reveal and confirmed arrival, and three spec cards: scan label → energy → routine. Named Today/Tomorrow time choices replace raw 48-hour indices. The same reviewed recruitment and reveal work inside `/demo` and `/demo/scan`; raw photos stay ephemeral and never enter saved passports.

Independent model evidence:
- Photo specialist ran actual pinned CLIP q8 inference on 17 images: six supported-appliance photographs, two unsupported/unrelated photographs and nine synthetic negative variants. Unguarded category matching accepted text-only appliance names and a misleading animal caption. A separate content comparison using the same loaded model now precedes acceptance. Three clear appliances receive correct suggestions, three difficult supported photos abstain, and all eleven negatives abstain in this hand-picked set. Four other supported categories lack real-photo coverage due to source throttling. This is regression evidence, not a held-out accuracy benchmark or authenticity detector. See SCAN-PHOTO-EVALUATION.md for sources, scores, partial redundant-replay disclosure and limitations.
- OCR specialist ran actual Tesseract on sixteen images: three official sheet renders and thirteen generated labels. Bosch's electrical rating was recovered correctly; two dense table sheets require manual input. Repaired standby/off-mode wattage, spaced/unit-bearing ranges and adjacent thermal/electrical interpretation. Plausible fake labels still produce plausible candidates and require review. See SCAN-EVALUATION.md.
- Peer reviewers accepted each other's parser/content changes. Expanded worker requires both completed model comparisons; missing/malformed/failed content output cannot expose a category suggestion. Legacy recognition remains compatible. Added actual-source lifecycle, stale cancellation, file handoff, multi-step review, saved-state and reveal regressions; duplicate/failed persistence never falsely creates a new appliance.

Browser evidence (actual UI, separate from native image-engine runs):
- Entered misleading label text containing rated 2000 W, standby 2 W and0.70 kWh; only active2000 W and0.70 kWh were offered. Applied candidates, entered duration/window, explicitly reviewed, and confirmed Tumble into saved world with arrival reveal.
- `/demo` → Your team → Add from a photo or camera → manual fallback → Breeze → spec steps → explicit review → confirmed reveal → back to team; Breeze appears in the model without an additional save/duplicate. Escape closes the native recruitment dialog. 390px viewport has no horizontal overflow.
- Visual reviewer actually viewed initial scanner, label/energy/routine screens and confirmed desktop/phone reveal, accepting consumer hierarchy and fit. CSS provides scanline and photo-dissolve/sprite-arrival motion, with reduced-motion rules. The photo-backed result animation was source-reviewed rather than captured through an automated file upload; physical phone camera and native/browser model parity remain unverified.
- Captures: /private/tmp/housemates-scan-new-phone.png, housemates-scan-label-phone.png, housemates-scan-energy-phone.png, housemates-scan-routine-phone.png, housemates-scan-reveal-phone.png, housemates-scan-reveal-desktop.png, housemates-demo-scan-dialog-phone.png, housemates-demo-reveal-phone.png. Earlier purple button/Meet-my-team scan caption captures precede scoped color and Keep-recruiting repairs.

Combined npm test passed327/327; npm run lint and npm run typecheck passed. Final production-build result follows. No special package, paid inference API or deployed service was added. Temporary third-party images remain outside the repository; only provenance reports and numeric regression outputs are included. Concurrent user sessions' work remains uncommitted and un-staged here.


## OpenAI API option — October 24, 2026

The user chose the OpenAI API as an alternative to local LLM setup. Lead plus three native specialists used disjoint adapter/tests/docs ownership; existing onboarding, home, Pip, weather and messaging implementations were preserved. OpenAI is now an explicit server-only provider in the isolated `/judge-demo` workflow. The fixed Responses endpoint receives objective/explanation text only, with strict structured output, semantic checks, `store:false`, a 20-second timeout and 1,024-output-token cap. No arbitrary generated figures, tools, constraint changes or execution actions are accepted. Suggestions still require review; only explicit current-proposal approval starts a simulated run. Ollama remains optional.

The action now says “Ask optional AI.” Its external-processing/possible-charge disclosure precedes the button and is linked with `aria-describedby`. Independent visual review actually viewed desktop 1280×900 and repaired phone 390×844 screenshots and accepted the disclosure placement. Browser checks confirmed no phone horizontal overflow, keyboard progression to the local planner, and a local cost proposal with execution still idle. The actual read-only `/api/dialogue` response remained unconfigured. No live API inference, account authentication or paid request was attempted.

Root created `.env.local` exclusively with mode 0600 and verified Git ignores it; it contains `HOUSEMATES_DIALOGUE_PROVIDER=openai` plus blank `OPENAI_API_KEY` and `HOUSEMATES_DIALOGUE_OPENAI_MODEL` fields. No existing environment file was overwritten and no real key was read. User must fill the two fields privately and coordinate the development-server restart. DIALOGUE.md documents model compatibility, API billing/quota, retention limitations and intentional live-test steps. Configuration status is not a successful provider handshake.

Verification: final isolated TypeScript compilation and all 41 provider/contract/hook/component tests PASS, including final timeout/token settings, source labels, stale replies, cancellation, no retries and explicit approval boundaries. Independent source review accepted the adapter and actual-hook tests. Initial full lint and whitespace checks PASS. Initial full typecheck/test compilation found an unrelated assertion-narrowing error in `tests/applimon-spec-capture.test.ts:138`; user explicitly handed that single repair to this session. The earlier zero-length assertion now uses `Number(h.confirmed.length)` so TypeScript does not preserve a stale literal length across mutating UI events; behavioral assertions remain unchanged.

Production bundling compiled successfully in 4.0 seconds, then full build typechecking failed on concurrent onboarding/weather interface mismatches (`DemoProfile.weatherLocation` / `DemoWeather.location` missing in `src/components/demo-onboarding.tsx`). Those owner-controlled files were not changed here. Final gate reruns and handed-off test review are recorded below when complete. No successful final combined build or verified local commit is claimed. The healthy localhost:3000 server was preserved; no unrelated work was staged, no models/services were installed and no deployment was attempted. Final visual artifacts: `/private/tmp/housemates-openai-desktop.png`, `/private/tmp/housemates-openai-mobile-repaired.png`, `/private/tmp/housemates-openai-preview.png`.

Final visual reviewer accepted the in-demo scan dialog and Breeze arrival at390px, including repaired green controls. Reduced-motion source review confirms immediate static sprite/actions, hidden scanline/photo overlay, and no flashing. Production build attempt encountered another session's active `next build` lock; no process or lock was removed. Waiting for that concurrent build before the final retry.


OpenAI follow-up gate results: the handed-off assertion repair independently compiled and passed all 8 capture tests. The full `npm run typecheck` rerun PASSed once the concurrent weather types landed. Full `npm test` compiled and ran 328 tests: 307 PASS, 21 FAIL. Failures are existing owner-controlled VM harnesses missing newly introduced weather imports: `tests/demo-completion.test.ts` rejects `./weather-location-picker` (12 tests), while `tests/demo-game-home.test.ts` (4) and `tests/demo-live-integration.test.ts` (5) reject `@/domain/weather-location`. Those tests were not changed here. Full output is `/private/tmp/housemates-openai-tests-final.log`. The final 41-test isolated OpenAI suite and 8-test capture suite passed against current sources. No full-suite acceptance is claimed while these shared integration failures remain.

Final full lint rerun PASS; full typecheck PASS; whitespace check PASS. The production-build retry is being tracked separately in `/private/tmp/housemates-openai-build-final.log`; full test acceptance remains blocked by the shared weather harness failures above.

Final production-build retry PASS (exit 0): compiled in 3.8 minutes, TypeScript finished in 3.3 minutes, all 15 static-generation tasks completed, including `/judge-demo`, `/api/dialogue` and existing household/demo/weather/messaging routes. Log: `/private/tmp/housemates-openai-build-final.log`. This supersedes the earlier transient build/type mismatch; the recorded full-test snapshot remains 307/328 with 21 weather harness failures, so no all-green milestone or local commit is claimed. Browser viewport override was reset and the verified judge-demo tab left open.


### City/county forecast picker — October 24

Implemented explicit search + native dropdown in the forecast chapter. Open-Meteo/GeoNames supplies disambiguated public place records; the server resolves provider IDs and forecasts trusted coordinates/timezones. Scene region stays independent of real forecast location. Persisted place and forecast metadata are validated together; region-only saved homes revisit the picker while retaining reviewed team and objective. No automatic first-result choice or device geolocation. Public place-center weather is not address-level accuracy. Counties are provider-dependent; UI suggests a nearby city if absent. POIs such as fairgrounds/heliports are filtered out; County suffix may retry its base name, without relabeling city records as counties.

Agent ownership/review: backend specialist owned domain/API and provider/persistence tests; UI specialist wrote actual component regression tests; independent reviewer tested approval identity and viewed screenshots. Concrete bugs found and repaired: timeout completion after query edit/unmount; mismatched forecast place metadata; same-ID corrected location metadata (including explicit update action when native select cannot change an already-selected ID); irrelevant POI county search results. Late responses cannot overwrite another place or mutate after unmount. Selected place changes invalidate old pending/persisted approvals even when numeric weather values match.

Actual browser: Oakland search returned distinct US cities with admin/country labels; selecting Oakland under a London scene loaded 19°C/56% humidity at America/Los_Angeles 2026-10-24 13:00. First cold request showed honest unavailable/retry, and retry succeeded. Filtered Alameda County search returned a provider record labeled Alameda, California, United States (not claimed as a verified county); selecting it loaded19°C/53% humidity with a different hourly curve. Move-in saved Alameda; route reload restored Alameda plus forecast, with London SCENE shown separately. Keyboard Enter opened the weather menu. Desktop1280×900 and phone390×844 captures were independently viewed and accepted; no new motion added. Native popup menu itself, universal county coverage, exact-address weather, and physical-phone assistive-tech behavior are not certified.

Evidence images in the session visualization directory: location-picker-desktop.jpg, location-picker-mobile.jpg, location-picker-final-mobile.jpg, location-home-mobile.jpg. Automated full suite passed352/352 before final explicit metadata-update button; all10 current-source picker tests passed afterward. Final combined lint/typecheck/tests recorded below when complete. Production build and shared Git checkpoint remain delegated to the other session by the user’s earlier instruction; no competing build or staging of other sessions’ changes.

### User-provided red-fridge regression and repair

The user supplied a screenshot of a clear red retro refrigerator receiving “No clear match” while the preview still said READY TO SCAN. Reviewer cropped only the visible product image from the supplied screenshot for actual pinned-model inference; the original uploaded file was unavailable. The current prompts misranked it as dishwasher0.334 versus fridge0.199, and the image-content comparison also failed the existing margin rule.

Repaired two generic descriptions: fridge shelves/food/drinks and a photo **or realistic product image**. No brand/color/fixture rule, threshold relaxation, new model or API was introduced. Actual inference on all eighteen images (the prior17 plus the user crop) now suggests Frost for the user image (relative category0.743974, content0.746850); prior clear dishwasher/EV/fridge suggestions remain, all eleven negative examples still abstain, and difficult washer/fan/heater photos still require manual choice. Independent source review accepted the correction. The final numeric fixture and SCAN-PHOTO-EVALUATION.md preserve all eighteen outputs and explicitly distinguish screenshot-crop evidence from the unavailable original upload.

Fixed result UX: completed uncertain scan displays a completion banner and CHOOSE YOUR APPLIANCE, uses a smaller reference photo, opens manual choices without selecting anything, and explains the two checks in optional details. Completed scans stop repeating initial model-download text. Cancellation/replacement clears the result; stale events cannot reopen it. The narrow320px spec tabs and routine fields also received a spacing repair after actual screenshot inspection.

Final shared-workspace acceptance after the user's fridge regression: npm test354/354 PASS, npm run lint PASS, npm run typecheck PASS, npm run build PASS. The other build lock cleared; successful build includes all current scan/demo and concurrent sessions' routes. No healthy server, other session's process or build lock was removed. Existing port3000 remains usable. No production deployment or original physical-camera upload validation is claimed.

Final local-location gates: npm run lint PASS; npm run typecheck PASS (Next route type generation + TypeScript); npm test PASS354/354; git diff --check PASS. Actual browser reload preserved Alameda forecast/location, and Enter opened Weather / Escape closed it and returned focus to Open weather menu. Phone document width390 matched viewport390. Independent reviewer accepted four screenshots; no material source/visual blockers. Shared production build/checkpoint remains outside this chat’s delegated lane.


### BlueBubbles webhook preparation — October 24

The user opened BlueBubbles and requested webhook setup. Reused the reviewed Host-aware same-origin helper for browser pairing, fixing Next internal-bind URLs without trusting forwarded headers. Added regression coverage for accepted localhost pairing and rejected cross-origin/mismatched-port/spoofed forwarded-host requests. The authenticated webhook POST path remains separate and still requires its URL bearer secret; no secrets were added to code or Git. The ignored `.env.local` exists but currently has none of the five Housemates iMessage settings, so no configured provider, pairing, or real delivery is claimed. Updated BLUEBUBBLES-SETUP.md with the concrete Add Webhook controls and private secret generation. This project lane awaits the owner's BlueBubbles port/password, separate sender/recipient identities, webhook registration, and a controlled server reload for live verification.

Webhook follow-up verification: focused iMessage/preflight tests18/18 PASS, full lint PASS, typecheck PASS on retry (direct tsc also passed), git diff --check PASS. Full test suite361/362 PASS: one unrelated currently shared-tree appliance-recognition expectation in tests/appliance-recognition.test.ts:267 expects spin but current candidate is null. No iMessage/preflight test failed. Production build remains delegated to the other session. BlueBubbles real account, credentials, webhook registration and phone receipt remain unverified.

## Broad scan review and corrective loop — October 24, 2026

The user reported clear Tesla and robot-vacuum photos being rejected. Lead plus recognition, capture and independent corpus reviewers worked in disjoint files. Independent acquisition produced 38 new, visually inspected internet images with provenance and fixed development/holdout splits before inference: 31 supported examples across all ten categories, six unsupported boundaries and one mixed washer/dryer room. Combined with earlier regressions and the two supplied originals, actual pinned q8 CPU inference covered 58 images. Public fixture images remain in temporary QA directories, not shipped assets.

The first frozen broad run exposed both over-restrictive image-style rejection and genuine category confusion. It is retained as failure evidence, not presented as universal recognition accuracy. Image style no longer vetoes a match; measured pixel detail guards blank/low-detail inputs. Vehicle photos lead only to conditional charging setup, and specification review requires a separate EV/plug-in-hybrid confirmation. Visually confusable laundry and heater/dehumidifier categories ask users to choose explicitly. Category recognition never supplies electrical power or energy. See SCAN-PHOTO-EVALUATION.md for raw and reviewed-policy outcomes.

Actual browser review exercised manual category recovery, EV charging inputs and separate confirmation gating. Independent reviewer viewed desktop1280×900 and phone390×844 screenshots. Found and repaired clipped Today/Tomorrow times with single-column controls at420px and below; repaired screenshot accepted. Document width matched viewport at both sizes. The physical camera/upload chooser and new worker's WASM inference are not certified by these DOM/component checks. Existing user household was not mutated by review.

A stronger local SigLIP model was researched but NOT benchmarked or integrated: download failed at49MB with ENOSPC. Only the incomplete candidate weights and the completed temporary native CLIP model cache were removed, recovering space; sources, actual raw model scores and image fixtures remain. No user files or active application caches were deleted. Production remains pinned CLIP; no accuracy improvement from an untested replacement is claimed. Final combined checks follow after integration. Shared user-session changes are preserved and no unrelated work is staged.

BlueBubbles local configuration preparation: existing ignored `.env.local` was preserved, a random 32-byte webhook secret was added server-side with file mode 0600, and four missing non-secret settings were left as commented templates for the owner to fill privately. No secret value was printed or committed; configuration remains incomplete and no live provider check was claimed.

### Stronger-model comparison resolved and final acceptance

The disk-limited comparison was subsequently completed without writing model weights to disk. The first RAM attempt exceeded its initial950MB guard; another temporary harness attempt mishandled a second cache lookup. Root corrected that repeat-lookup contract, retained the download buffer only through initialization, and ran with a bounded1.5GB/480-second guard. Actual SigLIP inference completed60 cases in115seconds including download/setup; initialRSS766MB and median two-pass CPU inference1.47seconds. These native figures do not predict mobile/WASM performance.

Measured same-image raw ranking justified a catalog-only upgrade to Xenova/siglip-base-patch16-224, pinned4649052661e53c7000355844105f8a1792088239:30/31 new supported categories correctly ranked versus CLIP25/31; six unsupported boundaries correctly ranked versus five. Two fresh, independently frozen laundry photos also ranked correctly. Legacy three-type CLIP remains unchanged. Only the selected model loads; expanded first-use disclosure is now250MB. No package installation, paid service, key, photo upload or hardware-control integration was added.

Independent reviewers verified all60 raw score arrays against actual outputs and image metrics against source pixels. Final interpreted outcomes are21 correct provisional suggestions,30 manual-review paths and9 unsupported paths. This is a post-evaluation recovery policy, not a zero-error classifier: washer/dryer and heater/dehumidifier confusion still requires choice; weak SigLIP raw matches remain manual even after relative-score normalization. Tesla gets a vehicle/EV confirmation question, while the supplied robot and retro-fridge examples receive Rover/Frost. A generic scene/category disagreement rule prevents a known captioned animal image from asserting a fridge. No fake-image authenticity guarantee is made.

Final checks after model integration: npm test380/380 PASS; npm run lint PASS; npm run typecheck PASS; npm run build PASS; git diff --check PASS. Build includes all existing demo, household, energy-parliament, judge-demo and API routes. Browser reload verified /demo/scan remains usable, updated250MB disclosure is rendered, and phone width390 has no overflow. Earlier independently viewed desktop/mobile scanner and repaired EV review captures remain applicable. Actual model inference was native CPU; the updated physical phone/browser upload-WASM path still needs device testing. No universal-appliance guarantee is claimed; ten modeled categories and reviewed specification entry remain the boundary.

Disk remains nearly full (~300MB available). Only task-owned temporary model weights were removed; no personal files, active server or app caches were deleted. The user was told to free space before downloading the new browser model. Localhost:3000 was preserved. No unrelated/shared changes were staged or committed, and no deployment was attempted.


### OpenAI local configuration recognized — October 24, 2026

User reported adding the API key. Redacted presence checks confirmed it was populated while the model field remained blank; initial local GET /api/dialogue returned unconfigured. Consulted current official GPT-6 Luna documentation (https://developers.openai.com/api/docs/models/gpt-6-luna), which lists Responses and Structured Outputs support, and filled only the blank model setting with gpt-6-luna. Preserved other environment settings and confirmed .env.local remains Git-ignored. The existing development server reloaded configuration without a restart; actual GET /api/dialogue now returns configured. No key value was displayed, no provider authentication/inference or billable call was made, and account access/quota and live response compatibility remain unverified. This was configuration-only; no application source or test changes.


### Optional assistant failure diagnostics — October 24, 2026

User reported the generic “No usable model suggestion” error. Inspected current server log and adapter: non-2xx provider bodies were discarded, incomplete/refused replies collapsed into one validation error, and the browser ignored the returned error code. The historical provider reason was not logged and cannot be recovered from these logs. A read-only authenticated GET of the configured OpenAI model returned HTTP200 with matching model ID; no key was displayed and no inference/token-generation request was made. This proves model visibility, not quota or successful inference.

Repaired the owned provider/hook/tests with three specialists and exclusive ownership. Upstream error bodies are bounded to4KiB and mapped to fixed authentication/access/quota/rate-limit/request-rejected/unavailable categories; incomplete-token and refusal responses have separate categories. Server diagnostics contain only fixed provider/error enums and numeric upstream status. Prompts, keys, raw provider errors and output are never logged or shown. UI displays authored actionable messages, checks request validity after awaiting error JSON, and rejects prototype/unknown error-map keys. Every failure still leaves suggestions absent; no retries or approvals were introduced.

Official GPT-6 Luna documentation confirms medium reasoning by default and supports none. Exact gpt-6-luna requests now explicitly use reasoning.effort:none for objective classification; other models retain their prior payloads. This avoids spending the small1024-token output budget on reasoning, but remains a plausible compatibility repair, not proof of the original cause. Caps remain20seconds/1024tokens and strict semantic validation remains intact. DIALOGUE.md records categories, privacy and live-test limits.

Validation: full lint PASS, full typecheck PASS, full tests386/386 PASS, production build PASS, independent source review accepted. A new deferred-error test initially assumed one microtask would reach response.json; repaired it to await an explicit body-start signal before cancellation, then all tests passed. Independent reviewer passed17 hook/UI tests and reran12 hook tests after that repair. Final403 copy was generalized to key/project permissions (rather than asserting model denial); all12 actual-hook tests passed again after this copy-only refinement. No layout changes were made. No new sanitized provider-failure log exists yet, because this session did not repeat the paid request; the user's next intentional retry will reveal the category if it fails. No successful live inference is claimed. Healthy development server and other sessions' files preserved. No shared work staged/committed.


### HTTP 429 follow-up — October 24, 2026

Read the user's retried result from the actual judge-demo DOM: the earlier provider-rate-limit message was displayed, which establishes upstream HTTP 429. The development log contained only `housemates:dialogue {}` because Next collapsed the console object argument. Current official OpenAI documentation revealed the earlier mapping was too broad: credit_balance_exhausted, organization/project_spend_limit_exceeded and organization_usage_limit_exceeded can all return429, while the broader type can remain insufficient_quota. The retained evidence cannot distinguish the original429 subtype; no temporary-throttling or depleted-credit diagnosis is asserted as proven.

Corrected classification with explicit credit-balance, spend-limit, usage-limit and quota codes. Rate-limit now requires a documented rate code/type; unknown or malformed429 returns a neutral provider-limit-unknown message advising billing/usage/rate checks before retrying. Logs now serialize the fixed provider/status/application-code fields into one string so the development log can retain them, with no keys/prompts/upstream prose. Updated authored UI explanations, regression fixtures and DIALOGUE.md. No API inference or automatic retry was made. Read-only dashboard navigation was inspected; an attempted billing overview tab was unavailable and no balance/payment information or billing action was obtained. User subsequently reported adding funds; successful inference after funding remains unverified.

Verification: full lint PASS, full typecheck PASS, full automated suite386/386 PASS, production build PASS, whitespace PASS. Independent reviewer compiled and passed47 focused provider/contract/hook/judge tests and accepted the classification/privacy checks. Provider owner additionally passed30 focused tests. Healthy server and shared work preserved; no unrelated files staged/committed. Once funds are reflected in API billing, the user can intentionally retry; no key change or restart is required for billing changes.


### Repeated iMessage delivery investigation — October 24, 2026

User reported first delivery worked but a later prefixed message did not, with the household visible. Actual browser showed paired and the previous bridge-accepted notice; these do not prove receipt of the second webhook. Independent reviewer reproduced three sequential fixture requests successfully, ruling out a universal one-message cap, and identified a real recovery defect: an unbounded client fetch/body could leave polling inFlight forever. Added 20-second action deadlines, stale-result exclusion, polling recovery notices, and no automatic resend of uncertain replies. Private per-session poll diagnostics now expose verified inbound/reply timestamps, fixed outcomes and pending count only, without addresses, IDs, transcripts or credentials. No accepted inbound event still cannot distinguish a missing webhook from a rejected event.

Regression checks cover stalled fetch and body, empty-poll recovery, later-message processing, uncertain-reply non-replay, consecutive requests, unsupported-prefix diagnostics and isolation from unrelated/duplicate events. Independent review found and repaired stale recovery copy and an incorrect pairing auto-retry claim; final reviewer reran17/17 focused tests and accepted. Full compiled suite390/390 PASS; typecheck PASS; final focused17/17 PASS; diff whitespace check PASS. Full lint result follows. Production build/checkpoint remains delegated per the user’s prior shared-workspace instruction. No real message was sent by tools.

Actual browser inspection after hot reload showed READY TO PAIR; opened Link and verified the Pair my iPhone control is visible. User must re-pair and send a new request for end-to-end diagnosis; original failed message and physical phone receipt remain unverified. No visual redesign or screenshot acceptance is claimed.

Final iMessage recovery lint: npm run lint PASS. Shared build and local commit not performed in this lane.

## Appliance camera focus — October 24, 2026

User requested that selecting an Applimon in the completed demo zoom the camera onto it. Lead owned dashboard wiring and actual browser review; scene engineer owned the existing Three.js renderer/pure camera helpers; independent reviewer owned helper regressions and visual/source review. Focus is opt-in for the completed demo; initial arrival stays in the whole-house view and landing/onboarding keep their existing camera behavior.

Explicit character selection now eases camera position and orbit target over650ms to actual visible mesh bounds, fitted to both viewport axes. Sidebar/chat selection uses a nonce so reselecting the same character after Reset works. Direct model clicks support all ten Applimons. Additional models focus without opening a modal over the animation; their conversations remain in the existing Team menu. Manual camera controls interrupt the move, Reset/Home restore the overview, resizing retains character framing, and reduced-motion settings skip interpolation. No planner, consent, household storage or execution behavior was added to camera actions.

Actual browser verification: core selection and repeated selection afterReset; allten models clicked directly in an isolated temporary QA scene; rapid target changes and manual zoom interruption; intermediate cameraMoving=true/distance9.610 followed by settledfalse/distance4.950; keyboardHome. The temporary route never used household storage and was removed before production checks. User's existing paused household was preserved. Independent reviewer viewed actual1280×900,768×1024,390×844,320×740 and844×390 dashboard captures plus Bubbles/Frost/Rover phone close-ups. Full bodies/faces and controls fit; no horizontal overflow. Reduced-motion path was covered by source/helper tests, not an OS-level browser preference change.

Initial combined tests caught a new camera-helper import missing from two scene-control VM harnesses; lead added the real helper to those harnesses. Concurrent character-dialogue test dependencies were fixed by their owning session. Latest full suite422/422 PASS and TypeScript PASS; final lint/build results follow. No packages, real device commands or paid API requests were introduced. No unrelated/shared work staged or committed.

Final camera-focus acceptance: full lint PASS, full TypeScript PASS, full automated suite422/422 PASS, production build PASS (all16routes/pages, no temporary QA route), and whitespace check on owned files PASS. Independent visual reviewer accepted allfive dashboard viewport sizes and the additional appliance close-ups. BrowserkeyboardHome restored focusAppliance=overview with target0,0,0. Existing localhost:3000 remains running; no deployment or shared Git staging performed.


### Shared Evie iMessage transport — parallel ownership handoff

User requested identical persona/context and reply on website/iMessage while another session still owns appliance-chat.tsx, use-character-dialogue.ts and demo-home-dashboard.tsx. Honored that ownership; created IMESSAGE-CHAT-HANDOFF.md and typed domain/message-conversation.ts contract. No direct cross-session thread messaging tool is available. UI owner still needs to replace the dashboard’s direct commands.send callback with its shared asynchronous conversation dispatcher and supply completed outboundTurns. End-to-end AI sync is NOT complete or claimed.

Transport now awaits the shared handler with messageId/cancellation, uses exact returned text and explicit AI/local source, serializes phone consumption, mirrors only newly completed web-origin turns after pairing, skips pre-pair history and phone echoes, and never generates another AI response. Server adds authenticated fixed-chat publish and dismiss actions, persona/source headers, safe ID/text validation,128-attempt/session cap, duplicate/concurrent/uncertain-delivery protection. Plain follow-ups target Evie initially or the most recent explicitly targeted phone/successfully published web persona; slower web delivery cannot overwrite a newer phone selection. Apple sender identity remains the bridge account.

Independent reviewer reproduced a long-batch expiry defect (tenth request dispatched at306s past300s expiry). Repaired per-message expiry capped by session expiry, pre-dispatch validation, remaining-lifetime cancellation and stale completion checks; regression tests reproduce skipped expired batch entries and recovery. Reviewer reran35/35 focused tests and accepted transport. Combined npm run lint PASS; npm run typecheck PASS; npm test441/441 PASS. Global diff whitespace check reports an unrelated trailing space in other owner appliance-chat.tsx:201; left their file untouched. Build/checkpoint remain delegated under prior shared-workspace instruction. No live messages, API inference or secrets accessed by this work.

Actual browser read-only inspection confirmed localhost/demo/home usable, READY TO PAIR, and updated sync disclosure rendered. No paired AI conversation or phone receipt has been verified; no screenshot/layout certification claimed. Remaining work is shared UI-controller wiring, integrated regression/browser review, then controlled live roundtrip if user initiates it.


## Character conversation and shared phone/web wiring — October 24, 2026 (verification in progress)

User corrected the separate objective-only assistant into character dialogue inside the existing home composer and requested removal of extra prompt/pagination buttons. Added bounded server-only OpenAI character endpoint and ten authored personas. The planner remains authoritative: exact figures are separate, model prose has no command/approval/device callback, no transcript persistence, and reviewed voice uses the same explicit Send. Core and expanded UI show source and fallback honestly. Intrinsic chat height repairs clipped replies/disclosures; presets and pagination are removed, optional controls use native Chat options.

With the user's explicit six-request exception, Evie produced a real reply inside the home and Bubbles produced a real endpoint reply. The final Evie planning and Chill refusal requests received upstream HTTP200 but application unsafe-character-reply. Rejected prose was not retained; exact cause is unknown. Source/fixtures reproduced overbroad denial rejection, repaired direct denials with adversarial double-negation regressions, and added fixed server-only rejection categories without logging prose. Focused48tests, compile/lint and independent review passed. The six conservative attempts are exhausted; no further paid calls are authorized or performed.

Independent reviewer actually viewed clean final desktop1280×900, tablet768×1024, phone390×844, narrow320×740 and landscape844×390 screenshots plus open Chat options. Full long fallback, source/error/disclosure and Send fit without horizontal overflow; presets/pagination absent. Native summary Enter toggling and Tab to Details checked in browser. Next development badge overlays some disclosure in captured development screenshots; no product overlay introduced. Expanded-party routing is fixture-tested for all ten characters; the current browser household has no extra roster so full expanded live visual coverage is not claimed.

Latest user request adds shared iMessage conversation wiring using IMESSAGE-CHAT-HANDOFF.md. Transport-owned files remain untouched. New shared hook serializes core web/phone/reviewed-voice sends, calls canonical planner once, generates at most one reply, retains per-character ephemeral history, returns the exact displayed reply and offers completed web turns to the existing transport. Controlled ApplianceChat bypasses independent generation and labels phone turns and local fallback. Dashboard no longer passes direct commands.send to MessagesConnection. Ownership/status recorded in both handoff files for the other user session.

Initial combined integration lint/typecheck passed;458/458tests passed, including actual dashboard wiring, controlled chat and10 shared-hook regressions. Independent review reproduced a stale old callback before passive context cleanup and a silent queue-full drop; owner is repairing both with synchronous commit invalidation and visible notice. Final rerun/build/review remains pending. Earlier character-only production build passed. No real iMessage was sent by tools, no device action or deployment occurred, and no shared/unrelated working files were staged or committed.


### Integrated phone/web conversation review — transport follow-through

Detected UI owner’s completed shared dispatcher/dashboard wiring and verified it uses the same character context and exact response on both surfaces. Added3 integration regressions combining the actual useHouseholdConversation hook, canonical planner and IMessageBridge (provider and BlueBubbles mocked): phone→web history/exact text, web→phone transcript/dedup/persona isolation, fallback source and phone approval rejection. All3 pass. Browser verified composer, configured AI label, no horizontal overflow, keyboard access to Chat options and conversation history; no additional model request or phone message submitted.

Combined independent review reproduced3 transport defects missed by separate unit suites: a35s wrapper canceled phone turns legitimately waiting behind web work; phone B could be delivered before earlier completed web A; reset could leave old completed web turns in the unsent queue. Repaired transport wait through verified mailbox/session expiry (shared hook still bounds each model), wait for the newly committed phone turn and drain earlier/later web turns in order, authoritative outbound snapshot filtering/reset invalidation, and layout-commit collection. Added deferred-commit, identical-prior-turn, delayed-web, hide/reset-in-flight regressions. Independent reviewer accepted23transport+47shared/server focused checks.

Read other session’s ACTIVE PHONE PAIRING DIAGNOSIS notice and froze all source edits/browser navigation immediately afterward. Existing UI READY TO PAIR was observed, but active phone pairing is now owned by that session. Last source edit was a prefer-const lint repair; no extra paid tests beyond that owner’s exhausted six-request allowance, no real outbound message, no build conflict or shared Git staging. Final read-only full checks follow.

Final integrated transport acceptance: npm run typecheck PASS; full ESLint PASS; final isolated TypeScript test compilation and node --test --test-concurrency=2 passed470/470 (0failed/0cancelled). Scoped six owned-file lint also PASS. The earlier shared-output run was interrupted during concurrent load; final isolated output confirms the current layout-effect harness and every test. Independent reviewer accepted combined behavior;3 actual-hook/bridge roundtrip fixtures use mocked external IO. Development app was inspected and stays usable. Active physical-phone pairing remains with the other session under an explicit source/browser freeze. No extra paid AI request, actual iMessage, production build, Git staging or commit was performed by this lane.

## Full Git checkpoint — October 24, 2026

User authorized committing and pushing the current combined project, including work from parallel sessions. Verified .env files, dependencies, Next output and test build output remain ignored; staged source/docs/test fixtures contain no detected real credential pattern or oversized binary. Token-like strings in two provider tests are explicitly authored test fixtures. Full current checks:470/470 automated tests PASS, lint PASS, TypeScript PASS, production build PASS, staged whitespace PASS after two whitespace-only cleanups. A new private GitHub repository was requested because no remote was configured; remote creation/push awaits the user's browser sign-in. This checkpoint does not claim a deployment or successful remote push before verification.

Shared wiring final pre-diagnostic checkpoint: full repaired suite470/470 PASS, full typecheck PASS, full ESLint PASS after transport owner's prefer-const repair, production build PASS. Earlier full test failure used stale emitted transport VM harness during concurrent compilation; current source includes useLayoutEffect mock and regenerated full run passed. Root and transport owner coordinated source freeze. Independent root reviewer passed final13 shared-hook cases plus26 transport/actual-bridge roundtrip checks; external transport reviewer accepted queue lifetime, ordered web/phone/web sends and reset invalidation. No related work committed because this integration depends on other sessions' uncommitted catalog/controller/UI changes; no unrelated staging.

Phone-link follow-up: first browser pairing disappeared during concurrent transport HMR; exact trigger not proven. After freeze a fresh session persisted, but user-reported current PAIR did not complete pairing. Actual app→BlueBubbles authenticated ping reachable. Read-only webhook configuration shows one New Message webhook at local port3000/app receiver with matching secret; no private URL/address/key printed. Empty-event POST to runtime receiver returned200ignored, proving secret acceptance without pairing/inference/send. User confirmed PAIR appears incoming in Mac Messages. This leaves incoming webhook delivery or strict event/pair validation unresolved; minimal server-only enum diagnostics now being added under explicit recorded ownership. No real message sent by tools, no further paid API calls.

Final verified outcome: BlueBubbles' supported soft service restart restored incoming webhook delivery. The next user-sent PAIR produced category paired and the browser displayed PAIRED TO THIS TAB. No validation relaxation was needed. User-originated phone planning text appeared in the web conversation as You · iMessage with the shared AI reply. The user explicitly authorized two additional live web tests and paired-phone delivery; root used exactly two. Both actual composer requests succeeded: the cheaper EV plan with morning deadline and a personality follow-up yielding Evie’s early-bird/road-trip voice. Website transport reported bridge acceptance for the mirrored turns. The user then explicitly confirmed BOTH replies arrived on the iPhone, completing physical receipt verification. No schedule/run was approved by chat or tests. Original six-call allowance plus later two-call allowance are exhausted; further agent-paid tests need new authorization.

Final owned milestone gates after diagnostics: npm test473/473 PASS; npm run lint PASS; npm run typecheck PASS; npm run build PASS; owned whitespace PASS. Independent reviewer viewed final successful actual-AI desktop and mobile captures (/private/tmp/housemates-shared-success-desktop.png and -mobile.png), accepted full reply/disclosure/source label/normal flow and simplified controls; earlier five-viewport review stands. Independent diagnostics review21/21, shared-hook13/13, transport+roundtrip26/26 passed. Both coordination handoffs updated. Healthy localhost server preserved; no deployment or unrelated changes staged/committed.


## Remembered phone pairing — October 24, 2026

User requested texting format and persistent phone pairing. Verified phone proof now creates a remembered binding with an HttpOnly/SameSite=Strict cookie (Secure on HTTPS), renewable one-year lifetime, and an ignored local `.housemates/imessage-pairings.json` registry. The registry holds credential/context/configuration hashes, verified destination and timestamps; it contains no raw cookie credential, pairing codes or transcripts. Directory permissions are 0700 and file permissions are 0600. Atomic writes, strict validation and fixed errors protect storage. Explicit Disconnect revokes durable identity and its temporary capabilities; unmount only detaches the temporary connection. Resume restores authorization after refresh or server restart without replaying queues or history. Household/configuration mismatches fail closed. The newest tab owns the conversation; replaced tokens return 409, so an older tab cannot automatically reclaim it. Bounded replacement bookkeeping preserves that distinction.

The client remembers newly verified pairing, restores on mount, and recovers successive short-session expirations only after a healthy replacement poll. An immediately invalid replacement stops without retry loops. Credentials do not enter localStorage or sessionStorage. The stable household key excludes weather refreshes, what-if weather and planning style, but isolates reviewed residence, location and appliance inventory. Mac, BlueBubbles, Housemates and a visible household tab remain necessary for replies. Remembered authorization does not persist conversation history or provide background AI.

Backend owner checks (32 tests), client checks (29 tests), and root household/dashboard checks (10 tests) passed. Independent review accepted persistence, cookie, revocation, recovery-loop and household-key behavior, including 40 combined fixture checks. Full gates PASS: 492 tests, typecheck, lint and production build. Actual browser verification passed: a new user-sent PAIR reached the bridge, the UI displayed PAIRED · REMEMBERED, and refreshing the home then reopening Link showed the remembered phone connected automatically without another code. Actual registry permissions are 0700/0600 and Git ignores the file. Server restart recovery is fixture-tested; the healthy Housemates server was not restarted. No new paid model call, tool-sent message, system setting change or personal Messages database access.

Live retry also exposed another upstream BlueBubbles listener stall: no webhook dispatch after the prior successful conversation despite a new user-sent code. The supported soft restart returned 200; a fresh user-sent code then paired successfully. Remembered browser authorization fixes repeated pairing, but does not cure an independently stalled provider listener. No additional paid inference or tool-sent iMessage was used for this milestone.

Read-only upstream review of installed BlueBubbles 1.9.9 found its watcher handles file change events without replacement re-watch or a periodic/wake recovery path. That is consistent with lost notifications, but the incident cause is not proven. No upstream app files, system settings or personal message databases were modified or accessed. Supported soft restart recreates the listener and restored delivery in this observed retry.

Independent visual reviewer actually viewed remembered-link captures at 1280×900, 768×1024, 390×844, 320×740 and 844×390. Actual Tab navigation scrolled Disconnect into view at narrow and landscape sizes; focused controls and sticky Close were visible in follow-up captures. Stable desktop capture was sharp. Reviewer accepted all views with no remaining findings. Existing reduced-motion behavior is unchanged. No source edits followed the passing gates.


## Natural phone conversation — October 24, 2026

User requested normal texts without repeating character prefixes and reported that “lmao” did not work. Actual visible conversation showed phone “Lol” returned a local command-help wall after a fixed device-state rejection diagnostic; later web “lmao” received a normal AI reply. Rejected prose is not retained, so the precise offending wording is unknown. The response guard remains unchanged.

Plain messages keep the active character. Optional named greetings, comma addresses and legacy colon prefixes switch core characters; ordinary colon prose passes unchanged. Explicit unsupported catalog addresses remain isolated. Transport preserves exact reply bodies with compact signatures, labels local replies honestly, and removes the universal technical header/approval footer. Website mirrors retain both user text and reply. No inference, execution or approval authority was added.

The character prompt now answers casual chatter without redirecting it to objectives or command syntax. A strict whole-message greeting/laughter/thanks matcher supplies authored local character prose only when AI is unavailable or rejected; valid AI wins. Mixed scheduling, approval or device requests retain their exact planner fallback. The canonical planner still runs once, and its original facts go to the provider. Regression coverage includes rejected “lmao” through the real shared hook, planner and bridge, with exact web/phone body and no pending or approved plan.

Full checks PASS: 503 tests, lint, typecheck and production build. Independent review passed 48 combined focused tests and accepted routing, fallback, provenance and approval boundaries. Five actual rendered Link views (1280×900, 768×1024, 390×844, 320×740 and 844×390) were independently viewed and accepted; keyboard Tab scrolled Disconnect into view at narrow/landscape sizes. No style or animation changes. During verification the development server stopped for an unknown reason; curl confirmed connection refused before it was restarted. The recovered home automatically restored remembered pairing after this actual Node restart. No new tool-paid model requests or tool-sent iMessages were used; changed prompt behavior against the live provider has not been retested. Other user-session capture/onboarding changes are excluded from this checkpoint.

A final combined rerun after concurrent capture/onboarding edits passed 510/510 tests, typecheck and lint. Natural-chat owned files remain unchanged from their passing production build and independent review.
