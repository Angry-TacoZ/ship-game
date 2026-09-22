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

Default **Deterministic control** makes no API calls. **Mock latency** runs a delayed copy of the same rules, with a nominal 180 ms timer plus selected injected delay. It is explicitly not Jev and is never benchmark eligible. Use Run, Restart same seed, New seed, Swap starting sides, and Run mirrored trial. Settings apply when a new battle starts. Export JSON before replacing a battle you want to preserve. Exports include 10 Hz position frames for future replay tooling; an import/playback UI and live batch execution are deferred.

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

Both contestants use `DuelShip`, one frozen configuration, full starting HP, identical mounts, action enums and 60 Hz ticks. `tacticalSnapshot()` is the sole observation builder. Both snapshots are captured before committing either decision at a shared 250 ms opportunity. Policies see current observable position/velocity, health, own turret status and visible modules. Opponent reload is an estimate from the most recent visible salvo; neither policy sees the enemy's individual reload timers, random stream, future shells or next decision.

Per-role RNG streams are derived from the recorded seed, independent of iteration order; they move with controller identity when sides swap. Swapping rotates the complete scenario 180 degrees, preserving relative geometry, helm chirality and each role's random sequence. Damage is calculated before HP changes and overkill is allocated proportionally within each tick. Simultaneous destruction and the 120-second limit are draws; there is no hidden HP tiebreak.

The initial action for either ship is HOLD_COURSE/HOLD_FIRE/AP/MIDSHIPS with zero speed. Deterministic commits immediately at time zero; Jev waits for its first response. This initial latency penalty is intentionally part of the tested condition. The common helm stops forward motion at the arena wall while retaining turning; it does not silently choose a tactical escape for Jev.

## Combat abstraction

This is inspired by World of Warships, simplified for a controlled 2D experiment. All tunable values live in `duel/config.js`.

- Four independent twin turrets: two fore/two aft, finite world-facing traverse, 125-degree arc either side of each mount's fore/aft center, 6.5-second reload and alignment gate. Bow/stern permit two turrets, broadside four. The traverse path stays inside each mount's legal sector.
- Hull hit detection uses a segment swept against an oriented 120 by 36 footprint. The rendering tapers the ends, while the collision footprint is deliberately a conservative rectangle. Moving-target rotation/translation within a single tick is approximated at the post-movement pose.
- Longitudinal regions are 25/50/25 percent bow/midships/stern. Impacts record local side and actual zone separately from requested aim zone.
- AP uses longitudinal aspect, not the rectangular face normal. Incidence is `90 - aspect`: 60+ degrees auto-bounces, 45-60 transitions with seeded probability. Range reduces penetration; broadside midships hits above the configured aspect threshold can citadel.
- HE deals lower, dependable direct damage without AP ricochet or fire DOT. Module hits can impair one forward turret, engine propulsion, or steering for 4.5 seconds. Section condition records local damage and does not sum to remaining ship HP; no damage saturation is modeled.
- Both sides share constant-velocity lead toward a requested zone, angular dispersion, physical travel and seeded module effects. Changing AP/HE or aim zone changes future eligible shots immediately; there is no ammo-switch reload penalty.

Omitted: islands/pathfinding, ship-to-ship collision/ramming, torpedoes, aircraft, concealment, consumables, repair, flooding, fire DOT, commander skills, overmatch, normalization, plunging fire, deck armor, fuse depth, damage saturation and layered armor. There are no secondary batteries in this benchmark ship. Balance and baseline-policy strength need broader testing before any model comparison claim. Current small controls often end after a few salvos; they establish software reproducibility, not sufficient tactical diversity for a scientific conclusion.

## Jev trust boundary and API contract

The API is project-billed. Browser → same-origin `POST /api/jev/decision` → loopback Node proxy → fixed `https://api.typesafe.ai/v1/systemone`. The server alone reads `JEV_API_KEY`; it owns the model, prompts and fixed endpoint. The client submits only a validated snapshot. Host/origin checks, a random session header, a 16 KiB input limit, exact recursive shape and enum validation, one provider call in flight, a request cadence limit and a process request cap protect this private endpoint. Responses are capped at 64 KiB, allowlisted and validated. Provider error bodies and credentials are never echoed or logged. Tests use synthetic sentinel values only.

