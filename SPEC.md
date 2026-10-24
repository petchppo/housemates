# Housemates specification

Source: user-provided **HOUSEMATES — AUTONOMOUS SWARM DEVELOPMENT MISSION**, received October 24, 2026. This brief supersedes the earlier phase-limited exclusions of chat and progression. Deliver a working local hackathon MVP covering Phases 2–5, not a new application.

## Product and boundaries

Housemates is a practical household energy-planning assistant with personified appliances, a group conversation, validated plans, remembered preferences, and useful training progress. It must run on a laptop and phone without hardware, accounts, a database, or a paid LLM key. Next.js 16, React, TypeScript, Tailwind, and existing dependencies remain the foundation.

- **Evie:** energetic, ambitious EV; initially 12 kWh, configurable power, energy, window, deadline. Continuous charging is the explicitly modeled capability.
- **Bubbles:** playful and cooperative dishwasher; initially a continuous two-hour, 1.2 kWh cycle. Duration and consumption profile are configurable; only approved operating hours are allowed.
- **Chill:** calm comfort advocate. Keep represented, protected, and excluded from optimized loads and savings without a defensible thermal model.
- All appliance activity is **simulated**. Rates are **synthetic demonstration data**. Calculations, constraints, conversations, storage, and UI interactions must actually work.
- Cost and carbon are separate objectives. Carbon is a modeled grid-intensity estimate, not measured or necessarily avoided marginal emissions. Never fabricate device telemetry, savings, conflicts, or executed commands.

## Phase 2 — energy intelligence

Reuse existing definitions, 24-hour data, and arithmetic. Plan over hours 0–48 with the synthetic day repeated. Validate complete sessions, midnight crossings, operating windows, deadlines, optional explicit shared power limits, and invalid input. Calculate interval costs and modeled emissions, appliance and household totals, signed changes from fixed original starts, assumptions, and recommendation reasons. Preserve zero/negative savings. Provide cost-first, carbon-first, balanced, and multiple feasible alternatives. Return explanations for infeasibility. Keep engine independent of React and expose typed APIs.

Internally retain the existing g CO₂e/kWh units to avoid conversion mistakes; display kg CO₂e and explain conversions (divide grams by 1,000). A start window is inclusive; a separate completion deadline bounds the complete session. A statement that Bubbles must not run after 10pm is a **completion cutoff**, not merely a latest start.

## Phase 3 — appliance parliament

Provide working group chat with deterministic structured intent interpretation and responses derived from validated optimizer results. Support cheaper, lower-carbon, and balanced plans; appliance deadlines/windows; rejection and revision; calculation inspection; explicit approval and saving. Unsupported/ambiguous language must ask a specific clarification, not silently mutate constraints. Core demo:

1. “I need my EV charged by 7 AM and my dishes finished before breakfast. Minimize my energy costs.”
2. “I don't want the dishwasher running after 10 PM.”
3. Recompute, explain, inspect, approve, save.

Use the existing 7am breakfast default and state that assumption. Do not hardcode the transcript or numeric outcomes. No external LLM is required; label deterministic dialogue accurately. Future LLMs may render validated results but cannot authorize constraints or invent numbers.

## Phase 4 — memory and useful progression

Persist household preferences, appliance settings, saved plan snapshots, training history, and meaningful conversation context in versioned local storage. Validate and bound restored state; recover from malformed/unavailable storage. Recompute stored plans before displaying authoritative totals. Remember Bubbles’ cutoff across refreshes and use it for subsequent planning. Provide character XP, levels, history, and at least one usable convenience unlock. Keep all core optimization available at every level. Reward meaningful actions, not repeated spam; self-reports never become verified savings. Support clearing local demo data with Reset Demo.

## Phase 5 — cohesive demo

Required views may be routes or panels: preserved homepage; group chat; interactive plan comparison/timeline; appliance profiles/training; preferences/data explanation. Friendly characters, readable cost/carbon tradeoffs, restrained reduced-motion-aware animation, semantic controls, visible focus, mobile layout, and accessible errors. Preserve /energy-parliament as the laboratory and localhost:3000. Supply a complete 90-second DEMO.md script.

## Acceptance evidence required

- Existing homepage and laboratory work; no unnecessary recreation.
- Energy, midnight, multi-hour, invalid/infeasible constraints, baseline, zero/negative savings, tradeoffs, explicit power limits covered by tests.
- Chat negotiates the two-message demo against current state and recomputes genuine results.
- Chill remains protected and excluded from claimed optimized savings.
- Approval saves only a feasible, current proposal; rejection/edits cannot approve stale plans.
- Settings, cutoff, saved plans, history, and training survive refresh.
- At least one progression event unlocks an actual convenience; optimizer remains available.
- Reset Demo reliably restores defaults; malformed/blocked storage does not crash the app.
- Desktop/mobile full browser demo, keyboard-accessible controls, no misleading simulation claims.
- Lint, typecheck, automated tests, production build, independent review, and local preview verified.
- PROGRESS.md and DEMO.md accurately record evidence, limitations, and local Git checkpoints.

