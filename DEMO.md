# Housemates demo runbook

Status: execution draft. Final steps and evidence will be updated after the integrated browser demonstration.

## Start

```sh
npm install
npm run dev -- --hostname 0.0.0.0
```

Use the existing server if already running. Homepage: http://localhost:3000. Scheduler laboratory: http://localhost:3000/energy-parliament. Integrated household demo planned at http://localhost:3000/household. On a phone use the laptop's LAN IP on the same Wi-Fi.

## Target 90-second demonstration

1. 0–10s: Open homepage, introduce Evie, Bubbles, and comfort-protecting Chill. State that appliance activity and energy data are simulated.
2. 10–25s: Open household chat and request: “I need my EV charged by 7 AM and my dishes finished before breakfast. Minimize my energy costs.” Explain that actual code evaluates feasible schedules.
3. 25–40s: Inspect proposed start/end times, costs, and modeled carbon; original and proposed schedules use the same energy requirements.
4. 40–55s: Send: “I don't want the dishwasher running after 10 PM.” Watch constraints and the computed plan change.
5. 55–65s: Inspect the revised plan and approve/save. Show signed differences, including increases where appropriate.
6. 65–80s: Show training progress and a usable preference shortcut; refresh and verify Bubbles remembers the cutoff.
7. 80–90s: Request another plan from remembered preferences; show Reset Demo so judges can repeat the presentation.

## Honest framing

No real appliances, verified consumption, or measured savings. Synthetic prices and modeled average grid-intensity emissions are illustrative. Carbon changes are not necessarily physically avoided marginal emissions. Chill is not optimized. Core optimization and persistence must work without API keys.

## Recovery and optional tradeoff demonstration

Use Reset Demo to restore defaults, not manual browser storage edits. If storage is blocked, the app must remain usable and explain that memory is limited to the current session. The laboratory can demonstrate distinct objectives by using Evie at 3 kW with a Day 2 4pm deadline and Day 2 noon latest start. Do not recite fixed numerical savings; inspect actual current results.
