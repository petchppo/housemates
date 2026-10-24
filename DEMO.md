# Housemates — 3D household demo

Open **http://localhost:3000/household**. The introduction remains at **http://localhost:3000** and the scheduling laboratory at **http://localhost:3000/energy-parliament**.

## Run locally

Keep a healthy localhost:3000 server running. Otherwise:

```sh
npm install
npm run dev -- --hostname 0.0.0.0
```

No API key, account, paid service, or connected hardware is needed. A phone on the same Wi-Fi can use `http://<laptop-LAN-IP>:3000/household`; guest networks may block this. Each browser has its own memory.

## The 90-second presentation

| Time | Action | Explain |
| --- | --- | --- |
| 0–15s | Open the household and scroll through its 3D scene. Select an appliance; demonstrate a small drag or zoom. | “This is a modeled 3D household. Scrolling follows a simulated day and a gentle front-facing camera arc. No device is connected.” |
| 15–25s | Continue to the command deck; type into **Say something to your party** and press Enter. | “The AI connection is pending. This local placeholder reply does not change our schedule.” |
| 25–40s | Select **Plan the morning**, then **Quiet after 10pm**. Inspect the newly calculated proposal after each action. | These buttons run the deterministic optimizer. The second action sets Bubbles’ completion cutoff to Day 1 at 10pm. Read the actual results rather than promising fixed savings. |
| 40–50s | Return to the world and use **Jump to job**, then Play or the time slider. Point to the pixel status panel. | “These kW, kWh, cost, and modeled carbon counters replay the proposed schedule. They are calculated simulation values, not telemetry.” Chill remains excluded. |
| 50–65s | Continue down to the phone section. Scroll to reveal its messages, or select **Show all**. | “The phone stays in view while the demonstration conversation unfolds.” One outside disclosure identifies the pending AI connection. |
| 65–80s | Continue to the proposal, use **Inspect calculations** or **The plan**, compare the baseline and Day 2 timeline, then **Approve & save**. | Energy × each occupied hour’s synthetic rate determines cost/carbon. The fixed baseline preserves an honest comparison. Approval saves a simulated plan and sends no hardware command. |
| 80–90s | Refresh. Show the saved cutoff/plan, then **Meet & train**. | Preferences and training persist. Level 2 provides a remembered-routine shortcut; core optimization is always available. |

Quest controls are separate from the API-placeholder composer. Their computed reasoning remains inspectable under **Planning history & calculation notes**. The phone sample contains no savings claims. Use **Skip** to move past either pinned scene when presenting quickly.

## Scroll and keyboard alternatives

- Ordinary page scrolling drives the two separate scenes; there is no wheel/touch scroll trap. The world keeps a gentle front-facing arc rather than automatically revolving through 360 degrees.
- Drag the 3D world to explore. Focus the canvas for arrow-key rotation, `+`/`−` zoom, and `Home` to reset; use appliance buttons for selection.
- Scrolling follows Day 1 at 8am through Day 2 at 8am. The time slider, Play/Pause, Day/Night, and **Jump to job** switch to direct control; **Scroll time** restores scroll following. Camera changes and playback do not change scheduling constraints or approve a plan. Reduced-motion and short-viewport fallbacks keep the manual clock.
- The phone offers **Next message**, **Show all**, and **Restart**. After a manual action, **Follow scroll** restores scroll-driven playback.
- Reduced-motion settings and short viewports disable pinning. The phone initially shows all four messages, and the sections remain reachable through ordinary scrolling.

## Reset and repeat

**Reset Demo → Reset household** clears only this app’s preferences, saved plans, stored planning history, training, and current scene preview. Escape or **Keep my household** cancels. Storage failures are reported honestly. Check **Memory saved on this browser** before promising refresh persistence.

## Extra functional checks

- **Preferences** edits EV energy/power/window/deadline, dishwasher cycle/consumption profile/window/deadline, objective, and optional shared power cap.
- A dishwasher deadline of Day 1 at 9pm conflicts with its default 8pm earliest start and two-hour cycle. The proposal explains infeasibility and cannot be approved. Restore 10pm.
- For cost/carbon tradeoffs, set Evie power to 3 kW, latest start to Day 2 noon, deadline Day 2 at 4pm. Compare the three independently calculated objectives in **The plan**.
- A dishwasher profile `0.9, 0.3` models two hourly phases totaling 1.2 kWh. Incorrect totals trigger validation feedback.
- Rejection withdraws approval. **Recalculate using current preferences** creates a fresh proposal while honoring remembered constraints.
- Selecting characters, exploring the 3D camera, replaying time, advancing phone messages, or typing in the placeholder composer never changes a saved energy plan.
- At night, nonactive characters may display sleeping poses. These are visual states: Chill's pose does not mean real cooling is off or that a comfort limit has been satisfied.

## Honest boundaries

Synthetic prices and carbon intensity repeat over 48 fictional hours. Carbon is a modeled average-intensity estimate, not measured or necessarily avoided marginal emissions. Taxes, fixed charges, charging losses, other loads, and AC savings are excluded. Chill has no thermal model and is not optimized. No external model/network request is made for the preview reply. The underlying deterministic intent API remains available for future agent integration.

The world uses Three.js/WebGL; the phone frame uses CSS 3D. Both are local visual demonstrations. Scene statistics come from schedule intervals, including partial hours, rather than fabricated activity or hardcoded savings. This document is a presentation guide; PROGRESS.md records the checks and visual reviews actually completed for each checkpoint. Browser-sized mobile testing is not a claim of testing physical smart-home hardware.

## Guided onboarding demonstration (about 2 minutes)

1. From `/`, choose **Join the demo**. Pick Bangkok to see palms and the island drop into place. Pip introduces each step.
2. Choose **Build here**, then **Apartment** and **Place my home**. Use Replay build to repeat the construction, or Finish build to skip it.
3. Inspect the **synthetic** weather card. Increase the temperature with Try a different day and compare illustrative background cooling demand. This is separate from appliance savings.
4. Choose **Meet my team**, then recruit Evie and Bubbles. Each lands in the scene. Chill remains optional and excluded from optimization.
5. Optional camera path: Add from a photo or camera → Choose a photo / Take a photo → Suggest appliance on this device. Allow the first-use model download in advance of a live judging demo. Inspect the suggestion, manually choose the matching appliance, then Confirm housemate. No photo leaves the device. Manual selection also works without any model download.
6. Choose **Move in**. Switch cost/carbon/balanced objectives and scrub the simulation clock. Explain that rates and appliance activity are simulated, while calculations actually run.
7. Refresh and use Continue saved home to verify setup persistence. Messaging-platform integration is explicitly the next chapter.