## Authorization

Autonomous project edits, ordinary necessary dependencies, subagents, local tests/preview, and local commits are authorized. The latest instruction delegates deployment decisions to the orchestrator when a project destination is configured; record failures and leave an honest placeholder. Do not expose secrets, make unrelated changes, use destructive Git, or alter machine-wide security settings. Respect tool approval controls. Keep progressing through all phases unless an essential blocker requires user intervention.

## Current visual/interaction revision (supersedes chat-board presentation)

Use an original handheld-game-inspired aesthetic with pixel details and low-poly dimensional appliances; no copied Pokémon characters, logos, or assets. The main experience is a selectable interactive household scene. Judge free-text input has an explicit local placeholder reply until a later API integration; never imply that a model is answering. Working deterministic scheduling remains accessible through clearly labeled simulation controls. Show a scripted sample conversation in a dimensional iPhone-style frame. Preserve original homepage information, laboratory, all calculations, preferences, memory and progression. Provide responsive layouts, keyboard controls, reduced motion, honest simulation labels, and actual screenshot-based independent visual review with a repair/review loop.

## Actual 3D and scroll-play revision

The household now requires actual WebGL geometry (house, lawn, appliances), a gentle front-facing scroll-driven arc plus constrained manual rotation/zoom, gradual dawn/dusk/night lighting, and sleeping idle characters. Small portraits use original crisp pixel sprites. The dashboard exposes a controllable fictional 48-hour clock with schedule-derived power, session progress, energy, cost and modeled carbon; these are simulated values, never telemetry. Nighttime animation must not suppress a scheduled active task or imply AC control.

World and phone each occupy a native sticky scroll stage. Phone bubbles start hidden and reveal progressively; keep one concise demo/API-pending disclosure outside the phone rather than repeated labels inside it. Manual controls, skip, reduced-motion support and short-landscape ordinary-flow fallback must keep all content accessible. Inspect actual desktop, tablet, mobile, narrow-phone and landscape renders; iterate on model scale, control hierarchy, legibility and lighting.

Scrolling the world advances its simulation clock from 08:00 on day 1 to 08:00 on day 2. Manual clock controls override scroll-follow until explicitly resumed. Keep the house front visible; no automatic 360° spin. Sky, scene illumination, windows and sleep animation must blend continuously through dusk/dawn.

## Guided demo onboarding

From checkpoint a12674f, add a Join the demo entry and /demo route. A persistent original 3D platform mascot guides region → residence → weather → appliance team → ready. Assemble the world with staggered low-poly drop/bounce animation; support replay, reduced motion and accessible navigation. Offer six named city/region presets with distinct terrain/vegetation and apartment/townhouse/detached geometry. These are representative scenes, not geographic reconstructions.

Use synthetic weather only (explicit user clarification). Show a labeled fictional day, temperature/humidity and hourly graphic; allow bounded what-if temperature and sky changes. No weather-network or geolocation calls from the demo. Region-dependent synthetic electricity/carbon scenarios remain clearly labeled and denominated in USD for comparison. Residence and outdoor temperature affect a separately disclosed illustrative background heating/cooling calculation, never actual indoor temperature, thermal control or optimized Chill savings. Use the existing scheduler for selected flexible appliances; do not invent appliances or power measurements from a picture.

Appliance recruitment supports manual selection and local photo/camera capture, with optional real on-device SigLIP suggestions (legacy three-type callers retain CLIP). No recognition API key is required. Disclose the first-use model/runtime download, allow cancellation and manual fallback, abstain on ambiguous results, and require explicit confirmation. No photos uploaded or persisted. Messaging-platform/iMessage integration is a future step, not implemented in this milestone. Save validated demo setup separately from existing household preferences; do not overwrite the existing planner by entering onboarding.

## City landmarks and interactive guide revision

Add original procedural miniatures to all six demo city builds: Golden Gate Bridge, Elizabeth Tower, a Grand Palace-inspired pavilion, Tokyo Tower, Oslo Opera House and Sydney Opera House. They join staged construction and replay, preserve the existing household scene, and are symbolic rather than geographic reconstructions. Landmark metadata includes official cultural-context references.

Pip becomes a lilac-and-lime builder’s field guide with a small map/satchel and cream/violet game dialogue. Each onboarding chapter offers paged written guidance, contextual help, a control-navigation action, and minimize/reopen. Dialogue never advances setup, recruits appliances, changes constraints or pretends to be an AI response. Preserve keyboard controls, reduced motion and narrow-screen access.

Latest authorization: orchestrating agents make routine project/design decisions autonomously. Respect actual tool permissions; do not request repeated confirmation for already-authorized work. If an attempted deployment fails, keep a clearly labeled placeholder and record the blocker for morning. No deployment destination is currently configured.

## Completed-home flow, floating Pip and daily energy revision

Move-in must lead to a functional completed home at `/demo/home`. The preview’s animation-only control is called Skip animation until the final step; Finish build & enter home and Pip’s explicit Enter action open the same dashboard. Preserve the selected profile and planning objective; blocked persistence must retain a working session-only home. Missing/corrupt saved setup returns to onboarding.

