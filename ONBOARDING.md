# Housemates guided demo

Entry: **Join the demo** on `/`, or `/demo`. The existing `/household` and `/energy-parliament` remain separate, working experiences. Setup never replaces an existing household plan.

## User pipeline

1. **Region.** Choose a public city preset: San Francisco, London, Bangkok, Tokyo, Oslo or Sydney. The island, paths and regional planting fall into place. Each preset selects original procedural scenery and declared synthetic electricity/carbon factors. These are examples, not reconstructed geography, real tariffs or national averages.
2. **Residence.** Choose apartment, townhouse or detached home. The building and roof drop onto the island. Residence selects a disclosed illustrative background-demand coefficient, not a calibrated thermal model.
3. **Weather.** Inspect an authored 24-hour synthetic temperature/humidity card. Adjust temperature by −10…+10°C and choose clear/cloud/rain/snow scenery. Temperature/humidity affect illustrative background heating/cooling; visual weather codes do not invent energy effects. No live-weather or geolocation call is made by the demo.
4. **Team.** Toggle Evie, Bubbles and Chill, or open local photo setup. Every addition lands in the world. A photo can receive an optional on-device model suggestion, followed by explicit manual type selection and confirmation. Photos never determine power, deadlines, brand/model, or device connectivity.
5. **Move in.** Save a validated setup locally, display a selected-team cost/carbon/balanced plan using the existing deterministic engine, and scrub the simulation clock. Resume restores region, residence, team and weather choices. Empty restored teams return to recruitment. Messaging integration remains a future chapter.

Pip is an original procedural 3D guide with scripted contextual guidance. Its text is not an LLM response. Scene construction supports Finish build, Replay build, front-facing rotation, zoom and reduced motion. On phones the expanded guide stays in ordinary flow; minimize it to keep a compact header available while scrolling through the setup controls.

```mermaid
flowchart LR
  A[Join demo] --> B[Region]
  B --> C[Residence]
  C --> D[Synthetic weather]
  D --> E[Recruit team]
  E --> F[Validate and save]
  F --> G[Computed plan and simulation]
  E --> H[Local photo]
  H --> I[Optional browser CLIP suggestion]
  I --> J[Manual confirmation]
  J --> E
  G -. Future .-> K[Messaging platform]
```

## Photo recognition design

Transformers.js loads a pinned quantized CLIP model in a Web Worker only after the user requests a suggestion. The first use downloads approximately 190 MB of model/runtime/tokenizer assets; browser caching may reduce later downloads. A worker receives the local photo, decodes it and compares supported appliance descriptions against negative candidates such as other appliances and unrelated scenes. It sends relative candidate scores back to the UI. Scores are not calibrated confidence or verified identification.

The interpreter abstains on unsupported, weak, ambiguous or malformed results. A successful suggestion still requires the user to choose an appliance type and press Confirm housemate. Manual selection remains available for unsupported browsers, canceled downloads, model/network errors or poor photographs. Cancellation terminates the worker; replacing/removing a photo and unmounting invalidate stale results and release object URLs. No image is sent to a recognition service, no API key is needed, and no MCP connection is required.

