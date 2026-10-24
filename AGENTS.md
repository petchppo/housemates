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
- Preserve unrelated/user edits. Do not reset/clean away work. No specialist commits unless delegated; no remote push or public deployment.
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
