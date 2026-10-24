# Housemates progress

Updated: October 24, 2026 (America/Los_Angeles).

## Current mission

User supplied the full autonomous Phases 2–5 mission and authorized parallel specialists and local commits. Earlier no-chat/no-progression restrictions applied to the previous milestone and are superseded by this brief. Current phase: documentation and shared contracts, then Phase 2 review alongside Phase 3/4 implementation.

## Git and existing evidence

- Last committed foundation: `061cf28` — Initial Housemates foundation.
- Foundation includes the original homepage, three appliance definitions, synthetic data, and arithmetic.
- Scheduler/laboratory changes are present but **uncommitted** at mission start; never describe them as contained in 061cf28.
- Previous verified implementation: Evie 12 kWh, Bubbles two-hour cycle, protected/excluded Chill; 48-hour continuous-session search; cost/carbon/balanced modes; fixed-start baselines; signed differences; optional shared power cap; responsive /energy-parliament.
- Prior milestone evidence: lint PASS, typecheck PASS, 23 automated tests PASS, production build PASS. Browser covered controls, infeasibility, tradeoffs, invalid inputs, phone width, and homepage navigation. Current mission will rerun checks before checkpointing.

## Persistent files

- SPEC.md: authoritative product requirements and acceptance criteria distilled from the user mission.
- PLAN.md: phased execution, ownership, dependencies, gates, and priorities.
- AGENTS.md: concise repository coding/testing/safety/coordination rules, preserving generated Next.js guidance.
- DEMO.md: demo runbook, to be finalized against real browser behavior.

## Decisions

- Extend existing project; no recreation or special documentation packages.
- Keep grams internally and explicitly convert displayed carbon to kilograms.
- Use deterministic local conversation; no paid LLM dependency or external calls.
- Hard constraints and optimizer results are authoritative; narratives cannot override them.
- Versioned local storage; no authentication/database. Recompute saved results from validated input snapshots.
- Continuous constant-power EV model, hourly starts, repeated synthetic Day 2, AC excluded remain documented limits.

## Next tasks / outstanding

1. Create mission branch; define shared conversation/memory state contract.
2. Delegate disjoint energy, conversation, and memory/progression workstreams.
3. Integrate group chat, plans, profiles, preferences, persistence, and Reset Demo.
4. Independent review and regression fixes.
5. Full check suite, desktop/mobile demo, final documentation, local commits.

## Blockers

None. Missing phase-plan ambiguity was resolved by the user's full mission attachment. Tool-required approvals still apply; public deployment and remote pushes remain out of scope.

## Acceptance ledger

Phase 2 scheduling core: implemented and previously verified; current review pending.
Phase 3 live negotiation and saving: pending.
Phase 4 persistence and progression: pending.
Phase 5 integrated demo, independent review, final verification and commits: pending.

## Active swarm and self-correction

- Branch created: `codex/housemates-mvp`; foundation 061cf28 preserved.
- Shared contract: src/domain/household.ts; canonical planning fingerprint excludes presentation-only fields and survives persistence reconstruction.
- Agent A completed variable dishwasher profiles, exact peak-phase shared power checks, structured reasons/assumptions, and input hardening. Evidence: 33 tests pass, targeted ESLint and diff check pass. Now independently reviews conversation and memory.
- Agent B owns structured dialogue and negotiation; agent D owns safe local memory and progression; lead owns UI/integration.
- User reinforced the self-correcting swarm loop. PLAN.md and AGENTS.md now make owner repair, regression evidence, independent verification, integration gates, and continuation mandatory.
- Finding repaired: raw-object JSON fingerprints were sensitive to property order after restoration. Shared fingerprint now uses canonical scalar planning fields. Memory agent is verifying restored pending/approved states.

## Phase 2 verification gate — passed

Energy specialist extended the existing engine with configurable nonuniform dishwasher profiles, per-phase power checks, finite-range validation, and structured recommendation reasons/assumptions. The original 23 tests plus10 new engine regressions passed. Root integrated these without replacing existing APIs or the laboratory. Whole-app lint/typecheck/build also passed during integration. The engine checkpoint will include the scheduler/laboratory, mission documents, shared state contract, and test infrastructure; conversation/memory/UI work remains a separate integration checkpoint.

## Phase 3–4 implementation and review — integrated, final gate underway

- New /household includes deterministic group chat, objective and deadline/window negotiation, computed explanations, reject/revise/approve/save, plan comparison/timeline, profiles, preference editor, configurable energy/cycle profile, local storage, XP/levels, functional convenience shortcuts, and Reset Demo.
- Browser required demo passed: request morning plan → dishwasher cutoff22 → inspect → approve → level2 unlock → refresh → same saved plan/cutoff → remembered routine creates new feasible proposal ending Bubbles at22.
- Browser also verified keyboard Enter sending, rejection withdraws approval, revision restores proposal, infeasible deadline21 gives no approval/savings, 390px chat/preferences have no horizontal overflow, and slower charging produces distinct cost/carbon options.
- Independent domain and frontend reviewers have no remaining blocking findings. Corrections include day suffixes, latest-start semantics, negated/unsupported intents, capped saved-plan/ID safety, exactly-two-appliance invariant, canonical fingerprints, truthful storage/reset behavior, no false hydration XP, working Chill/higher-level shortcuts, bounded-log scrolling, named dialog, and explicit saved-setting replacement copy.
- Latest suite reported by specialists:84 tests pass, including6 actual browser-store failure/recovery tests. Root final rerun, reset/phone screenshots, final documentation and release checkpoint remain.