Replace the inline guide panel with a persistent floating mascot and compact speech anchored near the next action, with explicit advancement, optional help, minimize/reopen, responsive placement and reduced-motion support. Reading/position changes never advance setup; empty teams cannot proceed. Guide placement must leave primary controls usable.

Use region-specific authored demand-minus-solar curves and separate hourly price/carbon signals, informed by the duck-curve mechanism. They are illustrative scenarios, not actual market measurements. Fixed original EV18:00 and dishwasher20:00 routines represent one workday; optimization respects availability/deadlines. Display Chill’s weather/occupancy-dependent cooling draw, hourly energy/cost/carbon and48h accumulated trace. AC remains unoptimized and is the existing background-cooling portion, never counted twice or claimed as a flexible-appliance saving. Preserve legacy scheduler fixtures.

## Appliance calls, chat and approved execution

The completed home supports per-appliance text commands and optional browser speech input/output. Reuse the deterministic parser and optimizer; no API credentials or LLM are configured. Opening a call must not activate the microphone. Transcripts remain editable drafts until explicitly sent; speech never approves execution. Explain browser-provider processing and retain typed fallback.

Each request computes a validated projection. A separate explicit approval binds the current proposal to its household/context and starts an accelerated local simulation. Preview scrubbing cannot execute tasks. Publish simulated start/completion updates and accrued calculations, then a computed completion receipt; never present these as real-device telemetry or measured savings. Approved runs remain immutable until reset. Persist only validated approved settings/progress, restore unfinished runs paused, and exclude chat/audio from storage. Protect Chill's fixed cooling model.

## Landing separation, phone recruitment and iMessage pipeline

Latest user scope supersedes earlier preserve-homepage layout and messaging deferral. `/` is a concise visual story: pinned scroll-driven low-poly world, restrained front-facing rotation/day transition, dimensional phone with progressive sample bubbles, final sentence and prominent top/bottom `/demo` entry. Keep graphs, rates, stats and planning controls in demo/lab routes. Retain reduced-motion and keyboard skip/manual alternatives.

Phone scanning must reuse real optional local recognition with manual confirmation, then recruit into the saved model. Never derive wattage or a custom 3D mesh from a category match. A transfer link carries a category suggestion only, requiring another confirmation on the receiving browser.

Implement an optional iMessage bridge pipeline to the existing browser command authority. Authentication, sender pairing, replay protection and bounded queues are required; browser execution approval remains explicit. Do not claim a live service until the Mac bridge and credentials are configured. No access to personal message databases or OS permission changes is required to implement/test the adapter.

## Current revision: actual forecast, ten Applimon, reviewed specifications

The later request for actual weather supersedes synthetic-only weather. Use current city conditions plus two local forecast days from Open-Meteo; show source, local timestamps, freshness and an explicit synthetic fallback. Feed hourly temperature/humidity into illustrative background cooling, including a distinct second day. Electricity/carbon profiles remain authored synthetic scenarios; weather is not device telemetry.

Recruit Evie, Bubbles, Chill, Spin, Tumble, Ember, Misty, Rover, Frost and Breeze. Review electrical input, task energy, duration, baseline and timing constraints, optionally using local nameplate OCR candidates. Category recognition cannot determine power or identity. Preserve manual entry and explicitly labeled demo settings. Flexible jobs compare cost/carbon/balanced plans; AC, fridge and hot water remain protected, fan routines fixed. Preserve the baseline and require separate execution approval.

Additional-party chat and execution use a separate session-only planner; confirmed passports persist. Core EV/dishwasher approval persistence remains intact. Show these boundaries rather than claiming unified device control or measured savings.

## Consumer scanning and adversarial review revision

Recruitment is scan-first and compact. Use a visual appliance scanner, provisional photo-to-sprite reveal, and three short specification steps (label, energy, routine). Camera/selection actions stay prominent; technical caveats and raw match scores live in optional details. A confirmed arrival celebrates an explicit reviewed recruitment, never automatic recognition or device control. Keep original photos local and release previews on cancellation, replacement and completion. Respect reduced motion.

Review real appliance photographs, unrelated/synthetic negatives, official manufacturer sheets and misleading labels with actual local model runs. Separate native-engine evidence from browser interaction and physical-camera testing. Photo content screening can abstain on text/drawings/unclear photos but cannot authenticate an image. OCR candidates cannot authenticate a label or replace human review. Record findings, targeted repairs and remaining failures explicitly.


## Local forecast location selection — latest user revision

At the forecast chapter require explicit city/county selection from real place-search results before loading weather or proceeding. Scene presets remain presentation and authored energy scenarios; weather uses the chosen public place center and its time zone. Search labels distinguish name, county/admin area, state and country; provider coverage may require choosing a nearby city. Do not request device geolocation or claim address-level accuracy. Save validated selected-place metadata with a matching forecast snapshot; old region-only saves revisit location selection without losing the appliance team. Changes of place invalidate stale weather and schedule approval context. No synthetic fallback appears in this flow.