Contract verified September 22, 2026 against the official [HTTP API reference](https://docs.typesafe.ai/api), [Choice reference](https://docs.typesafe.ai/primitives/choice), and [models reference](https://docs.typesafe.ai/models). Requests use `state`, `model`, and a `questions` map. Each of four Choice questions uses `type`, `instructions`, and a `criteria` map. Responses use `model`, `answers[key].choice`, `probabilities`, `confidence`, and `usage.input_tokens` / `output_tokens`. `/v1/models` is documented as model discovery; the implementation pins the documented version instead of silently following an alias. The public OpenAPI URL was not available; the official HTTP reference supplied the contract. No undocumented monetary cost field is fabricated.

No live credentialed call has been made during implementation. Exact account access, provider behavior and real latency remain unverified. Malformed choices, transport errors, authentication/rate-limit errors or hard timeouts invalidate the trial; normal slow responses retain the previous committed action. There is no tactical fallback in the Jev condition. Mock rules are a separate, labeled mode.

## Timing and telemetry

At most one Jev request (including its injected-delay period) is pending. Busy opportunities increment a counter and do not enqueue work. A validated response waits for the configured artificial delay, then commits at the next simulation tick. The simulation never awaits it. Late responses are discarded; metadata is retained if it arrives before export.

`providerLatencyMs` is measured server-side around the provider HTTP round trip and response parsing; it is not pure inference time. `transportRoundTripMs` additionally includes the browser/proxy trip. `injectedDelayMs` is the configured post-response wait. `totalDecisionDelayMs` is monotonic wall elapsed from snapshot request to application. `stateAgeAtApplyMs` is simulation elapsed from the observation to application. The final tick introduces up to one tick of application quantization. Deterministic computation is measured with the same monotonic performance clock but does not delay application.

Exports contain:

- Battle: version, configuration, seed, sides/controllers, mode, model IDs, status/invalid reason, duration, HP, damage, shots, AP/HE, hits by zone, penetration classes, module counts, decisions, missed opportunities, failures, requests, provider latency min/median/mean/max, mean and distribution of state age, deterministic computation latency and returned token usage. Cost remains `null` because the documented API does not return a price.
- Decision: observation, request/response/application timestamps, bounded action, rule ID or returned confidence/distribution, provider/injected/total delay, state age, range/aspect/HP deltas and whether the firing opportunity opened/closed. Physical blocks encountered while the action remains active are recorded, plus actual firing ticks.
- Impact: shooter/target, shell and requested/actual zone, side, aspect at impact, traveled range, result class, raw/final damage and module effect.
- Frames: visible ship poses/actions/turrets/modules and projectiles at 10 Hz; these are observations, not an accelerated live benchmark.

Monetary estimates, unresolved in-flight usage and statistical claims are not substituted for provider evidence. Mid-battle exports are RUNNING and not eligible. Only completed JEV-mode trials are eligible; invalid, control and mock trials must be excluded from Jev win-rate comparisons. Browser results are locally inspectable and editable, not tamper-proof research records.

## Verification and evidence

```powershell
npm.cmd run verify
npm.cmd run verify:controls
npm.cmd run package:static
```

The canonical verifier runs the Node test suites and all original-game browser regressions, then desktop/touch duel paths. It never enables live Jev or calls a paid provider. Browser HTTP fixtures also exercise the live adapter, confidence display, pending/application states, no-fast-forward guard and tab-hidden invalidation.

Fixed controls use seeds `1, 7, 42, 2026, 9001`, each normal and mirrored. The first implementation run passed all five pairs: identical winner, duration and ending HP after swapping. Reversing ship update order is separately tested. `output/evals/control-results.json` records all ten trials. This is a regression evaluation only. Real Jev candidate runs: **0**, deliberately excluded because no credentialed run was performed. Before reporting model results, predeclare a larger scenario/seed set, preserve every invalid trial with its reason, run mirrored pairs for each latency condition, and report uncertainty with the raw exports.

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

Known limits: low sample count, simplified geometry/combat and reload estimation, per-role random streams rather than matched outcomes after divergent actions, browser-dependent scheduling, no imported replay viewer or live batch runner, no independent empirical measure of baseline skill. The static publisher copies only its allowlist; use a fresh CI checkout/output directory when packaging releases. Stop/restart does not save an export automatically. The UI periodically refreshes telemetry, so assistive-technology usability beyond native controls has not been audited.
