# AI Duel Lab

Research question: does Jev's tactical judgment overcome its additional decision latency in a real-time 2D naval combat task?

## Architecture and implementation plan

Baseline: `d73662a` on main. `index.html` contains the legacy Player/Enemy game, 60 Hz fixed ticks, momentum, main-turret timers, secondary arcs, procedural islands and committed APPROACH/CROSS/REPOSITION/SEPARATE/CLEAR steering. PRs #6-8 supply firing arcs, physical enemy steering and the wave-5 reward fix. The original verifier serves HTML for every route and must support modules. Legacy gameplay stays in its own page; only a mode link is added.

1. Shared `DuelShip`/`DuelSimulation`, geometry, turret arcs, armor and seeded impacts.
2. Pure snapshot-driven deterministic rules and reproducible mirrored controls.
3. Canonical snapshot/action validation; secure asynchronous Choice adapter.
4. Decision scheduling, delay/staleness telemetry, exports and observer UI.
5. Full original-game plus mocked duel verification, visual evidence and draft review.

Acceptance is reproducible simulation, observable angle/firepower tradeoffs, symmetric rules and honest timing/failure records. No live Jev superiority claim is made by passing software tests.

## Run locally

Requires Node 24 and a modern Chromium browser. No bundler or new dependencies.

```powershell
npm.cmd ci
npm.cmd start
```

Open `http://127.0.0.1:8765/duel.html`. If that port is in use, set `$env:PORT='8776'` before starting and use that port. The original game remains at `/index.html` with a separate AI Duel Lab link.

Default **Deterministic control** makes no API calls. **Mock latency** runs a delayed copy of the same rules, with a nominal 180 ms timer plus selected injected delay. It is explicitly not Jev and is never benchmark eligible. Its one-hot Choice probabilities are synthetic fixtures, not model confidence. Use Run, Restart same seed, New seed, Swap starting sides, Run mirrored trial, **Jev / Mock role**, and **Start geometry**. Controller role and physical side are independent. Settings apply when a new battle starts. Export JSON before replacing a battle you want to preserve. Exports include 10 Hz research frames for future replay tooling; an import/playback UI and live batch execution are deferred.

Mouse, touch and native keyboard controls are supported. Turret abbreviations: F1/F2 forward, A1/A2 aft; RDY loaded; JAM impaired; ARC legal bearing; BLIND blocked arc. The panel's aspect is the ship's own exposure to its opponent (0 bow/stern, 90 broadside).

### Real Jev duel (private local use only)

No API credentials have been added or requested in chat. Obtain a TypeSafe account/key separately. In a **local PowerShell terminal**, enter the key without placing its value in command history:

```powershell
$jevSecret = Read-Host 'TypeSafe API key' -AsSecureString
$env:JEV_API_KEY = [System.Net.NetworkCredential]::new('', $jevSecret).Password
$env:JEV_LIVE_ENABLED = '1'
$env:JEV_MODEL = 'jev-1.13.0'
$env:JEV_MAX_REQUESTS = '1000'
npm.cmd start
```

Refresh the local page, select **Live Jev**, choose a seed and delay, then Run duel. This action makes billed requests on that account. No calls occur merely from starting the server or opening the page. Keep the tab visible; a hidden tab or a frame stall over 250 ms invalidates the live trial. Stop cancels pending work. Each battle lasts at most 120 simulation seconds, with at most 480 decision opportunities. The server budget is shared across battles and tabs, defaults to 1000 requests per process, and has no automatic retries. To clear credentials after stopping the server:

```powershell
Remove-Item Env:JEV_API_KEY
Remove-Item Env:JEV_LIVE_ENABLED
$jevSecret.Dispose()
```

Do not bind this server publicly or forward its port. Static Pages cannot host the proxy. Static hosting provides controls and mock demonstrations only; `npm run package:static` emits only browser allowlisted files into `dist/` for the existing Pages workflow.

## Experiment and controls

Control: readable deterministic tactical rules, inspired by the original APPROACH/CROSS/REPOSITION/SEPARATE/CLEAR separation of intent and helm. Experimental condition: Jev chooses high-level maneuver, fire/hold, AP/HE and target zone. Shared deterministic code owns steering, motion, lead, traverse, arcs, projectiles and damage.

Independent variables: decision provider, observed provider latency, optional artificial latency (0/100/250/500/1000 ms in the UI). Dependent variables: win/loss/draw, damage per shot, hit rate, damage efficiency, survival duration, firing opportunity use and decision staleness. Do not infer statistical significance or provider quality from software parity checks.

