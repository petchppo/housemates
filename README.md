# Housemates

A Stanford CleanTech hackathon prototype for household energy planning. Built with Next.js App Router, TypeScript, Tailwind CSS, and Three.js. Explore an original 3D household, replay a calculated energy plan, and meet its pixel-art appliance characters. No smart-home hardware, credentials, or external services are needed.

## Run locally

Requires Node.js 20.9+ and npm.

```sh
npm install
npm run dev -- --hostname 0.0.0.0
```

Open http://localhost:3000 for the homepage, http://localhost:3000/household for Appliance Parliament, and http://localhost:3000/energy-parliament for the scheduling laboratory. The homepage links to both. See [DEMO.md](DEMO.md) for the 90-second presentation script; [PROGRESS.md](PROGRESS.md) records completed verification separately.

For a phone on the same Wi-Fi, use the laptop's local IP address, e.g. http://192.168.1.10:3000/household. Some guest networks block connections between devices.

## Explore the household

The world and phone are separate, vertically stacked scenes. Native sticky positioning holds each scene in view during its short scroll sequence; ordinary scrolling continues afterward. **Skip** moves past a sequence without trapping the keyboard or intercepting wheel/touch scrolling. Reduced motion and short viewports use ordinary document flow instead of pinning.

- **3D world:** an actual Three.js/WebGL scene with modeled house, landscape, and appliances. By default, scrolling advances the simulated clock from Day 1 at 8am to Day 2 at 8am and gently changes the front-facing view; it does not automatically spin the house through a full turn. Drag or use the rotation and zoom controls to explore manually. Day/night lighting and resting character poses are visual simulation.
- **Pixel status panel:** Evie and Bubbles show current simulated kW, completed/required kWh, session progress, accrued USD cost, and modeled kg CO₂e from the current feasible schedule. XP and levels come from remembered training. Chill remains a protected comfort character with no modeled AC energy or savings.
- **Replay controls:** use the time slider, Play/Pause, Day/Night, or **Jump to job** to inspect a planned session. These manual actions leave scroll-following mode; **Scroll time** restores it. Reduced-motion and short-viewport fallbacks retain the manual clock. A plan must exist before scheduled appliance activity can be replayed. Replaying a proposed plan does not approve or execute it.
- **Phone story:** a CSS 3D phone starts with an empty conversation, then reveals the user, Evie, Bubbles, and Chill as you scroll. **Next message**, **Show all**, and **Restart** provide manual controls; **Follow scroll** returns from manual playback. Reduced motion initially reveals all messages. This is a local demonstration conversation with an AI connection pending.
- **Working planner:** **Plan the morning** and **Quiet after 10pm** calculate real scheduling options. **Say something to your party** produces a local placeholder reply and does not change planning constraints.

The scene canvas also supports arrow-key rotation, `+`/`−` zoom, and `Home` to reset its view. Appliance buttons provide an alternative to selecting objects in the scene. No camera movement, lighting change, or playback control changes household scheduling constraints.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Tests use Node's built-in test runner. TypeScript compiles the engine and tests to the ignored `.test-build` directory; no extra test dependency is needed. `typecheck` generates Next.js route types before checking, including on a fresh checkout.

## Architecture

```text
src/
  app/                         Existing homepage, layout, and styles
    energy-parliament/page.tsx Scheduling test route
    household/page.tsx         Integrated conversation/demo route
  components/
    appliance-icon.tsx         Shared pixel appliance icon wrapper
    pixel-appliance.tsx        Original pixel-art appliance portraits
    energy-parliament.tsx      Laboratory and shared timeline
    household-app.tsx          World shell, proposals, training, plan views
    household-world.tsx        Simulated clock, pixel status panel, planner controls
    household-scene-3d.tsx     Three.js household, lighting, selection and camera
    scroll-stage.tsx           Native sticky progress, skip and motion fallbacks
    phone-story.tsx            Scroll-revealed CSS 3D phone conversation
    household-settings.tsx     Validated preference and load-profile editor
    use-household.ts           Browser store, hydration, persistence, reset
  domain/
    appliances.ts              Agent identities and device-specific constraints
    energy.ts                  Shared cost/carbon arithmetic
    scheduling.ts              Pure validation, evaluation, search, comparisons
    household.ts               Shared state and canonical proposal fingerprints
    conversation.ts            Typed intent parsing and computed dialogue
    memory.ts                  Validated local snapshots, XP and useful unlocks
    simulation.ts              Planned interval replay and accumulated usage stats
  data/
    appliances.ts              Three simulated appliance definitions
    energy.ts                  Existing 24-hour synthetic energy profile
    scheduling.ts              Default windows and fixed baseline starts
tests/                         Engine, conversation, memory, storage, simulation regressions
```

