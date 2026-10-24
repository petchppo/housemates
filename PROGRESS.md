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