Both contestants use `DuelShip`, one frozen configuration, full starting HP, identical mounts, action enums and 60 Hz ticks. `tacticalSnapshot()` is the sole policy observation builder (schema version 3). Both snapshots are captured before committing either decision at a shared 250 ms opportunity. Own state remains exact; enemy motion comes from `opponent.track`, and enemy module/fire status comes only from the explicit sampled opponent-observation state. Exact opponent HP is retained because the player-facing panels already show both ships' numeric HP and meters; it is refreshed for policy input on the 10 Hz observation cadence. Neither policy sees enemy RNG, future shells, next decisions, exact module timers or individual turret reload timers.

Experimental RNG roles are explicitly **R0 = alpha** and **R1 = bravo**, not controller identities. `streamSeed(seed, role, purpose)` derives independent `dispersion`, `armor`, `modules`, and `observation` streams. Stream IDs/seeds are exported, never included in AI snapshots. Jev is assigned to either alpha/R0 or bravo/R1 independently of the physical-side swap. A complete seed/scenario therefore has four conditions: Jev bravo normal/mirrored, Jev alpha normal/mirrored. In offline controls both slots use deterministic rules; the contender slot still crosses roles. Four conditions are paired controls, not four independent samples. Swapping rotates the complete scenario and observation-noise vectors 180 degrees, preserving relative geometry and chirality. Damage is calculated before HP changes and overkill is allocated proportionally within each tick. Simultaneous destruction and the 120-second limit are draws; there is no hidden HP tiebreak.

### Shared observation and fire-control boundary

`DuelShip truth -> observeOpponent -> OpponentObservationState -> TargetTracker / sampled HP / module booleans / salvo observations -> TacticalSnapshot -> policy and shared gun director`

The sensor accepts only `{x, y, heading}`, adding timestamp and seeded uniform noise (position ±1.5 units per axis; heading ±1 degree). Samples contain exactly `timestamp, x, y, heading`. There is no true speed, velocity, acceleration, turn rate, action, or throttle in a raw sample. Each observer has an eight-sample history updated every 100 ms; tactical opportunities remain 250 ms and simulation ticks 60 Hz.

Velocity is finite-differenced and smoothed with EMA alpha 0.35. Hull heading uses wrapped-angle EMA 0.40, separately from direction of travel. Turn rate uses wrapped heading differences and EMA 0.30. Turn thresholds are 2/5/10 degrees per second; turn and speed-trend changes need three consecutive samples. Zero/one sample leaves speed unknown; two samples are rough, three to five developing, and six or more established. These are estimation heuristics, not calibrated sensor physics.

Separate position/speed/heading/turn/overall confidence combines sample maturity, observation age, prediction residuals, acceleration and turn rate. Age bands are FRESH (0–150 ms), GOOD (to 300), AGING (500), STALE (750), VERY_STALE (1000), POOR (1500), and LOST thereafter; multipliers are 1/.9/.75/.55/.35/.2/0. Base position-uncertainty anchors are 2 units fresh, 8 at 500 ms, 20 at 1000 ms, and 38 at 1500 ms, enlarged for maneuvering/residuals. These quantities are diagnostic scores, not statistical confidence intervals. Noise-derived acceleration can noticeably increase fresh uncertainty; measured averages are reported below.

`OpponentObservationState` is the one truth-to-policy bridge. Module visibility is sampled at 10 Hz as `visibleModules: {engineImpaired, steeringImpaired, forwardTurretImpaired}` booleans. Physical impairment timers/expiration timestamps are not in the observation contract. A firing event is detected by a sampled sequence change and stamped at the sample time, not the physical firing tick. `enemyFire` is `{status, lastSalvoObservedAgeMs}` with `NO_OBSERVED_SALVO`, `RELOADING`, or `LIKELY_READY`; the nominal 6.5-second public reload rule supports a quantized estimate, not exact reload completion.

`aimSolution()` requires a `TARGET_TRACK`, rejects a physical target, and solves the constant-estimated-velocity intercept including the chosen zone offset. The helm also points toward estimated position. Unknown speed and LOST tracks cannot fire. Stale position extrapolation cannot know a new turn; tests show real intercept miss distance rather than merely a lowered confidence number. Actual enemy geometry is used for physical collision/damage and separately labeled `GROUND TRUTH - ANALYSIS ONLY` research exports, never policy input or aiming. Exact enemy HP remains a deliberate exception because it is presented numerically to both contestants in the UI.

