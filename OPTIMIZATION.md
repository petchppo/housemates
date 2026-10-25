# Coordinated household optimization

Open `/demo/home` and choose **Optimize** next to the preview clock. The first opening computes cost, carbon and balanced alternatives for the recruited team. Select an objective to see each task's start, finish, energy, USD cost and modeled CO₂e, with original and computed timeline bars. `/judge-demo` also has an isolated ten-character fixture and temperature scenarios; it never reads or changes saved household memory.

This is a calculated planning preview. It does not change an approved core or expanded-party simulation, advance either clock, or control hardware. Existing explicit approval paths remain separate. Preview results are session-only. Changed weather, rates, recruited devices, negotiated constraints or power budget invalidate the preview until recalculated. Clear preview removes only this result.

## Model

`src/domain/coordinated-optimization.ts` implements a bounded exact binary linear optimization model, solved with branch and bound without a new dependency. For appliance `i` and feasible whole-hour start `s`, binary variable `x[i,s]` selects a complete task:

- Exactly one candidate per flexible appliance: `sum_s x[i,s] = 1`.
- Cost objective: minimize `sum_(i,s) cost[i,s] * x[i,s]`.
- Carbon objective: minimize `sum_(i,s) carbon[i,s] * x[i,s]`.
- Balanced objective: equal-weight normalized household cost and carbon. Each scale is the sum of per-appliance candidate ranges (`Rcost = sum_i(max_s cost[i,s] - min_s cost[i,s])`, likewise for carbon), over individually feasible candidates before joint power filtering. The score is `0.5 * (C - sum_i min_s cost[i,s]) / Rcost + 0.5 * (G - sum_i min_s carbon[i,s]) / Rcarbon`. A range at or below `1e-9` contributes zero. These are global scales, not per-appliance normalized scores; constant offsets do not change the optimum.
- When a modeled power budget `L` is supplied, every hour `h` satisfies `sum_(i,s) power[i,s,h] * x[i,s] + fixed[h] + background[h] <= L`.

The existing scheduler supplies candidates and the fractional energy ledger. Each task respects its current availability, operating window and deadline. Continuous tasks cannot be split. Variable core cycle profiles and partial final hours are retained. Power constraints use instantaneous active power, not the misleading average energy of a partial hour. In this model all increases occur at integer boundaries; partial final hours only decrease load later.

Cost ties prefer lower carbon; carbon ties prefer lower cost; remaining ties use canonical appliance order and earliest starts. Balanced ties prefer lower cost, then carbon, then earlier starts. Numerical comparisons use a small floating-point tolerance. Search is capped at 250,000 nodes. Only a completed optimality proof returns schedules; search exhaustion returns `search-limit` without an incumbent presented as an optimum. Invalid inputs and infeasibility are explicit and never relax constraints.

The mathematical class is mixed-integer linear programming with binary variables; see the [SCIP description of optimization problem classes](https://www.scipopt.org/doc-10.0.0/html/WHATPROBLEMS.php). Housemates uses its own small bounded solver, not SCIP.

## Weather and accounting

`src/domain/household-optimization.ts` builds a copied, fingerprinted snapshot from the current household and its negotiated core and expanded-party requests. It validates inventory and weather location and recomputes thermal background rather than trusting cached totals.

Temperature and humidity determine illustrative fixed heating/cooling power. That power reserves capacity before flexible jobs are placed. The default **8 kW** budget is an editable demo assumption, not a measured circuit rating; “No shared power limit” removes this constraint. Weather can therefore change timing when capacity binds. Without a binding budget, timing may remain unchanged. Weather never changes synthetic prices, grid carbon factors or task energy.

The horizon is 48 hours. Synthetic hourly prices and carbon repeat on the second day. A two-day forecast uses both days; a one-day weather scenario explicitly repeats its day and is labeled accordingly. Live weather, synthetic fallback and what-if weather keep their actual source labels.

Six categories can shift: Evie, Bubbles, Spin, Tumble, Misty and Rover. Breeze retains its fixed original fan routine and is accounted separately. Chill, Frost and Ember remain protected. Chill is already represented in thermal background and is never added again. Refrigeration and water-heater consumption are not included in these totals. Flexible savings compare the same task energy against fixed original timing; a baseline violating today's constraints remains labeled as a comparison reference only.

Results are modeled estimates for included tasks, not a full utility bill, verified savings, telemetry, or a whole-house circuit guarantee. Taxes, standing charges, other loads, charging losses and washer-before-dryer dependencies are not inferred. No API or paid model is required.

## Verification

Regression suites cover solver optimality, fractional-hour power, all ten categories, current negotiated constraints, malformed inputs, protected/fixed accounting, weather headroom, exhausted search, stale context and lifecycle cancellation. An independent exhaustive oracle checks 24 scenarios across all three objectives. Actual-component tests verify dashboard wiring, isolation from approved runs, the expanded-party callback, and the opt-in judge fixture. Rendered and milestone-gate evidence is recorded in `PROGRESS.md`.
