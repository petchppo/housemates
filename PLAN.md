# Housemates execution plan

Execution status: Phases 2–5 are complete and verified locally. See PROGRESS.md for actual evidence, repaired findings, limitations, and Git checkpoints. The plan below is retained as the execution/handoff record.

## Starting state

Foundation checkpoint: `061cf28` on main. Working tree already contains the functioning Phase 2 scheduler and /energy-parliament, previously verified with 23 tests, lint, typecheck, build, and browser checks. Preserve all these changes. Create a mission branch and checkpoint the existing engine after current checks and independent review.

## Ownership and coordination

Use native subagents, maximum three specialists concurrently alongside the orchestrator. All share a filesystem. Give each an exclusive file list; do not modify another owner's files without a handoff. Specialists return implementation details, checks, findings, and remaining risks. Orchestrator alone integrates and commits. No worktrees needed while file ownership is disjoint.

- **Lead / Frontend / UX / Release:** root documents, shared conversation contract, routes, components, navigation, persistence wiring, browser acceptance, final integration/commits.
- **Energy engineer (A):** scheduling types/engine, energy request fixtures as needed, engine tests; inspect mathematical correctness and add configurable dishwasher consumption profile plus structured explanations.
- **Conversation engineer (B):** pure intent parser/orchestrator and conversation tests; consume shared contracts and existing optimizer; no UI/storage edits.
- **Memory/progression engineer (D):** pure training and safe persistence modules/tests; no UI/conversation edits.
- **QA / red team (F/G):** rotate a free specialist into independent review after implementation; challenge calculations, intent handling, stale approvals, restored data, browser accessibility, and claims.
- **Release (H):** lead coordinates checks, documentation, local checkpoints, repeatable demonstration.

## Dependency order and gates

### Phase 2 — complete and harden energy intelligence

1. Inspect current code and validate assumptions; retain known-good functionality.
2. Add variable dishwasher energy profile/duration and structured assumptions/reasons without breaking existing APIs.
3. Test midnight integration, exact totals, invalid/infeasible inputs, baseline comparisons, signed changes, tradeoffs, optional shared limits.
4. Independent review and existing check suite pass; local Git checkpoint.

### Phase 3 — connect conversation to verified plans

1. Define shared TypeScript state/message/proposal/saved-plan contracts before parallel code.
2. Implement typed intent parsing for constraints/objectives and a deterministic conversation reducer.
3. Every proposal is evaluated by the optimizer; appliance replies contain computed values and explicit assumptions.
4. Build /household chat and plan panels, input controls, explanations, reject/revise/approve flows. Preserve existing routes.
5. Test required negotiation, unsupported input, impossible requests, and stale approval prevention. Browser demonstration and checkpoint.

### Phase 4 — memory and meaningful progression

1. Versioned, bounded local state; stored requests are validated and results recomputed.
2. Remember preferences and settings, feasible saved plans, messages, XP/history.
3. Unlock a reusable preferred-plan shortcut via meaningful training; never gate the optimizer.
4. Handle malformed storage, disabled storage, refresh, explicit reset, and duplicate XP.
5. Verify cutoff memory and a real unlock through UI and tests. Checkpoint.

### Phase 5 — polish and release verification

1. Cohesive navigation, appliance profiles, household preferences, clear synthetic-data explanations.
2. Mobile, keyboard, focus, errors, reduced motion, legible calculations/timeline.
3. Independent adversarial review; fix material findings with regressions.
4. Run lint, typecheck, tests, build; browser full 10-step acceptance demo at desktop and phone width.
5. Finish DEMO.md and PROGRESS.md with actual evidence and limitations; final local commit and clean working tree.

## Execution loop

Implement bounded task → relevant verification → independent review → targeted repair → integrated check → PROGRESS update → verified local commit → next task. Do not stop at a phase boundary. After three unsuccessful attempts at one issue, investigate a different cause, consult a specialist, or simplify while preserving stable behavior.

## Priorities

P0: correct optimization, feasible negotiation, state updates, approval, accurate comparisons, reliable demo. P1: durable preferences, useful progression, accessible visual polish. P2 deferred: voice, elaborate animation/3D, remote synchronization, external energy APIs. Avoid new libraries unless they solve a concrete unmet need.

## Mandatory swarm self-correction (user reinforcement)

Every specialist owns the full implement → verify → inspect → repair → reverify loop for its bounded task. Passing code back without running relevant checks is not completion. On failures, capture the exact symptom and root cause, add a meaningful regression where applicable, and report the final command/result. After three unsuccessful repairs, change the hypothesis or consult another specialist; do not repeat speculative fixes.

A different agent reviews cross-module behavior and reports reproducible findings to the owner. The owner repairs and the reviewer verifies the fix. The lead runs integrated checks and the browser acceptance journey before marking a phase complete or creating its checkpoint. PROGRESS.md records findings, fixes, evidence, and remaining limitations. Resume at the next unfinished task after every checkpoint.