### Baseline competence and comparison principle

The deterministic baseline is a competent traditional game AI, not intentionally weakened and not omniscient. It retains range closing, separation, defensive angling during reload, damaged kiting, boundary safety, turret opportunities, AP for apparently favorable geometry (estimated aspect >=50 degrees and range <900), broadside-midships citadel targeting, and HE/module targeting. No random bad-action mechanism exists.

Mistakes arise from imperfect observations, estimation lag, simplified thresholds, shell travel, and changing target state. The comparison is **fast competent bounded heuristics versus a slower contextual bounded model under the same observable world**. Jev's possible advantage is contextual judgment; its possible disadvantage is latency and stale decisions. Both use the same continuously updated gun director even while a tactical request is pending.

The initial action for either ship is HOLD_COURSE/HOLD_FIRE/AP/MIDSHIPS with zero speed. Deterministic commits immediately at time zero; Jev waits for its first response. This initial latency penalty is intentionally part of the tested condition. The common helm stops forward motion at the arena wall while retaining turning; it does not silently choose a tactical escape for Jev.

## Combat abstraction

This is inspired by World of Warships, simplified for a controlled 2D experiment. All tunable values live in `duel/config.js`.

- Four independent twin turrets: two fore/two aft, finite world-facing traverse, 125-degree arc either side of each mount's fore/aft center, 6.5-second reload and alignment gate. Bow/stern permit two turrets, broadside four. The traverse path stays inside each mount's legal sector.
- Hull hit detection uses a segment swept against an oriented 120 by 36 footprint. The rendering tapers the ends, while the collision footprint is deliberately a conservative rectangle. Moving-target rotation/translation within a single tick is approximated at the post-movement pose.
- Longitudinal regions are 25/50/25 percent bow/midships/stern. Impacts record local side and actual zone separately from requested aim zone.
- AP uses longitudinal aspect, not the rectangular face normal. Incidence is `90 - aspect`: 60+ degrees auto-bounces, 45-60 transitions with seeded probability. Range reduces penetration; broadside midships hits above the configured aspect threshold can citadel.
- HE deals lower, dependable direct damage without AP ricochet or fire DOT. Module hits can impair one forward turret, engine propulsion, or steering for 4.5 seconds. Section condition records local damage and does not sum to remaining ship HP; no damage saturation is modeled.
- Both sides share estimated-velocity lead toward a requested zone, range-sensitive physical dispersion, shell travel and seeded module effects. Changing AP/HE or aim zone changes future eligible shots immediately; there is no ammo-switch reload penalty.

The arena is 2200×1400, starting separation 1100, shell speed 380 units/s, and maximum travel range 1500. Center-to-center starting flight time is approximately 2.89 seconds (mount/zone offsets and target motion change actual flight). Dispersion samples a bounded lateral offset with half-width `2 + 0.006*r + 0.000008*r*r`, converted to a launch angle with `atan2(offset, range)`: ±7 at 500, ±16 at 1000, ±29 at 1500 units. No miss roll is used. The previous arena was 1600×1000, separation 760, maximum range 1050 and fixed ±0.009-radian spread. Tracking alone with new streams did not reduce the first five-seed hit rate (95.1%, mean 21.26 s); the larger space and physical dispersion were therefore evaluated before retaining these values. This was exploratory tuning, not an out-of-sample validation set.

Omitted: islands/pathfinding, ship-to-ship collision/ramming, torpedoes, aircraft, concealment, consumables, repair, flooding, fire DOT, commander skills, overmatch, normalization, plunging fire, deck armor, fuse depth, damage saturation and layered armor. There are no secondary batteries in this benchmark ship. Expanded controls still have high accuracy and short fights; they establish software properties, not sufficient tactical diversity or optimal baseline skill for a scientific conclusion.

## Jev trust boundary and API contract

The API is project-billed. Browser → same-origin `POST /api/jev/decision` → loopback Node proxy → fixed `https://api.typesafe.ai/v1/systemone`. The server alone reads `JEV_API_KEY`; it owns the model, prompts and fixed endpoint. The client submits only a validated snapshot. Host/origin checks, a random session header, a 16 KiB input limit, exact recursive shape and enum validation, one provider call in flight, a request cadence limit and a process request cap protect this private endpoint. Responses are capped at 64 KiB, allowlisted and validated. Provider error bodies and credentials are never echoed or logged. Tests use synthetic sentinel values only. The coherent 108-plan Choice is intentionally unchanged until real calls measure its costs and latency.

