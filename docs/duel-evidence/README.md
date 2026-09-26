# Verification evidence

Captured locally on September 22, 2026 with Chromium/Playwright.

- `duel-bow.png`: deterministic pose fixture, two forward turrets bearing.
- `duel-broadside.png`: same hull rotated, all four turrets legally bearing.
- `duel-modules.png`: controlled zone impacts and visible engine, helm and forward turret impairments.
- `duel-observed-modules.png`: sampled opponent module booleans and observed salvo status; normal UI does not show hidden impairment countdowns.
- `duel-jev-pending.png` / `duel-jev-applied.png`: **mocked HTTP provider**, exercising the live client/proxy response contract. `MOCK_HTTP_FIXTURE` is visible in the selector. No real provider call or usage occurred. These images demonstrate the timing UI, not Jev quality.
- `duel-result.png`: completed seed-42 deterministic control, including battle summary.
- `control-results.json`: ten full offline controls across five mirrored seed pairs. All five pairs preserve winner, duration and ending HP. Measured local computation latencies are incidental hardware observations, not Jev latency or reproducible timing promises.
- `post-review-controls.json`: current schema-v4 deterministic controls after the September 26 external-review fixes. Includes all 384 paired conditions, 96 verification groups, per-scenario results, per-turret opportunity accounting, and truth-only shot prediction/maneuver/dispersion diagnostics. No Jev calls.
- `rejected-range-tuning.json`: compact record of the 1,400-unit sensitivity candidate, rejected after 35 head-on physical-symmetry failures; it is not benchmark evidence.

`npm run verify` passed 48 Node tests plus all original-game browser paths and the duel desktop/keyboard/touch paths. `npm run verify:controls` passed all 96 paired groups, including symmetry, parity, repeatability, update-order, opportunity-lifecycle, and shot-accounting checks. The external web-game action client also completed its three action-loop captures without a console-error artifact. Full generated captures and exports are in ignored `output/`.

Real Jev trials: zero. Provider connection and comparative model performance remain unverified. No merge or deployment was performed.

PR #10 observer-boundary controls: `pre-observation-refinement.json` preserves the PR-head baseline before the new observation model; `post-observation-refinement.json` records the same 384-condition matrix afterward, including measured module-state and salvo observation delays. `post-review-controls.json` supersedes those results for current telemetry semantics and deterministic-policy behavior. All are offline deterministic controls, not Jev performance evidence.
