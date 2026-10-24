# Housemates — verified 90-second demo

The complete demo runs at **http://localhost:3000/household**. Start from **http://localhost:3000** to introduce the characters. The isolated scheduling laboratory remains at **http://localhost:3000/energy-parliament**.

## Start or resume

If the existing localhost:3000 development server is working, keep it running. Otherwise:

```sh
npm install
npm run dev -- --hostname 0.0.0.0
```

No API key, paid service, hardware, or account is needed. For a phone on the same Wi-Fi, use `http://<laptop-LAN-IP>:3000/household`. The phone has its own local memory; there is no synchronization. A guest network may block laptop-to-phone connections.

## Before presenting

Open Appliance Parliament and select **Reset Demo → Reset household**. It resets only this app’s local conversation, preferences, saved plans, and training. Check the “Memory saved on this browser” status. If storage is blocked, the app still works but explicitly warns that changes may not survive refresh.

## The 90-second script

| Time | Action | Explain |
| --- | --- | --- |
| 0–10s | Open the homepage; point out Evie, Bubbles, and Chill. Click **Enter Appliance Parliament ↗**. | “This is a simulated home, with synthetic rates. The scheduling math and interactions are functional.” |
| 10–25s | Click **Plan my morning**, or send: “I need my EV charged by 7 AM and my dishes finished before breakfast. Minimize my energy costs.” | The optimizer searches feasible hours. Each character explains its actual computed session. Breakfast defaults explicitly to Day 2 at 7am. |
| 25–40s | Click **Inspect calculations**. Switch **View day** to Day 2, open **Hourly calculation details**, and inspect original/proposed costs and carbon. | Every occupied hour contributes energy × rate; midnight and partial charging hours are handled. Carbon is a modeled estimate, not measured avoidance. |
| 40–55s | Return to **Parliament**. Send: “I don't want the dishwasher running after 10 PM.” Or click **Quiet after 10pm**. | Bubbles now must finish by Day 1 at10pm. The system recalculates instead of playing a fixed transcript. The constraint does not shift the baseline. |
| 55–65s | Inspect the revised proposal and click **Approve & save**. | A validated input snapshot is saved; no appliance command is sent. Show the training update. |
| 65–80s | Open **Meet & train**. Evie and Bubbles have reached level2. Refresh the page. | The saved plan, conversation, XP, and Bubbles’ 10pm cutoff remain. No fake new reward appears merely from refreshing. |
| 80–90s | Open **Meet & train** and click Bubbles’ **Use remembered routine ↗**. | The shortcut creates a new feasible proposal using the remembered cutoff. Point out Reset Demo for replay. |

Do not promise fixed dollar results: read the calculated numbers currently shown. Editing power, energy, profiles, windows, or objectives changes the result. Positive savings/reduction means improvement; negative means an increase. Infeasible plans cannot be approved.

## Optional tradeoff extension

In **Preferences**, set Evie charging power to3 kW, latest start to Day 2 noon, and completion deadline to Day 2 at4pm. Apply settings. Open **The plan** and compare the cost-first and carbon-first alternatives. They use the same energy with different costs and modeled emissions. Select an objective to create a new proposal. Leave Bubbles’ quiet-hours cutoff intact.

A nonuniform dishwasher profile can be demonstrated by entering `0.9, 0.3` with a two-hour cycle and1.2 kWh total. Invalid totals produce validation feedback. Explain that this models hourly averages, not instantaneous device readings.

## Recovery and boundaries

- Unknown language asks for clarification; use explicit AM/PM, whole hours, and Day1/Day2 for clarity. Use Preferences for energy, power, cycle, and shared limits.
- **Reject** withdraws approval availability. **Revise** searches again using current constraints.
- An impossible deadline produces a clear explanation and no fabricated savings. Return to the known-good cutoff or Reset Demo.
- **Reset Demo** uses a named native dialog: Escape cancels; confirmation clears the app’s stored state. Failed storage clearing is reported honestly.
- Chill’s comfort is protected by exclusion from optimization. No thermal model, actual room telemetry, device integration, or AC savings are claimed.
- The deterministic conversation is not an LLM. No messages leave the browser for a model/API. Local storage is per browser and can be cleared.
- The energy horizon is48 fictional hours with repeated synthetic rates, not a live next-day forecast or a full electricity bill.

## Verification evidence

Lead browser run: homepage navigation; exact two-message negotiation; interval table; approval/save; level2 unlock; refresh persistence; remembered shortcut; rejection/revision; impossible deadline; variable charging power and dishwasher profile; objective tradeoff; 390px mobile layouts; keyboard Enter sending; reset dialog focus and Escape; confirmed reset and refresh; repeatable demo. No runtime errors observed. A Next.js smooth-scroll configuration warning found during testing was repaired using bundled Next.js16 guidance.

Automated evidence and exact Git checkpoints are recorded in PROGRESS.md.