Contract rechecked September 22, 2026 against the official [HTTP API reference](https://docs.typesafe.ai/api) and [Choice reference](https://docs.typesafe.ai/primitives/choice). Requests use `state`, `model`, and a `questions` map. A single **plan** Choice now jointly selects maneuver/fire/shell/zone: 9×2×2×3 = **108 options**, below the documented 255 limit. Keeping all 108 preserves exactly the same action space, including selected ammunition/zone while holding fire to pre-aim; reducing to 63 would collapse those hold/pre-aim options. This replaces four independently answered questions, not four supposedly mutually informed answers. Each option decodes to the existing exact four-field action. Responses use `model`, `answers.plan.choice`, its full validated `probabilities`, `confidence`, and documented token usage. Both mock adapters and HTTP fixtures exercise this contract. `/v1/models` was previously checked as model discovery; the implementation keeps the pinned version instead of silently following an alias. No undocumented monetary cost field is fabricated. The larger Choice's actual billed tokens/latency remain unmeasured.

No live credentialed call has been made during this revision. Exact account access, provider behavior, real latency and token cost remain unverified. Malformed choices, transport errors, authentication/rate-limit errors or hard timeouts invalidate the trial; normal slow responses retain the previous committed action. There is no tactical fallback in the Jev condition. Mock rules are a separate, labeled mode. Combat accuracy and dispersion were not retuned in this pass.

## Timing and telemetry

At most one Jev request (including its injected-delay period) is pending. Busy opportunities increment a counter and do not enqueue work. A validated response waits for the configured artificial delay, then commits at the next simulation tick. The simulation never awaits it. Late responses are discarded; metadata is retained if it arrives before export.

`providerLatencyMs` is measured server-side around the provider HTTP round trip and response parsing; it is not pure inference time. Live request records include `planOptionCount`, UTF-8 `serializedProviderRequestBytes`, `serializedObservationBytes`, `serializedCriteriaBytes`, and returned `inputTokens`/`outputTokens`. Token values remain null if the provider does not return them; no token estimate is substituted. `transportRoundTripMs` additionally includes the browser/proxy trip. `injectedDelayMs` is the configured post-response wait. `totalDecisionDelayMs` is monotonic wall elapsed from snapshot request to application. `stateAgeAtApplyMs` is simulation elapsed from the observation to application. The final tick introduces up to one tick of application quantization. Deterministic computation is measured with the same monotonic performance clock but does not delay application.

Exports contain:

- Battle: version/configuration, seed/scenario, ship ID/controller/starting side/RNG role/named stream IDs, mode/model IDs, status, duration, combat counts, opportunity counts, timing distributions, and returned usage. Cost remains `null`; research track errors and confidence have separate aggregate statistics.
- Decision: canonical observation, request/response/application timestamps, action, rule ID or Choice response, separate provider/injected/total delay, state age, estimated range/aspect deltas, HP deltas, `trackAtRequest`, `trackAtApply`, and age of the requested track at application. `constraintsAtApply` is frozen before movement/firing. `blockedAtApply` means every turret is blocked for a FIRE action, not merely one blind mount. `constraintsEncounteredDuringAction` records each turret/reason with its first time, separately from `firstConstraintTimeMs`, `firedDuringDecisionWindow`, and `firstFireTimeMs`. A post-shot reload cannot retroactively mark application blocked.
- Projectile launch estimate: target position/velocity/heading/aspect, track confidence/uncertainty/age, predicted intercept point/flight time and age of the committed decision when the projectile launches.
- Projectile truth: actual target pose/velocity/heading/aspect at launch and closest approach, center miss distance where feasible, and actual impact pose/aspect when hit. This separate `projectileResearch` export is labeled `GROUND TRUTH - ANALYSIS ONLY`; closest-approach distance is measured to the target center. It is unavailable to policy and gun director.
- Impact: requested/actual zone, actual aspect, traveled range, result/damage/modules and launch time. Actual impact geometry is labeled `GROUND TRUTH - ANALYSIS ONLY`.
- Frames: simulation-truth observer/replay poses, explicitly labeled `GROUND TRUTH - ANALYSIS ONLY`. `trackResearch` compares estimates with truth at observation updates. Neither research channel is sent to Jev or the policy.
- Summary: provider-payload byte/option/token distributions plus mean/median module-state and salvo-observation delay, when available. No paid payload is synthesized for mock/control modes.

`observedFiringOpportunities` counts 250 ms windows starting with any ready mount; `usedFiringOpportunities` counts those windows with an actual shot, at most once per window. `firingTicks` separately counts all simulation ticks with a launch, including an opportunity that emerges inside a window. Decision-window fields span the applied action until replacement, possibly several cadence windows while Jev is pending. An already-blocked application sets `firstConstraintTimeMs` to its application timestamp; subsequent constraints never overwrite `constraintsAtApply`.

Monetary estimates, unresolved in-flight usage and statistical claims are not substituted for provider evidence. Mid-battle exports are RUNNING and not eligible. Only completed JEV-mode trials are eligible; invalid, control and mock trials must be excluded from Jev win-rate comparisons. Browser results are locally inspectable and editable, not tamper-proof research records.

## Verification and evidence

```powershell
npm.cmd run verify
npm.cmd run verify:controls
npm.cmd run package:static
```

The canonical verifier runs the Node test suites and all original-game browser regressions, then desktop/touch duel paths. It never enables live Jev or calls a paid provider. Browser HTTP fixtures also exercise the live adapter, confidence display, pending/application states, no-fast-forward guard and tab-hidden invalidation.

The original five-seed/ten-trial evidence remains unchanged in `docs/duel-evidence/control-results.json`, with the pre-edit rerun in `pre-revision-rerun.json`. Revised controls freeze seeds `1, 7, 42, 2026, 9001, 100..126` across HEAD_ON, PARALLEL, CROSSING, two contender assignments and two physical layouts: **384 conditions, 32 unique seeds, 96 seed/scenario groups**. Each group also receives a repeat and reversed-update run, making **576 offline executions**. All 96 groups pass physical symmetry, role parity, repeatability and reverse-order checks. All conditions are reported; none were excluded. They are paired mechanical controls, not 384 independent samples or evidence of intelligence superiority. CI now runs the same broad controls without paid calls.

| Metric | Original 10 trials | Revised same 5 seeds / 10 trials | Expanded 384 conditions |
| --- | ---: | ---: | ---: |
| Hit rate (hits / shots) | 92.86% | 90.74% | 87.75% |
| Mean / median duration | 24.60 / 22.88 s | 30.86 / 30.05 s | 33.46 / 35.11 s |
| Shots per battle | 56.0 | 64.8 | 67.02 |
| Ricochet / nonpen (per impact) | 0 / 0% | 1.36 / 0% | 1.68 / 0.37% |
| Penetration / citadel (per impact) | 80.38 / 19.62% | 81.29 / 17.35% | 82.25 / 15.69% |
| Module impairments | 114 | 148 | 5268 |

Expanded wins: alpha/R0 **224**, bravo/R1 **152**, draws **8**. Physical sides A/B each win **188**. These are condition counts (four equivalent control placements per underlying seed/scenario), not independent trials. There is a role imbalance in this sample; counterbalancing is essential and does not imply equal R0/R1 results. Head-on accuracy remains 90.57%; parallel is 83.27%; crossing is 89.70%. Occasional ricochets/nonpens arose without changing the competent AP selection threshold. Accuracy remains high and fights relatively short: an experimental-design concern, not something to fix with deliberately poor actions.

Expanded tracking means, sampled at the 10 Hz observation update: position error **1.146 units**, velocity-vector error **4.768 units/s**, absolute speed error **3.070 units/s**, heading error **1.495 degrees**, overall confidence **0.672**, uncertainty **±5.577 units**. These are fresh-track diagnostics, not stale decision accuracy or calibrated coverage. Firing windows: **7136 observed, 6964 used**; **8360 firing ticks** (different denominators). Baseline had no tracker or correctly defined used-window metric, so those comparisons are unavailable, not zero.

### PR #10 observer-boundary refinement comparison

The pre-change PR-head record is preserved as `docs/duel-evidence/pre-observation-refinement.json`; the new run is `post-observation-refinement.json`. Both use the same 32 seeds, three scenarios and four controller/side placements (384 conditions). All **96/96** seed/scenario groups passed physical symmetry, role parity, reproducibility and reverse-update-order checks; the full run includes 192 repeat/order executions (576 executions total). These are paired mechanical controls, not independent evidence of AI quality. No combat accuracy, dispersion or heuristic selection thresholds were tuned here.

| Metric | PR head before | Observation-boundary revision |
| --- | ---: | ---: |
| Trials / unique seeds | 384 / 32 | 384 / 32 |
| Alpha / bravo / draws | 224 / 152 / 8 | 220 / 160 / 4 |
| Physical A / B / draws | 188 / 188 / 8 | 190 / 190 / 4 |
| RNG R0 / R1 / draws | 224 / 152 / 8 | 220 / 160 / 4 |
| Shots / hits / hit rate | 25,736 / 22,584 / 87.75% | 25,856 / 22,688 / 87.75% |
| Mean / median battle duration | 33.46 / 35.11 s | 33.57 / 35.18 s |
| Shots per battle | 67.02 | 67.33 |
| Ricochet (count; per impact) | 380; 1.68% | 400; 1.76% |
| Nonpen (count; per impact) | 84; 0.37% | 84; 0.37% |
| Penetration (count; per impact) | 18,576; 82.25% | 18,672; 82.30% |
| Citadel (count; per impact) | 3,544; 15.69% | 3,532; 15.57% |
| Observed / used firing windows | 7,136 / 6,964 | 7,176 / 7,028 |
| Firing ticks | 8,360 | 8,452 |
| Mean absolute track speed error | 3.070 u/s | 3.065 u/s |
| Mean absolute track heading error | 1.495° | 1.498° |
| Mean track confidence score | 0.672 | 0.671 |
| Mean observed module-state delay | Not recorded | 56.38 ms (5,768 transitions) |
| Mean observed salvo-timing delay | Not recorded | 55.52 ms (7,748 salvos) |

The small outcome differences are descriptive consequences of using sampled module booleans and quantized salvo observations; they are not evidence for either controller's quality. Module/salvo delays are measured from internal event time to 100 ms observation time and are research-only metrics. The original ten-trial baseline remains separate and is not a matched experiment.

Raw prior PR-head and new summaries, checks, configuration and per-scenario aggregates are in `docs/duel-evidence/pre-observation-refinement.json` and `post-observation-refinement.json` (new run regenerated in `output/evals/revised-controls.json`). Real Jev candidate runs: **0**, excluded by the no-paid-calls boundary. Before model conclusions, predeclare a held-out seed/scenario set, retain every invalid trial, run the full four-condition matrix for each delay and report paired uncertainty.

Screenshots in `docs/duel-evidence/` show bow-on, broadside, legal arcs, zone/module fixtures, HTTP-mocked Jev pending/applied state and completed control telemetry. Fixture labels identify mocked provider evidence; these screenshots are not real Jev results. Generated JSON, mobile captures and game-client action-loop captures are under ignored `output/`.

Private local experimental scope: **CONDITIONALLY READY**. Shared combat, reproducibility, browser controls and mocked integration pass; live provider access and research validity need real trials plus external review. No merge or deployment is part of this change.

| Area                              | Evidence/status                                                           |
| --------------------------------- | ------------------------------------------------------------------------- |
| Combat and deterministic controls | pass: unit tests, seeded mirrors and update-order checks                  |
| Observer and input                | pass: desktop pointer, keyboard, mobile touch, screenshots                |
| Local proxy security              | pass: mock allow/deny paths, secret sentinel and browser allowlist checks |
| Original game                     | pass: existing canonical browser regression suite                         |
| Real provider/account/latency     | not verified: no paid calls                                               |
| Jev versus control conclusion     | not applicable: no real candidate data                                    |

Known limits: only three scenario families and 32 seeds, exploratory tuning rather than a held-out evaluation, high accuracy, role imbalance, uncalibrated sensor confidence/trends, simplified geometry/combat/reload estimation, per-role random streams rather than matched outcomes after divergent actions, browser-dependent scheduling, no imported replay viewer or live batch runner, and no independent empirical measure of baseline skill. A seeded purpose stream can be consumed differently after divergent actions; counterbalancing mitigates fixed-role coupling, not this divergence. Stop/restart does not save automatically. The UI periodically refreshes telemetry, so assistive-technology usability beyond native controls has not been audited. Do not proceed to paid trials if information isolation, role/side counterbalancing, reproducibility, symmetry, verification, or secret isolation fails. No blocker of those types remains in the offline verification; live provider behavior is still unverified.
