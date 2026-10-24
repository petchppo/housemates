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

Autonomous project edits, ordinary necessary dependencies, subagents, local tests/preview, and local commits are authorized. No remote push, public deployment, purchases, paid calls, external accounts, secrets exposure, unrelated changes, destructive Git, or machine-wide security changes. Respect tool approval controls. Keep progressing through all phases unless an essential blocker requires user intervention.

## Current visual/interaction revision (supersedes chat-board presentation)

Use an original handheld-game-inspired aesthetic with pixel details and low-poly dimensional appliances; no copied Pokémon characters, logos, or assets. The main experience is a selectable interactive household scene. Judge free-text input has an explicit local placeholder reply until a later API integration; never imply that a model is answering. Working deterministic scheduling remains accessible through clearly labeled simulation controls. Show a scripted sample conversation in a dimensional iPhone-style frame. Preserve original homepage information, laboratory, all calculations, preferences, memory and progression. Provide responsive layouts, keyboard controls, reduced motion, honest simulation labels, and actual screenshot-based independent visual review with a repair/review loop.