## Scheduling API

Import the typed API from `src/domain/scheduling.ts`. React is not a dependency of the engine. Future agents can use these functions without creating UI state:

- `evaluateSchedule(request, startHour, profile)` returns a priced schedule, its feasibility, and validation issues. Invalid or out-of-horizon schedules have no calculated totals.
- `getSchedulingOptions(request, profile)` returns every feasible start and recommendations for `cost`, `carbon`, and `balanced`. Results have `feasible`, `infeasible`, or `invalid-input` status. Baseline feasibility is reported separately.
- `optimizeHousehold(requests, profile, mode, sharedPowerLimitKw?)` searches combinations for one or two distinct flexible appliances, returning proposed schedules, original/proposed totals, and signed differences. No shared limit is imposed unless supplied explicitly. An infeasible household gets no partial proposal or misleading savings total.
- `compareSchedules(baseline, proposed)` returns baseline minus proposed cost and carbon. Negative savings/reductions are preserved.

A `SchedulingRequest` wraps an existing flexible appliance definition with an inclusive allowed **start** window and a fixed `baselineStartHour`. Appliance availability, start window, completion deadline, and timeline bounds must all be satisfied. Finishing after the latest allowed start is permitted; finishing after the completion deadline is not.

## Planning model and optimization

- Evie needs **12 kWh**, with configurable constant charging power (default 7 kW), availability from Day 1 at 6pm, and default completion by Day 2 at 7am. This version searches one uninterrupted charging session, with exact energy accounting for its partial final hour. It does not search split charging sessions or variable power.
- Bubbles runs a two-hour uninterrupted cycle using 1.2 kWh total. The default model distributes this evenly at 0.6 kW. Preferences can configure cycle duration, total energy, and an optional hourly kWh profile (one finite nonnegative value per cycle hour, summing to total energy). Profile power is modeled as constant within each hour; subhour spikes are excluded. Availability starts at Day 1 at 8pm; default completion is Day 2 at 7am.
- Chill remains in the project and is excluded from optimization and all reported flexible-appliance totals. AC scheduling needs a thermal and comfort model.
- The planning horizon is `[0, 48]`. Starts, availability, window boundaries, and deadlines are whole hours; end times may be fractional. Hour 31 is Day 2 at 7am. Hour 48 is the ending midnight boundary. A complete session must fit inside the horizon.
- The synthetic 24-hour profile repeats with `hour % 24` for Day 2. This is a fictional two-day scenario in America/Los_Angeles without an actual date or DST transition.
- Every feasible hourly start is enumerated. Cost-first minimizes total cost; carbon-first minimizes total emissions. Their secondary tie-breakers are carbon and cost respectively, then earliest starts.
- Balanced minimizes `0.5 × normalized cost + 0.5 × normalized carbon`, using min/max ranges across all feasible options (household combinations for household plans). A constant metric contributes zero. Ties prefer cost, then carbon, then earliest starts. Balanced is a stated preference, not a claim of universal optimality.
- When explicitly configured, a shared power limit applies only to Evie and Bubbles and is checked against actual overlapping active power, including partial hours. Other home loads are not modeled.

## Baseline and arithmetic

Original starts are Day 1 at 6pm for Evie and 8pm for Bubbles. Editing a window or deadline never shifts those reference starts. Both original and proposed schedules use the current energy requirement and power, isolating timing changes. An original schedule may violate newly edited constraints; it stays priced and is labeled infeasible. If the original cannot fit inside 48 hours, comparisons are unavailable rather than truncated.

Each occupied interval uses the shared arithmetic helper: `costUsd = kWh × $/kWh`, `carbonGrams = kWh × g CO₂e/kWh`. Totals and optimization use unrounded values. Only display values are rounded. Household savings are the sums of original minus proposed totals for the flexible appliances.

## Simulation contract and limitations

All appliance activity is simulated. Phone dialogue is scripted. No real telemetry, device control, live AI response, or measured savings is claimed. The integrated /household stores preferences, settings, recent planning conversation, training, and up to 12 saved input snapshots in this browser. The laboratory remains an isolated, session-only test tool. Saved totals are recomputed from validated inputs, not trusted from storage. Memory is not synchronized between devices.

