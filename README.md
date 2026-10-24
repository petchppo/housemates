# Housemates

A Stanford CleanTech hackathon prototype for household energy planning. Built with Next.js App Router, TypeScript, and Tailwind CSS. No smart-home hardware, credentials, or external services are needed.

## Run locally

Requires Node.js 20.9+ and npm.

```sh
npm install
npm run dev -- --hostname 0.0.0.0
```

Open http://localhost:3000 on the laptop. For a phone on the same Wi-Fi, use the laptop's local IP address, e.g. http://192.168.1.10:3000. Some guest networks block connections between devices.

```sh
npm run lint
npm run typecheck
npm run build
```

## Architecture

```text
src/
  app/                     Routes, layout, and global styles
  components/              Reusable presentation components
  domain/
    appliances.ts          Agent identities and device-specific constraints
    energy.ts              Hourly types and pure cost/carbon arithmetic
  data/
    appliances.ts          Three local, simulated appliance definitions
    energy.ts              Deterministic 24-hour synthetic energy scenario
```

Keep domain logic independent of React. The next milestone is a pure deterministic scheduling module in `src/domain/`, followed by a UI comparing baseline and proposed schedules. Optional LLM dialogue should explain scheduler results; it should not calculate authoritative costs or bypass constraints. AC comfort requires explicit thermal assumptions before scheduling.

## Implemented now

- Responsive introduction, appliance cards, scripted chat preview, and inspectable hourly data.
- Evie (EV): 14 kWh needed, 7 kW limit, available at 6pm, ready by 7am the next day.
- Bubbles (dishwasher): uninterrupted two-hour cycle, 1.2 kWh total, available at 8pm, finished by 7am the next day.
- Chill (AC): illustrative 1.5 kW power, occupied from 5–11pm, comfort target 22–25°C. This is a constraint definition, not a thermal model.
- Working arithmetic: `costUsd = kWh × $/kWh`; `carbonGrams = kWh × g CO₂e/kWh`. Intermediate values remain unrounded; display values are rounded.

## Simulation contract

All appliance states and messages are fictional. There is no device control, actual AI conversation, scheduling engine, or measured savings in this starter.

Energy data is hand-authored and synthetic, not a utility tariff, forecast, or live grid feed. It approximates a California weekday pattern: expensive 4–9pm electricity and lower midday carbon intensity. Currency is USD; carbon is estimated operational grid emissions in g CO₂e/kWh, not lifecycle emissions. Taxes, fixed charges, exports, solar ownership, and demand charges are excluded.

The scenario has 24 one-hour intervals in America/Los_Angeles, with no actual calendar date or DST transition. Hours start at midnight; each interval is `[hour, hour + 1)`. Appliance planning hours can exceed 23: hour 31 is 7am the next day. A future overnight planner can repeat this fictional profile using `planningHour % 24`; this is a demo assumption, not a next-day forecast.

## Scope for later

Constraint-aware scheduling, baseline comparisons, household chat interactions, persistence, and optional LLM integration. No API keys are required for this first milestone.
