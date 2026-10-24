# Housemates agent instructions

Read SPEC.md, PLAN.md, PROGRESS.md, and current Git status before changing code. User mission: finish Phases 2–5 autonomously with verified local checkpoints; preserve foundation 061cf28 and existing working changes.

## Coding

- Reuse existing TypeScript models, energy data, helpers, and UI; keep pure business logic in src/domain and fixtures in src/data.
- Preserve homepage and /energy-parliament. Keep localhost:3000 usable; do not kill a healthy server unnecessarily.
- Validate inputs and persisted state. Never let dialogue invent numbers, loosen constraints silently, or approve stale/infeasible plans.
- Keep units explicit: kW power, kWh energy, USD cost, grams internally / kilograms displayed for modeled CO₂e.
- Prefer existing dependencies. No special packages for Markdown, database, accounts, or paid LLM requirement.

## Testing and claims

- Run relevant tests after each substantive change; milestone gate: npm run lint, npm run typecheck, npm test, npm run build.
- Add meaningful regression tests for calculation, parsing, constraint, approval, and persistence failures. Do not add tests that only mirror implementation.
- Browser-check the integrated negotiation, approval, refresh/memory, reset, desktop/mobile layout, and keyboard-accessible controls.
- Label synthetic data and simulated activity. Report modeled estimates, never verified telemetry/savings. Protect Chill; no AC optimization or real device control.

## Coordination and checkpoints

- Native subagents are authorized. Define shared interfaces first; assign disjoint files and explicit ownership. No concurrent edits to another owner's files without handoff.
- Specialists report exact checks and risks. Lead integrates, obtains an independent review, updates PROGRESS.md, and creates local commits only after gates pass.
- Preserve unrelated/user edits. Do not reset/clean away work. No specialist commits unless delegated. Deployment decisions are delegated to the orchestrator when a project target is configured; do not invent a destination.
- Continue to the next unfinished phase without another user prompt. Record blockers honestly; never mark acceptance criteria complete without evidence.

## Safety

No secrets in client bundles or Git. No external accounts, purchases, paid API calls, unrelated file changes, machine-wide settings, destructive Git, or approval bypasses. Use local fallbacks for unavailable services. Respect tool authorization and request user intervention only for essential blockers.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Required self-correcting swarm loop

For every owned milestone: implement → run relevant checks → inspect exact failures → targeted repair with regression coverage → rerun → independent review → integrate → update PROGRESS → verified local commit → continue. Each specialist reports evidence, not just completion claims. Reviewers return concrete reproductions; owners repair and reviewers verify. After three failed repairs of one issue, change root-cause hypothesis, consult a peer, or simplify. The lead must run combined checks and the actual demo before final acceptance.

## Visual design review loop

Latest design scope: original handheld-game pixel chrome, low-poly household characters, interactive judge scene with explicit API-placeholder replies, and a scripted conversation in a dimensional phone. Keep scheduling calculations and existing functional panels. Do not connect an API until configured; never replace placeholders with invented model output.

For visual changes, capture the rendered site at desktop and phone widths. At least one independent visual reviewer must actually view those screenshots; source review alone is insufficient. Report concrete layout, interaction, contrast, and mobile defects, return them to the owning implementer, then capture/review the repairs. Check keyboard and reduced-motion behavior plus simulation/placeholder labels. Record what was actually reviewed in PROGRESS.md.

## 3D / scroll-play guidance

Use the existing Three.js scene and native ScrollStage; do not add a competing renderer/scroll-hijacking library. Keep wheel scrolling native and provide explicit zoom, keyboard controls and animation skip. Dispose WebGL resources, fit the full island on resize, paint after buffer resize, and pause background animation. Honor reduced motion. Model colors should match pixel portraits. Check 1280×900, 768×1024, 390×844, 320×740 and short landscape; never infer visual acceptance from source alone. Derive HUD power/energy/cost/carbon from validated schedules through simulation.ts. Use explicit simulation labels, protect Chill and preserve distinct queued/active/complete states alongside cosmetic sleep.

Scroll through 08:00 day 1 to 08:00 day 2; manual clock overrides must remain explicit. Keep both automatic and manual rotation front-facing. Fade WebGL lighting and CSS sky together. On narrow phones put camera controls below the canvas; short-landscape scene needs explicit height so flex sizing cannot leave a blank gap.

## Guided demo and recognition

Keep `/demo` setup separate from existing household memory. Weather in the demo is synthetic only; do not activate the dormant weather adapter without a new user instruction. Region multipliers are authored USD comparison scenarios, not tariffs/exchange rates; background thermal estimates never enter appliance savings. Reuse the existing renderer, scheduler and validated demo helpers.

Pip is a scripted 3D guide. Photo recognition is optional local CLIP in a worker, loaded only after an explicit button action. Keep photos off the network and out of persistence. Always retain manual confirmation, abstention, cancellation/stale-result protection and the model-download disclosure. Never infer appliance power, connectivity or verified identity from a photo. Messaging-platform integration is deferred. See ONBOARDING.md and RECOGNITION.md for architecture, actual evidence and limitations.

## Autonomous city/guide iteration

Orchestrators decide routine product, design and implementation details within the authorized project scope; avoid repeated confirmation. Tool permission controls still apply. Preserve successful local functionality. If a deployment attempt fails, leave an honest placeholder and record the exact blocker for morning; never claim a public deployment without verifying it.

City landmarks are original symbolic miniatures, not geographic replicas. Reuse the existing Three.js construction/lifecycle path and preserve the legacy household scene when no city is selected. Pip’s tutorial is written guidance with explicit navigation; it must not mutate setup or planning state. On narrow screens expanded dialogue stays in ordinary flow; a minimized guide may remain sticky. Review actual six-city scenes and NPC controls before acceptance.
