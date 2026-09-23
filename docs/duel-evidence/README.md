# Verification evidence

Captured locally on September 22, 2026 with Chromium/Playwright.

- `duel-bow.png`: deterministic pose fixture, two forward turrets bearing.
- `duel-broadside.png`: same hull rotated, all four turrets legally bearing.
- `duel-modules.png`: controlled zone impacts and visible engine, helm and forward turret impairments.
- `duel-observed-modules.png`: sampled opponent module booleans and observed salvo status; normal UI does not show hidden impairment countdowns.
- `duel-jev-pending.png` / `duel-jev-applied.png`: **mocked HTTP provider**, exercising the live client/proxy response contract. `MOCK_HTTP_FIXTURE` is visible in the selector. No real provider call or usage occurred. These images demonstrate the timing UI, not Jev quality.
- `duel-result.png`: completed seed-42 deterministic control, including battle summary.
- `control-results.json`: ten full offline controls across five mirrored seed pairs. All five pairs preserve winner, duration and ending HP. Measured local computation latencies are incidental hardware observations, not Jev latency or reproducible timing promises.

`npm run verify` passed 28 Node tests plus all original-game browser paths and the duel desktop/keyboard/touch paths. The external web-game action client also completed its three action-loop captures without a console-error artifact. Full generated captures and exports are in ignored `output/`.

Real Jev trials: zero. Provider connection and comparative model performance remain unverified. No merge or deployment was performed.

PR #10 observer-boundary controls: `pre-observation-refinement.json` preserves the PR-head baseline before the new observation model; `post-observation-refinement.json` records the same 384-condition matrix afterward, including measured module-state and salvo observation delays. Both are offline deterministic controls, not Jev performance evidence.
