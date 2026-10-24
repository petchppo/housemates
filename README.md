# Housemates

A Stanford CleanTech hackathon prototype for household energy planning. Built with Next.js App Router, TypeScript, Tailwind CSS, and Three.js. Explore an original 3D household, replay a calculated energy plan, and meet its pixel-art appliance characters. No smart-home hardware or paid AI API is required. Public city weather is optional with a labeled synthetic fallback; photo assistance downloads local inference assets, and iMessage requires a separately configured bridge.

## Run locally

Requires Node.js 20.9+ and npm.

```sh
npm install
npm run dev -- --hostname 0.0.0.0
```

Open [http://localhost:3000](http://localhost:3000). The landing page is a short scroll story: a front-facing 3D world, a dimensional phone that reveals messages, and **Join the demo** links at the top and bottom. Native sticky sections keep the scene visible while it animates; Skip, manual playback, keyboard controls and reduced-motion alternatives remain available. The phone story is scripted, not a live conversation.

| Route | Purpose |
| --- | --- |
| `/` | Simple world-and-phone introduction |
| `/demo` | City, residence, forecast, team and move-in setup |
| `/demo/home` | Saved household, modeled stats, planning, typed commands and browser voice |
| `/demo/scan` | Photo/manual category → reviewed specifications → saved household recruitment |
| `/household` | Existing household conversation, preferences and memory experience |
| `/energy-parliament` | Isolated scheduling laboratory |

For a phone on the same Wi-Fi, use the laptop's LAN address, for example `http://192.168.1.10:3000/demo/scan`; `localhost` on the phone refers to the phone itself. Some guest networks block peer connections. Browser camera/microphone APIs may require HTTPS; the photo file picker and manual path remain available, but camera capture availability depends on the phone/browser. Phone and laptop browser storage are separate. A category-only transfer link requires fresh specification review on the destination; it does not synchronize a household or transfer a photo.

See [ONBOARDING.md](ONBOARDING.md) for the current guided flow and [PROGRESS.md](PROGRESS.md) for actual verification and checkpoints. [DEMO.md](DEMO.md) preserves the earlier household presentation script.

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
    demo/                      Setup, completed home and phone recruitment
    api/weather/route.ts       Validated public-city forecast proxy
    api/imessage/route.ts      Optional configured bridge transport
    energy-parliament/page.tsx Scheduling test route
    household/page.tsx         Integrated conversation/demo route
  components/
    demo-onboarding.tsx        Guided construction and validated setup
    appliance-scan.tsx         Phone/manual recruitment and saved-world merge
    applimon-spec-capture.tsx  Reviewed specs, optional local nameplate OCR
    applimon-team-panel.tsx    Additional-party plans and session-only execution
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
    applimon-catalog.ts        Ten categories, safety policies and passport validation
    applimon-planning.ts       Generic additional-party requests and comparisons
    appliance-recruitment.ts  Duplicate-safe confirmed recruitment
    nameplate.ts              Conservative explicit-unit OCR text parser
    demo-weather.ts           Forecast normalization, freshness and fallback
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

The existing Evie/Bubbles API below remains the core planner. `src/domain/applimon-planning.ts` adds typed generic planning over validated `ApplimonDevice` passports. The demo passes the seven additional categories separately to avoid counting core jobs twice. React is not a dependency of either engine.

Import the typed API from `src/domain/scheduling.ts`. React is not a dependency of the engine. Future agents can use these functions without creating UI state:

- `evaluateSchedule(request, startHour, profile)` returns a priced schedule, its feasibility, and validation issues. Invalid or out-of-horizon schedules have no calculated totals.
- `getSchedulingOptions(request, profile)` returns every feasible start and recommendations for `cost`, `carbon`, and `balanced`. Results have `feasible`, `infeasible`, or `invalid-input` status. Baseline feasibility is reported separately.
- `optimizeHousehold(requests, profile, mode, sharedPowerLimitKw?)` searches combinations for one or two distinct flexible appliances, returning proposed schedules, original/proposed totals, and signed differences. No shared limit is imposed unless supplied explicitly. An infeasible household gets no partial proposal or misleading savings total.
- `compareSchedules(baseline, proposed)` returns baseline minus proposed cost and carbon. Negative savings/reductions are preserved.

A `SchedulingRequest` wraps an existing flexible appliance definition with an inclusive allowed **start** window and a fixed `baselineStartHour`. Appliance availability, start window, completion deadline, and timeline bounds must all be satisfied. Finishing after the latest allowed start is permitted; finishing after the completion deadline is not.

## Core planning model and optimization

These defaults describe the original fixtures. Reviewed demo passports can override core power, task energy, duration, baseline and availability; the laboratory and legacy household retain their own validated settings.

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

All appliance activity is simulated. Landing-page phone dialogue is scripted; completed-demo chat uses deterministic commands and calculated replies. No real telemetry, device control, live AI response, or measured savings is claimed. The integrated /household stores preferences, settings, recent planning conversation, training, and up to 12 saved input snapshots in this browser. The laboratory remains an isolated, session-only test tool. Saved totals are recomputed from validated inputs, not trusted from storage. Memory is not synchronized between devices.

`getSimulationStats(schedules, absoluteHour)` replays validated schedule intervals over hours 0–48. It accumulates interval energy, cost, and modeled emissions proportionally to elapsed active duration, preserving partial EV hours and zero-power dishwasher phases. Missing flexible-appliance schedules remain idle. These changing counters describe a fictional replay of a proposed schedule, not metered usage or completed real-world work. Scene lighting and sleeping poses do not establish AC status, indoor temperature, or device safety.

Electricity price and carbon data are hand-authored and synthetic, not a utility tariff or live grid feed. The guided demo can use a real public-city weather forecast; that does not turn its rates, household thermal model or appliance activity into measurements. It approximates a California weekday pattern: expensive 4–9pm electricity and lower midday carbon intensity. Currency is USD; carbon is estimated operational grid emissions in g CO₂e/kWh, not lifecycle emissions. Taxes, fixed charges, charging losses, exports, owned solar, demand charges, and other household loads are excluded. Results are estimates under these assumptions, not a complete bill or real-world carbon measurement.

Hourly starts, continuous constant-power EV charging, per-hour dishwasher profiles, and repeated Day 2 rates limit the optimizer. The legacy household scene retains its labeled API-placeholder interaction; the completed demo has working local planning commands. Simulation controls use deterministic intent rules rather than an LLM; unsupported or ambiguous domain requests ask for clarification. There is no device integration, account system, external energy feed, or multi-device synchronization.


## Conversation, memory, and training

The playable household scene accepts judge input into a clearly labeled local API-placeholder response. It makes no network/model request and does not change planning constraints. Separate quest buttons run the existing deterministic planner. The phone's scroll reveal and manual playback present a scripted sample, not a live chat. Temporary scene playback and placeholder text are separate from persisted household preferences and saved plans.

The underlying deterministic conversation API accepts whole-hour AM/PM deadlines, inclusive start windows, explicit Day 1/Day 2 qualifiers, cost/carbon/balanced objectives, revisions, rejections, calculation explanations, and approval. “Don’t run the dishwasher after 10 PM” is a completion cutoff at hour 22. Breakfast defaults to Day 2 at 7am; an earlier remembered cutoff stays enforced. Use Preferences for energy, power, duration, consumption profile, and shared limits.

`sendHouseholdMessage` and `updateHouseholdSettings` are pure conversation entry points. The optimizer supplies all schedule figures. A proposal fingerprint binds approval to current planning inputs; stale, rejected, or infeasible proposals cannot be saved. Approval saves a simulated plan only and sends no physical commands.

Browser storage uses a versioned, bounded schema. Malformed state recovers with an explanation; infeasible but structurally valid settings remain editable. Reads/writes/removal failures fall back to session-only state with truthful notices. Reset Demo clears only this app’s browser memory, with confirmation and failure handling. Old context is pruned rather than growing without bound. No secrets or authentication are involved.

Unique useful actions award 25 XP, with levels at 0/50/100/175 XP. Duplicate rewards are suppressed. Level 2 unlocks a remembered-routine shortcut (comfort guidance for Chill); level 3 links to objective comparison; level 4 links to household routines and settings. Core planning is never locked. Lessons and self-reports are labeled as learning/habit actions, never verified savings. Reset returns all progress to defaults.

## Autonomous workflow and handoff

[SPEC.md](SPEC.md) contains product and acceptance requirements; [PLAN.md](PLAN.md) defines phases, ownership, and dependencies; [PROGRESS.md](PROGRESS.md) records actual findings, repairs, checks, and checkpoints; [AGENTS.md](AGENTS.md) contains concise coding/testing/safety/coordination rules. Native specialists work on disjoint files. Each bounded task follows implement → verify → inspect → repair → reverify → independent review → integrate → checkpoint → continue. No external orchestration framework or documentation package is required.

Public deployment and remote pushes are not part of this local mission. Use `npm run build` then `npm start` for a production preview after stopping the development server occupying that port, or choose another explicit local port. Do not interrupt an already-working demo unnecessarily.

## Guided demo and expanded party

Open `/demo`, or choose **Join the demo**. Pip guides region, residence, forecast and team setup while the original low-poly world assembles. Six authored city scenes include symbolic cultural landmarks. **Finish build & enter home** opens `/demo/home`; Skip animation only completes the visual construction.

The forecast requests current outdoor conditions and two local calendar days from Open-Meteo through `/api/weather`. The card identifies the source, city timezone and snapshot time. Invalid, stale or unavailable data yields an explicit synthetic fallback; Synthetic what-if remains selectable. Weather influences illustrative building heating/cooling, never a real thermostat. Prices, carbon intensity and regional USD multipliers remain authored examples. Refresh is explicit; snapshots are not silently polled underneath an approved plan. The scheduling horizon remains 48 modeled hourly slots; DST-length days are not represented.

Ten Applimon categories are available:

| Applimon | Appliance | Planning policy |
| --- | --- | --- |
| Evie | EV charger | Flexible uninterrupted charge |
| Bubbles | Dishwasher | Flexible uninterrupted cycle |
| Chill | Air conditioner | Protected; illustrative weather-driven trace only |
| Spin | Washer | Flexible cycle |
| Tumble | Dryer | Flexible cycle; no automatic washer dependency |
| Ember | Water heater | Protected; no temperature or heating changes |
| Misty | Dehumidifier | Explicit optional timed task; no humidity guarantee |
| Rover | Robot vacuum | Flexible modeled task |
| Frost | Refrigerator | Protected; no cooling changes |
| Breeze | Fan | Fixed routine; no automatic shifting |

A reviewed appliance **passport** stores electrical rating in W, task energy in kWh, duration, original start, available start window and completion deadline. Category recognition cannot establish these values. Enter them manually, explicitly load illustrative settings, or review candidates from optional local nameplate OCR. Rated power alone is not cycle energy; the full-rated-power estimate is a separate explicit choice. One device per category is supported. Confirmed passports persist in the browser and drive deterministic scheduling; photos and OCR text do not persist.

`/demo/scan` supports camera/file input or manual selection, optional local SigLIP suggestions for ten categories, specification review and explicit recruitment into the saved world. It rereads the latest profile before merging and prevents duplicate category loads. The seven additional categories have original pixel portraits and low-poly models. Photos select an existing category model; they do not generate a custom 3D scan.

Additional-party planning supports cost, carbon and balanced objectives, signed baseline comparisons, deadline/window revisions and explicit approval before simulated execution. Protected categories are excluded from optimized totals; fixed fan usage is reported separately and unchanged. No shared power limit or washer/dryer dependency is invented. **Additional-party chat revisions and execution are session-only**; reviewed passports persist, and reloading requires a new approval. Core Evie/Bubbles chat retains its separate validated run persistence. This distinction is visible in the party panel.

See [ONBOARDING.md](ONBOARDING.md) and [RECOGNITION.md](RECOGNITION.md) for source boundaries, data handling and actual evidence. Physical-phone camera behavior and real appliance nameplate accuracy have not been verified in this revision; a synthetic label was tested with the real OCR engine. No ten-category recognition accuracy benchmark is claimed.

## Interactive appliance chat, calls and Messages

After setup, `/demo/home` offers typed requests and **Call → Listen → review transcript → Send** for the core team. Optional reply readout uses browser speech. Review calculated timing/cost/carbon, then **Approve & run simulation**. Preview scrubbing never executes tasks. Typed or spoken approval text cannot replace the current-proposal approval button.

No AI API key is required. This is a deterministic command assistant with optional browser voice, not a general-purpose LLM or connected appliance service. Voice support depends on the browser and may use its remote speech provider. See [VOICE.md](VOICE.md).

An optional iMessage pipeline is implemented for an owner-configured BlueBubbles Mac bridge. Without credentials it displays **Not connected**. It has not been provisioned or tested with real message delivery. Its current transport addresses Evie, Bubbles and Chill; the expanded party uses the in-app panel. Pairing, foreground-tab requirements, credentials and approval boundaries are documented in [IMESSAGE.md](IMESSAGE.md). No bridge account or additional MCP is supplied by this repository.