References: [Transformers.js pipelines](https://huggingface.co/docs/transformers.js/api/pipelines), [official Next.js integration](https://huggingface.co/docs/transformers.js/tutorials/next), [CLIP ONNX model](https://huggingface.co/Xenova/clip-vit-base-patch32). See implementation constants for the pinned model revision and package lock for the runtime version.

## Calculation and persistence boundaries

`src/domain/demo.ts` validates profile fields, derives regional synthetic prices/carbon from the existing 24-hour dataset, and invokes the existing optimizer with only selected Evie/Bubbles requests. The background heating/cooling estimate stays separate from appliance costs, baselines and savings. Chill is never optimized or controlled. All displayed money uses USD comparison units; regional factors are not currency conversions.

`housemates-demo-v1` stores only bounded, validated setup fields. It never stores photos, recognition scores, weather downloads or unvalidated calculated outputs. The UI recomputes plans after restoration. Blocked browser storage yields a session-only message. The existing household memory key is untouched. A dormant, tested public-weather adapter remains in `demo-weather.ts` for potential future work; the current UI neither imports nor calls it.

## Agent workflow and release gate

- Lead owns onboarding UI, route, state transitions, persistence wiring, homepage entry, integration and final release.
- Scene engineer owns only the existing renderer and its stylesheet; extends rather than duplicates it.
- Data engineer owns demo presets, pure scenario/weather helpers and boundary/calculation tests.
- Guide/capture engineer owns mascot, capture, local inference worker and recognition interpretation tests.
- A different specialist reviews each implementation. Visual reviewers must view actual desktop/mobile screenshots and construction frames.

Every lane follows implement → scoped checks → inspect failure → repair → recheck → independent review. The lead runs the real browser journey, captures repaired layouts, checks legacy routes, then runs lint, TypeScript, tests and a production build. Only a passing milestone is committed locally. No remote deployment, external messaging or paid API calls are part of this milestone.

## City miniatures and Pip’s field guide

Each preset adds an original landmark during the landscape build: San Francisco’s Golden Gate Bridge, London’s Elizabeth Tower, Bangkok’s Grand Palace-inspired pavilion, Tokyo Tower, Oslo Opera House and Sydney Opera House. Scale and placement are imaginary. Cultural descriptions and official reference links live in `src/data/city-landmarks.ts`. The legacy household scene does not gain a landmark automatically.

Pip carries a small map and offers paged, contextual written dialogue through `tutorial-npc.tsx` and `tutorial-dialogue.ts`. Next/Back changes only guide pages; optional topics explain the city, simulation, weather and recruitment. Show-me actions focus and scroll to the current chapter’s actual controls. Minimize/reopen preserves a quiet optional guide. Expanded dialogue flows normally on phones so it cannot cover setup controls; minimized guidance can stay pinned. No LLM, speech or messaging connection is implied.

Deployment handoff: this repository has no configured remote/deployment destination. No deployment was attempted for the city/NPC revision. The demo is available locally; if a future deployment fails, record its failure and retain a clearly labeled local placeholder for the morning.

## Completed-home dashboard and floating guide (latest revision)

Move in presents a prominent **Finish build & enter home** action. The final scene button and Pip’s **Enter my home** use the same completion function. Earlier scene buttons say **Skip animation**. Successful persistence opens `/demo/home`; blocked writes keep the completed home in the current session. Direct visits restore validated profile and planningMode, or show setup if no valid recruited team exists. Edit my world returns to the current setup without resetting existing household memory.

The dashboard exposes original/optimized routines, cost/carbon/balanced selection, a48h clock and all3 recruitment/status cards. Chill’s cooling power, accrued energy/cost/carbon and24h bars are computed from the weather/occupancy model; cold neutral days can correctly show standby. No AC task enters the optimizer. AC is a subset of background cooling, not an additional load.

Pip now floats in a body portal, tracking the next action with viewport-clamped positioning. Compact speech and explicit advancement replace the below-map panel; help expands on demand and remains scrollable. Native scroll, keyboard controls, minimize/reopen and reduced motion remain available. Position updates are RAF-coalesced and clean up observers/listeners.

`demo-grid.ts` supplies24 authored indexed demand/solar/net-demand rows per region. `demo.ts` blends the existing synthetic rates with separate net-load-sensitive price and supply/carbon shapes. The California example shows a pronounced midday trough; other regions use different fictional solar strengths. These are not national averages, real tariffs or calibrated dispatch. Existing EV18:00 and dishwasher20:00 baselines remain fixed and availability prevents unavailable midday charging. `demo-activity.ts` integrates hourly AC exactly across fractional hours and midnight to48h.

Background mechanisms: [CAISO duck curve](https://www.caiso.com/documents/flexibleresourceshelprenewables_fastfacts.pdf), [EIA net-load explanation](https://www.eia.gov/todayinenergy/detail.php?id=56880), [EIA residential electricity](https://www.eia.gov/energyexplained/use-of-energy/electricity-use-in-homes.php). Numeric curves and occupancy weights are authored; no source is claimed to provide them.

Verification:138 automated tests, lint, TypeScript and production build pass. Actual browser review covered five viewport sizes and the end-to-end completion flow. On320px screens, optional expanded Help can cover part of the planning area; Less help, minimize or Escape dismisses it. The compact guide leaves camera/clock controls accessible.
