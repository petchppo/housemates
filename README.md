# Housemates

A Stanford CleanTech hackathon prototype for household energy planning. Built with Next.js App Router, TypeScript, and Tailwind CSS. No smart-home hardware, credentials, or external services are needed.

## Run locally

Requires Node.js 20.9+ and npm.

```sh
npm install
npm run dev -- --hostname 0.0.0.0
```

Open http://localhost:3000 for the original homepage and http://localhost:3000/energy-parliament for the scheduling laboratory. The homepage also links to Energy Parliament.

For a phone on the same Wi-Fi, use the laptop's local IP address, e.g. http://192.168.1.10:3000/energy-parliament. Some guest networks block connections between devices.

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
  components/
    appliance-icon.tsx         Shared appliance artwork
    energy-parliament.tsx      Interactive controls and result presentation
  domain/
    appliances.ts              Agent identities and device-specific constraints
    energy.ts                  Shared cost/carbon arithmetic
    scheduling.ts              Pure validation, schedule evaluation, search, comparisons
  data/
    appliances.ts              Three simulated appliance definitions
    energy.ts                  Existing 24-hour synthetic energy profile
    scheduling.ts              Default windows and fixed baseline starts
tests/scheduling.test.ts        Automated domain tests
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
- Bubbles runs a two-hour uninterrupted cycle using 1.2 kWh total. The model distributes this evenly at 0.6 kW. Availability starts at Day 1 at 8pm; default completion is Day 2 at 7am.
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

All appliance activity is simulated. Homepage dialogue is scripted. No real telemetry, device control, AI conversation, or measured savings is claimed. Planning inputs live in browser memory and reset on refresh.

Energy data is hand-authored and synthetic, not a utility tariff, forecast, or live grid feed. It approximates a California weekday pattern: expensive 4–9pm electricity and lower midday carbon intensity. Currency is USD; carbon is estimated operational grid emissions in g CO₂e/kWh, not lifecycle emissions. Taxes, fixed charges, charging losses, exports, owned solar, demand charges, and other household loads are excluded. Results are estimates under these assumptions, not a complete bill or real-world carbon measurement.

Hourly start resolution, constant power, uninterrupted EV charging, and the repeated Day 2 profile limit what the optimizer can explore. There is no persistence, AI chat, gamification, or device integration.
