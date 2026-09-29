# PixiJS renderer experiment

This is a separate, opt-in renderer experiment stacked on PR #13's reviewed
Canvas2D head. It does not migrate the game's default renderer or alter gameplay.
Canvas2D remains the normal renderer and simulation owner.

## Design boundary

The existing fixed-step update and single `requestAnimationFrame` loop remain
authoritative. A renderer adapter passes one read-only-by-contract frame
snapshot (existing entity/array references plus camera and viewport values) to
either the original Canvas2D frame painter or PixiJS. Pixi has no ticker and
does not update ships, weapons, wakes, waves, collision, or input. Existing
procedural Canvas artwork is reused as textures for islands, water, ships,
turrets, foam, and shell trails; the experiment does not redraw or rescale the
island buffers. The minimap and HUD remain DOM/Canvas UI shared by both paths.

PixiJS is pinned to 8.21.0 and bundled locally with esbuild. `npm run build`
generates an ignored `assets/generated/pixi-renderer.js`; runtime does not fetch
Pixi or graphics from a CDN. The bundle is loaded only when the loopback-only
renderer lab is selected. Context loss reveals Canvas2D; when WebGL restores,
the experiment resumes Pixi if it was active before the loss. Disposal releases
the renderer/canvas but leaves Canvas/Image sources owned by `NavalArt` intact.

## Functional checks

`npm run verify` builds the local bundle, serves it through the verifier's
explicit allowlist, and tests Pixi activation, WebGL availability, island/ship
submission, unchanged player/world/wave/animation-loop state, viewport resizing,
Canvas2D switching, forced context loss and restore, and disposal. The normal
Canvas gameplay and visual checks still run in the same full verifier.

The matched renderer screenshot is `output/playwright/renderer-pixi-gameplay.png`
after verification (local ignored artifact). It uses the same live world, HUD,
assets, camera placement, and game state; it is a smoke/parity artifact rather
than a pixel-diff target because Canvas and WebGL sampling/compositing differ.

## Reproducing the controlled comparison

Start a static server from the repository root, then run the same 1440×900
eight-scene/seven-mode, 30-warm-up/180-measured-frame matrix once per renderer:

```powershell
python -m http.server 4186 --bind 127.0.0.1
# In another terminal:
$env:PROFILE_BASE_URL='http://127.0.0.1:4186'
$env:PROFILE_RENDERER='Canvas2D'
node scripts/profile-renderer.mjs pixi-canvas
$env:PROFILE_RENDERER='PixiJS/WebGL'
node scripts/profile-renderer.mjs pixi-webgl
```

Each run covers Wave 1/5, zoom .45/.1, stationary/moving player, and full,
no-water, no-wakes, no-islands, no-hulls, no-tracers, and no-water-wakes modes.
This is 56 runs per backend; the paired comparison is 112 runs and 20,160
measured frame intervals. JSON, screenshots, and raw data are ignored under
`output/performance/`. `PROFILE_CASE='5,0.45,true'` and comma-separated
`PROFILE_MODES` can be used for focused debugging, but a subset is not the full
matrix.

Frame interval distributions include browser scheduling and GPU backpressure.
Per-phase numbers are JavaScript scene-preparation/command-submission timings;
Pixi's actual GPU work is deferred to the renderer and is not split into
independent water/island/wake GPU timings. This harness is diagnostic, not a
GPU profiler. Headless or automated browser values are not foreground Chrome
hardware results.

For foreground hardware review, launch the normal local game in Chrome at
`http://127.0.0.1:8765/?renderer-lab`, start Wave 5, and keep the game visible
while switching the two renderer buttons at zoom .45 and .1. Allow several
seconds after each switch and compare the rolling frame p50/p95/p99 shown in
the lower-left panel. Repeat with ships moving/wakes established. This visual
and pacing check is still required before recommending any default migration.

## Scope and status

No change is made to gameplay radius, coast/collision formula, ship collision
clearance, AI, targeting, shell behavior, progression, or controls. The
experiment is not a claim of a faster renderer or a production WebGL migration.
The Canvas and Pixi profiling runs plus actual foreground Chrome measurements
must be reviewed before any decision to replace Canvas2D.

### Initial automated comparison

Windows desktop, Playwright Chromium headless, 1440×900; both runs used the same
fixtures and seven modes, sequentially. Canvas2D is the existing PR #13 path.
Frame interval values below are median/p95 milliseconds (smaller is better).
"Moving" describes the player; AI enemies move in both scenes:

| Wave / zoom / player | Canvas2D | PixiJS/WebGL |
| --- | ---: | ---: |
| 1 / .45 / still | 16.7 / 33.3 | 50.0 / 66.7 |
| 1 / .45 / moving | 16.7 / 33.3 | 50.0 / 66.7 |
| 1 / .1 / still | 16.7 / 16.7 | 50.0 / 66.7 |
| 1 / .1 / moving | 16.7 / 16.8 | 50.0 / 66.7 |
| 5 / .45 / still | 33.3 / 33.4 | 66.6 / 66.8 |
| 5 / .45 / moving | 33.3 / 33.4 | 66.6 / 66.7 |
| 5 / .1 / still | 33.3 / 33.4 | 50.0 / 66.7 |
| 5 / .1 / moving | 33.2 / 33.4 | 50.0 / 66.7 |

In this automated environment Pixi is substantially slower and does not address
the performance gate. Suppressing both water and wakes brings both renderers
near a 16.7ms median, indicating large GPU/compositing work in those layers;
that A/B is diagnostic, not evidence that either effect should be removed. Pixi
scene-submission time is lower than its frame intervals, consistent with work
being deferred to WebGL/GPU scheduling. Runtime verification identifies this
headless browser's WebGL adapter as SwiftShader software rendering, so these
values cannot predict James's foreground GPU. Do not promote Pixi based on these
numbers; the local Chrome foreground comparison remains an acceptance gate.

All 56 cases per backend completed (8 scenes × 7 modes); the full JSON and
screenshots are available in ignored `output/performance/pixi-canvas-ab/` and
`output/performance/pixi-webgl-ab/` artifacts on the implementing machine.
The paired Wave 5 moving/.45 screenshots were visually near-identical in
shoreline, water, ship placement and wakes. The matching test captures are also
generated by `npm run verify`.