`getSimulationStats(schedules, absoluteHour)` replays validated schedule intervals over hours 0–48. It accumulates interval energy, cost, and modeled emissions proportionally to elapsed active duration, preserving partial EV hours and zero-power dishwasher phases. Missing flexible-appliance schedules remain idle. These changing counters describe a fictional replay of a proposed schedule, not metered usage or completed real-world work. Scene lighting and sleeping poses do not establish AC status, indoor temperature, or device safety.

Energy data is hand-authored and synthetic, not a utility tariff, forecast, or live grid feed. It approximates a California weekday pattern: expensive 4–9pm electricity and lower midday carbon intensity. Currency is USD; carbon is estimated operational grid emissions in g CO₂e/kWh, not lifecycle emissions. Taxes, fixed charges, charging losses, exports, owned solar, demand charges, and other household loads are excluded. Results are estimates under these assumptions, not a complete bill or real-world carbon measurement.

Hourly starts, continuous constant-power EV charging, per-hour dishwasher profiles, and repeated Day 2 rates limit the optimizer. The judge-facing text interaction currently uses API placeholders. Simulation controls use deterministic intent rules rather than an LLM; unsupported or ambiguous domain requests ask for clarification. There is no device integration, account system, external energy feed, or multi-device synchronization.


## Conversation, memory, and training

The playable household scene accepts judge input into a clearly labeled local API-placeholder response. It makes no network/model request and does not change planning constraints. Separate quest buttons run the existing deterministic planner. The phone's scroll reveal and manual playback present a scripted sample, not a live chat. Temporary scene playback and placeholder text are separate from persisted household preferences and saved plans.

The underlying deterministic conversation API accepts whole-hour AM/PM deadlines, inclusive start windows, explicit Day 1/Day 2 qualifiers, cost/carbon/balanced objectives, revisions, rejections, calculation explanations, and approval. “Don’t run the dishwasher after 10 PM” is a completion cutoff at hour 22. Breakfast defaults to Day 2 at 7am; an earlier remembered cutoff stays enforced. Use Preferences for energy, power, duration, consumption profile, and shared limits.

`sendHouseholdMessage` and `updateHouseholdSettings` are pure conversation entry points. The optimizer supplies all schedule figures. A proposal fingerprint binds approval to current planning inputs; stale, rejected, or infeasible proposals cannot be saved. Approval saves a simulated plan only and sends no physical commands.

Browser storage uses a versioned, bounded schema. Malformed state recovers with an explanation; infeasible but structurally valid settings remain editable. Reads/writes/removal failures fall back to session-only state with truthful notices. Reset Demo clears only this app’s browser memory, with confirmation and failure handling. Old context is pruned rather than growing without bound. No secrets or authentication are involved.

Unique useful actions award 25 XP, with levels at 0/50/100/175 XP. Duplicate rewards are suppressed. Level 2 unlocks a remembered-routine shortcut (comfort guidance for Chill); level 3 links to objective comparison; level 4 links to household routines and settings. Core planning is never locked. Lessons and self-reports are labeled as learning/habit actions, never verified savings. Reset returns all progress to defaults.

## Autonomous workflow and handoff

[SPEC.md](SPEC.md) contains product and acceptance requirements; [PLAN.md](PLAN.md) defines phases, ownership, and dependencies; [PROGRESS.md](PROGRESS.md) records actual findings, repairs, checks, and checkpoints; [AGENTS.md](AGENTS.md) contains concise coding/testing/safety/coordination rules. Native specialists work on disjoint files. Each bounded task follows implement → verify → inspect → repair → reverify → independent review → integrate → checkpoint → continue. No external orchestration framework or documentation package is required.

Public deployment and remote pushes are not part of this local mission. Use `npm run build` then `npm start` for a production preview after stopping the development server occupying that port, or choose another explicit local port. Do not interrupt an already-working demo unnecessarily.

## Guided demo

Open `/demo`, or choose **Join the demo** on the homepage. Pip guides region, residence, synthetic weather and appliance-team setup while the 3D world assembles. Optional camera/photo suggestions run on-device in a worker; first use downloads about 190 MB. Manual confirmation is always required. Region/home/team/weather choices save separately from existing household plans.

See [ONBOARDING.md](ONBOARDING.md) for the pipeline, model/data boundaries, architecture and review workflow. Weather is synthetic only; messaging-platform integration is deferred. The only new runtime dependency for this milestone is `@huggingface/transformers`; the existing Three.js renderer is extended.
