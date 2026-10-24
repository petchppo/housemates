# Housemates — interactive design demo

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
| 0–15s | Open the household. Select Evie, Bubbles, and Chill in the miniature scene; toggle Day/Dusk. | “These are original simulated characters. The visual world responds to interaction; no device is connected.” |
| 15–30s | Type a request into “What would you tell your housemates?” and press Enter or the preview arrow. | “The AI API is not connected yet. This is explicitly a placeholder reply, and typing here does not change constraints.” |
| 30–40s | Point to the dimensional phone. Use **View straight on** to read the sample. | “This conversation is a scripted preview of the future experience.” |
| 40–55s | Select **Plan the morning**, then **Set a quiet evening** under **Local simulation**. | These buttons run the real deterministic optimizer. The second action sets Bubbles’ completion cutoff to Day 1 at 10pm. The browser focuses and scrolls to the calculated proposal. |
| 55–70s | Select **Inspect calculations** or **The plan**; compare original/proposed sessions and switch the timeline to Day 2. | Energy × each occupied hour’s synthetic rate determines costs/carbon. The baseline stays fixed. Read the actual numbers; do not promise fixed results. |
| 70–80s | Return to **Parliament**, then **Approve & save**. | A feasible input snapshot is saved locally. No hardware command is sent. |
| 80–90s | Refresh. Show saved cutoff/plan, then **Meet & train**. | Preferences and training persist. The level 2 remembered-routine shortcut creates a new validated proposal. |

Simulation controls are separate from the API-placeholder composer. Their computed reasoning remains inspectable under **Planning history & calculation notes**. The phone sample contains no savings claims.

## Reset and repeat

**Reset Demo → Reset household** clears only this app’s preferences, saved plans, stored planning history, training, and current scene preview. Escape or **Keep my household** cancels. Storage failures are reported honestly. Check **Memory saved on this browser** before promising refresh persistence.

## Extra functional checks

- **Preferences** edits EV energy/power/window/deadline, dishwasher cycle/consumption profile/window/deadline, objective, and optional shared power cap.
- A dishwasher deadline of Day 1 at 9pm conflicts with its default 8pm earliest start and two-hour cycle. The proposal explains infeasibility and cannot be approved. Restore 10pm.
- For cost/carbon tradeoffs, set Evie power to 3 kW, latest start to Day 2 noon, deadline Day 2 at 4pm. Compare the three independently calculated objectives in **The plan**.
- A dishwasher profile `0.9, 0.3` models two hourly phases totaling 1.2 kWh. Incorrect totals trigger validation feedback.
- Rejection withdraws approval. **Recalculate using current preferences** creates a fresh proposal while honoring remembered constraints.
- Selecting characters, changing the illustration’s lighting, rotating the phone, or typing in the placeholder composer never changes a saved energy plan.

## Honest boundaries

Synthetic prices and carbon intensity repeat over 48 fictional hours. Carbon is a modeled average-intensity estimate, not measured or necessarily avoided marginal emissions. Taxes, fixed charges, charging losses, other loads, and AC savings are excluded. Chill has no thermal model and is not optimized. No external model/network request is made for the preview reply. The underlying deterministic intent API remains available for future agent integration.

PROGRESS.md records actual automated checks and desktop/mobile visual-review evidence. Browser-sized mobile testing is not a claim of testing physical smart-home hardware.
