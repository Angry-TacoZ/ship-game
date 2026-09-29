# PR #13 Canvas2D performance investigation

The investigation and measurements below are historical evidence from the
Canvas2D optimization pass. See the final-status addendum for the later
foreground comparison and James's manual acceptance of the current build.

Scope: local desktop rendering, preserving the approved painted art. No merge,
deployment, WebGL migration, gameplay changes or new image-generation calls.
Reviewed baseline: `407a0961ada8ced4b56d95c4c8d32f5b9191b4fb`.

## Method and reproduction

Windows, Intel i9-13900KF, NVIDIA RTX 4090 reported by the host, Node 24.13.1,
Playwright Chromium, headless, 1440×900 CSS/canvas pixels. The host GPU name does
not establish Chromium's active acceleration backend; headless results are not
a foreground hardware benchmark or a mobile performance claim.

The loopback-only `?profile-render` diagnostic times ocean, islands, wakes,
particles, ships, projectiles, popups, minimap/UI and total rendering. It is not
loaded in ordinary gameplay. Seven modes suppress drawing, never simulation:
full, no-water, no-wakes, no-islands, no-hulls, no-tracers, no-water-wakes.
No-water retains a solid clear; no-hulls retains guns; no-tracers suppresses
the complete projectile artwork (body and trail), not its simulation.

The seeded snapshot uses all 15 natural island caches, actual Wave 1/5 rosters
(5/20 enemies), 100-point established enemy wakes, stationary/moving player,
60 shells and 40 particles. Fleet positions are intentionally arranged on
screen; this synthetic stress scene can overlap terrain and is not collision
evidence. Wave number in the statistics is authoritative; the top wave banner
is not refreshed by this fixture. Separate live gameplay checks use real AI
and physics. Normal zoom is .45; widest supported zoom is .1.

Each scene/mode has 30 warm-up frames and 180 measured intervals/submissions.
Eight scenes × seven modes × two renderers = 112 runs / 20,160 measured frames.
Island caches are reused between fixtures to avoid repeated 135 MiB allocation
and GC contaminating the comparison. Final baseline and candidate were run
sequentially, without concurrent browser verification.

A supplementary `PROFILE_HEADED=1` run was attempted after the clean matrix.
Its first baseline scene returned frame median/p95/p99 283.6/350.3/367.0ms
despite 1.4/20.8/23.0ms render submission. It was stopped: the cause of this
window/environment scheduling discrepancy was not established, and it is
not comparable to the headless matrix. No foreground candidate improvement
or hardware-accelerated 60 FPS claim is made. James's own foreground-browser
check remains necessary. The partial run is excluded, not reported as passing.

```powershell
python -m http.server 4186 --bind 127.0.0.1
# In another terminal, from this repository:
$env:PROFILE_BASELINE='407a0961ada8ced4b56d95c4c8d32f5b9191b4fb'
node scripts/profile-renderer.mjs baseline-final
Remove-Item Env:PROFILE_BASELINE
node scripts/profile-renderer.mjs canvas-final
# Optional: PROFILE_HEADED=1 for a separate foreground comparison.
# PROFILE_CASE='5,0.45,true' and PROFILE_MODES='full,no-wakes' narrow a run.
```

The baseline runner reads the reviewed renderer with `git show` and serves it
through a browser route, with equivalent phase instrumentation and wake draw
counters. It uses the same current harness/fixtures without changing the
checkout. Raw JSON and eight screenshots per renderer are local ignored
artifacts under `output/performance/{baseline-final,canvas-final}/`.

### Interpretation limits

Phase timers measure JavaScript Canvas command submission plus any deferred
flush that happens there; they are **not independent GPU stage times**.
In particular water commands often submit in <0.1ms, but their work appears
later in the first island/wake draw. Compare disabling water as well as that
near-zero submission timer. A/B deltas are non-additive and can include browser
batch/acceleration changes; negative small deltas are noise, not negative cost.

Frame intervals catch missed 60Hz deadlines even when submission seems cheap.
After all ordinary runs, twelve render-plus-one-pixel-readback samples force
completion separately. Readback can change Canvas acceleration, so it never
precedes subsequent ordinary measurements. This is not a GPU profiler or FPS.

## Accepted changes

- Cache CanvasPatterns per context/sample level instead of recreating them
  each frame; cache remains bounded to four patterns per destination context.
- Bake the original 20% tint once. Two screen-space texture fills replace
  four viewport fills while preserving world anchoring, texture period,
  camera center and offset animation.
- Precompute 128/256/512/1024px water sampling levels. They cover the same
  1024 world units; low zoom has slightly softer antialiasing. No source art,
  palette, islands, deck or tracer textures were replaced.
- Cull wake points and bow foam using conservative visual extents. Skip only
  subpixel-redundant centers, below half the smallest foam footprint, retaining
  full history and compensating skipped opacity. Normal-zoom point spacing,
  original three lateral foam samples and jitter are unchanged.
- Extract only the existing drawing block for opt-in timing/controlled A/B.
  Fixed-step updates, collisions, radius, coast, island placement, controls,
  AI, targeting, weapons and progression are unchanged.

### Experiments rejected

One composite sprite per historical point reduced CPU submission but worsened
Wave 5 frame pacing to approximately 50ms. A shared composite atlas did not
resolve it. Neither is retained. Aggressive 2–3px point decimation produced
visibly dotted normal-zoom wakes; it was rejected in favor of subpixel-only
filtering. Reduced draw count alone was not accepted as a performance win.

## Memory and island resampling

Seed 913 produces fifteen 1529–1532×1536 island caches: **141,109,248 raw RGBA bytes
(134.57 MiB)**. This excludes source PNG decoding, GPU/browser copies, shell
sprites, main canvas and other source canvases. Typical layouts with these
600–1100 world-unit radii reach the same cap; this is not process/VRAM telemetry.

World output dimensions remain the stored render geometry (1648–2910px wide,
1656–2918px high in this fixture), transformed by zoom. At .1 the caches are
strongly minified to about 165–292px; at maximum zoom 2 the large
islands demand more screen pixels than the existing 1536px cache supplies.
Reducing the cap further cannot be justified across supported zooms without
losing detail. No island resolution, world-size, family, spacing or collision
changes were made. Zoom does not regenerate the island cache.

Water sampling caches: **5,570,560 bytes / 5.3125 MiB**, versus the original
1024px tile's 4 MiB (+1.3125 MiB). Single foam cache: **36,864 bytes / 36 KiB**,
unchanged. The diagnostic alone retains a 4 MiB untinted reference water tile;
ordinary gameplay does not retain that diagnostic reference. Hull/source/GPU
memory is reported separately from the island cache, not folded into its cap.

Water: four viewport fills and one pattern creation per frame become two fills
and zero new pattern creations after warm-up. Wakes: absolute worst case stays
**21 × 99 × 3 = 6,237 sprite draws/frame** when all points need rendering. Culling
can reduce this to zero off screen; a representative radius-50 wide-zoom trail
uses 150 versus 297 draws, while normal zoom retains all 297. A claimed universal
reduction would be misleading. Shells remain at most two image draws each
(120 for this 60-shell fixture); hulls remain one cached deck draw per ship
plus existing borders/guns. These are Canvas API counts, not GPU draw calls.

## Historical verification and release gate

At this investigation's checkpoint, the measurements below kept PR #13
draft/unmerged and motivated the [separate renderer proposal](renderer-migration-proposal.md).
No migration was implemented by this Canvas2D pass. The later Pixi experiment
and current release assessment are recorded in the final-status addendum.

## Final controlled measurements

Times are milliseconds: **median/p95/p99**. One clean paired run, not confidence intervals; small differences within noise are not claimed as wins.

| Wave | Zoom | Player | Frame before | Frame after | Submission before | Submission after | Wake draws before/after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.45 | stationary | 16.7/33.3/33.4 | 16.7/16.8/33.3 | 2.0/2.8/3.1 | 2.0/2.8/3.1 | 1485/1485 |
| 1 | 0.45 | moving | 16.7/33.3/33.4 | 16.7/33.4/33.4 | 2.5/3.1/3.7 | 2.6/3.0/3.6 | 1782/1782 |
| 1 | 0.1 | stationary | 16.7/33.3/33.4 | 16.7/16.7/16.8 | 13.0/14.6/17.6 | 11.6/12.4/13.8 | 1485/1485 |
| 1 | 0.1 | moving | 16.7/33.4/33.4 | 16.7/16.8/33.4 | 13.1/16.2/18.9 | 11.5/12.7/13.7 | 1782/1635 |
| 5 | 0.45 | stationary | 33.3/33.4/50.0 | 33.3/33.4/33.4 | 22.9/25.1/27.7 | 22.3/24.5/25.8 | 5940/5940 |
| 5 | 0.45 | moving | 33.3/49.9/50.0 | 33.3/50.0/50.1 | 23.1/25.6/26.7 | 23.2/26.3/29.8 | 6237/6237 |
| 5 | 0.1 | stationary | 33.3/33.4/33.4 | 33.3/33.4/33.5 | 22.4/24.5/26.7 | 20.7/24.0/32.4 | 5940/4764 |
| 5 | 0.1 | moving | 33.3/33.4/33.4 | 33.3/33.4/33.4 | 22.4/24.7/26.7 | 20.6/22.6/25.0 | 6237/4914 |

Wave 1 median pacing is about 60 FPS, with improved wide-zoom tails but occasional missed frames. Wave 5 median remains about **30 FPS at both zooms**. Normal-zoom moving Wave 5 p95 remains about 50ms. Wide-zoom submission falls from 22.4 to 20.6ms, still above the 16.7ms budget. The pass removes avoidable work but **does not meet sustained 60 FPS**. Local desktop release status: **NOT PRODUCTION-READY** for that performance requirement.

### Wave 5 moving: phase submission/flush timings

| Phase | Normal before | Normal after | Wide before | Wide after |
| --- | --- | --- | --- | --- |
| ocean | 0.0/0.1/0.1 | 0.0/0.1/0.1 | 0.0/0.1/0.1 | 0.0/0.1/0.1 |
| water.base | 0.0/0.1/0.1 | removed | 0.0/0.0/0.1 | removed |
| water.pattern | 0.0/0.1/0.1 | 0.0/0.1/0.1 | 0.0/0.1/0.1 | 0.0/0.1/0.1 |
| water.animated | 0.0/0.0/0.1 | 0.0/0.0/0.1 | 0.0/0.0/0.1 | 0.0/0.0/0.1 |
| water.tint | 0.0/0.0/0.0 | removed | 0.0/0.0/0.1 | removed |
| islands | 0.0/0.1/0.1 | 0.0/0.1/0.1 | 10.4/11.4/12.6 | 9.8/10.7/11.3 |
| wakes | 22.7/24.9/25.9 | 22.7/25.6/29.2 | 11.2/13.4/14.1 | 10.3/12.0/13.5 |
| particles | 0.0/0.1/0.1 | 0.0/0.1/0.2 | 0.0/0.1/0.2 | 0.0/0.1/0.2 |
| ships | 0.2/0.3/0.5 | 0.2/0.3/0.3 | 0.2/0.3/0.5 | 0.2/0.3/0.3 |
| projectiles | 0.1/0.3/0.3 | 0.2/0.3/0.3 | 0.2/0.2/0.3 | 0.2/0.3/0.3 |
| popups | 0.0/0.0/0.0 | 0.0/0.0/0.0 | 0.0/0.0/0.0 | 0.0/0.0/0.0 |
| minimapUI | 0.1/0.2/0.2 | 0.1/0.2/0.2 | 0.1/0.2/0.2 | 0.1/0.2/0.2 |
| total | 23.1/25.6/26.7 | 23.2/26.3/29.8 | 22.4/24.7/26.7 | 20.6/22.6/25.0 |

### Controlled removals: all 56 scene/mode pairs

| Wave/zoom/player | Mode | Frame before | Frame after | Submission before | Submission after |
| --- | --- | --- | --- | --- | --- |
| 1/0.45/still | full | 16.7/33.3/33.4 | 16.7/16.8/33.3 | 2.0/2.8/3.1 | 2.0/2.8/3.1 |
| 1/0.45/still | no-water | 16.7/16.8/16.8 | 16.7/16.7/16.8 | 2.3/2.8/2.8 | 2.2/2.7/2.9 |
| 1/0.45/still | no-wakes | 16.7/16.8/16.8 | 16.7/16.8/16.8 | 0.5/0.7/0.8 | 0.5/0.8/0.9 |
| 1/0.45/still | no-islands | 16.7/16.8/16.8 | 16.7/16.8/16.8 | 2.2/2.7/2.9 | 2.3/2.9/3.1 |
| 1/0.45/still | no-hulls | 16.7/33.2/33.4 | 16.7/16.8/33.4 | 2.1/2.7/3.2 | 2.3/2.7/3.4 |
| 1/0.45/still | no-tracers | 16.7/16.8/33.4 | 16.7/16.7/16.8 | 2.1/2.5/2.6 | 2.2/2.5/2.6 |
| 1/0.45/still | no-water-wakes | 16.7/16.7/16.8 | 16.7/16.8/16.8 | 0.5/0.7/0.8 | 0.4/0.6/0.7 |
| 1/0.45/moving | full | 16.7/33.3/33.4 | 16.7/33.4/33.4 | 2.5/3.1/3.7 | 2.6/3.0/3.6 |
| 1/0.45/moving | no-water | 16.7/16.8/16.8 | 16.7/16.7/16.8 | 2.3/3.1/3.7 | 2.4/3.2/3.8 |
| 1/0.45/moving | no-wakes | 16.7/16.8/16.8 | 16.7/16.8/16.8 | 0.5/0.8/1.0 | 0.5/0.6/0.8 |
| 1/0.45/moving | no-islands | 16.7/33.2/33.4 | 16.7/16.8/33.3 | 2.4/3.0/3.7 | 2.5/3.0/3.1 |
| 1/0.45/moving | no-hulls | 16.7/33.4/33.4 | 16.7/33.3/33.4 | 2.4/3.0/3.1 | 2.7/3.0/3.2 |
| 1/0.45/moving | no-tracers | 16.7/33.3/33.4 | 16.7/16.8/33.4 | 2.3/2.8/3.1 | 2.4/2.8/2.9 |
| 1/0.45/moving | no-water-wakes | 16.7/16.8/16.8 | 16.7/16.8/16.8 | 0.5/0.7/0.8 | 0.4/0.6/0.6 |
| 1/0.1/still | full | 16.7/33.3/33.4 | 16.7/16.7/16.8 | 13.0/14.6/17.6 | 11.6/12.4/13.8 |
| 1/0.1/still | no-water | 16.7/16.8/16.8 | 16.7/16.7/16.8 | 3.7/4.4/5.1 | 3.8/4.4/5.0 |
| 1/0.1/still | no-wakes | 16.7/16.8/16.8 | 16.7/16.7/16.8 | 11.5/13.6/16.3 | 10.2/11.3/12.2 |
| 1/0.1/still | no-islands | 16.7/16.7/16.8 | 16.7/16.8/16.8 | 2.2/2.7/2.9 | 2.1/2.9/3.0 |
| 1/0.1/still | no-hulls | 16.7/33.3/33.4 | 16.7/16.8/16.8 | 12.6/15.0/19.6 | 11.4/12.9/14.6 |
| 1/0.1/still | no-tracers | 16.7/16.7/16.8 | 16.7/16.8/16.8 | 11.9/13.4/13.7 | 11.1/12.3/12.6 |
| 1/0.1/still | no-water-wakes | 16.7/16.8/16.8 | 16.7/16.7/16.8 | 2.0/2.5/2.9 | 2.1/2.5/3.1 |
| 1/0.1/moving | full | 16.7/33.4/33.4 | 16.7/16.8/33.4 | 13.1/16.2/18.9 | 11.5/12.7/13.7 |
| 1/0.1/moving | no-water | 16.7/16.8/16.8 | 16.7/16.7/16.8 | 4.0/4.6/5.2 | 3.8/4.5/4.6 |
| 1/0.1/moving | no-wakes | 16.7/16.8/16.8 | 16.7/16.8/16.8 | 10.9/12.5/13.2 | 10.1/10.8/11.2 |
| 1/0.1/moving | no-islands | 16.7/16.8/33.3 | 16.7/16.8/16.8 | 2.5/3.0/3.5 | 2.5/2.8/3.0 |
| 1/0.1/moving | no-hulls | 16.7/33.3/33.4 | 16.7/16.8/16.8 | 12.8/13.7/14.1 | 11.6/12.4/13.1 |
| 1/0.1/moving | no-tracers | 16.7/33.3/33.4 | 16.7/16.8/16.8 | 12.7/13.7/14.3 | 11.5/12.6/13.1 |
| 1/0.1/moving | no-water-wakes | 16.7/16.8/16.8 | 16.7/16.7/16.8 | 2.0/2.4/2.5 | 2.0/2.4/2.6 |
| 5/0.45/still | full | 33.3/33.4/50.0 | 33.3/33.4/33.4 | 22.9/25.1/27.7 | 22.3/24.5/25.8 |
| 5/0.45/still | no-water | 16.7/33.4/33.4 | 16.7/33.4/33.4 | 15.4/16.7/17.3 | 15.1/16.7/17.1 |
| 5/0.45/still | no-wakes | 16.7/16.8/16.8 | 16.7/16.7/16.8 | 0.6/0.8/1.0 | 0.6/0.9/1.0 |
| 5/0.45/still | no-islands | 33.3/33.4/33.5 | 33.3/33.4/33.4 | 21.3/23.7/26.1 | 20.8/22.9/23.6 |
| 5/0.45/still | no-hulls | 33.3/33.4/33.5 | 33.3/33.4/33.4 | 22.9/24.9/26.7 | 22.3/24.3/26.1 |
| 5/0.45/still | no-tracers | 33.3/33.4/33.5 | 33.3/33.4/33.4 | 22.8/25.4/26.6 | 22.4/24.4/25.4 |
| 5/0.45/still | no-water-wakes | 16.7/16.8/16.8 | 16.7/16.8/16.8 | 0.6/0.8/0.9 | 0.6/0.8/0.9 |
| 5/0.45/moving | full | 33.3/49.9/50.0 | 33.3/50.0/50.1 | 23.1/25.6/26.7 | 23.2/26.3/29.8 |
| 5/0.45/moving | no-water | 33.2/33.4/33.4 | 33.2/33.4/33.4 | 15.7/16.9/17.8 | 15.8/17.5/20.0 |
| 5/0.45/moving | no-wakes | 16.7/16.7/16.8 | 16.7/16.7/16.8 | 0.6/0.8/0.9 | 0.6/0.9/1.1 |
| 5/0.45/moving | no-islands | 33.3/33.4/50.0 | 33.3/33.4/50.0 | 21.8/23.9/25.2 | 21.7/24.6/26.3 |
| 5/0.45/moving | no-hulls | 33.3/50.0/50.0 | 33.3/33.4/50.1 | 23.3/25.8/30.8 | 23.0/25.3/26.1 |
| 5/0.45/moving | no-tracers | 33.3/33.4/33.5 | 33.3/33.4/33.5 | 22.0/25.1/26.7 | 22.8/24.9/26.0 |
| 5/0.45/moving | no-water-wakes | 16.7/16.7/16.8 | 16.7/16.8/16.8 | 0.5/0.8/0.9 | 0.6/0.8/1.0 |
| 5/0.1/still | full | 33.3/33.4/33.4 | 33.3/33.4/33.5 | 22.4/24.5/26.7 | 20.7/24.0/32.4 |
| 5/0.1/still | no-water | 16.7/33.4/33.4 | 16.7/33.3/33.4 | 14.0/15.5/16.1 | 13.7/15.4/17.0 |
| 5/0.1/still | no-wakes | 16.7/16.8/16.8 | 16.7/16.7/16.8 | 10.9/12.3/12.4 | 10.1/11.4/11.7 |
| 5/0.1/still | no-islands | 33.3/33.4/33.4 | 16.7/33.4/33.4 | 21.2/23.1/25.0 | 19.2/21.4/22.0 |
| 5/0.1/still | no-hulls | 33.3/33.4/33.4 | 16.8/33.4/33.4 | 22.1/24.4/25.7 | 20.3/21.9/22.9 |
| 5/0.1/still | no-tracers | 33.3/33.4/33.5 | 16.8/33.4/33.4 | 22.1/24.4/25.6 | 20.2/21.9/22.5 |
| 5/0.1/still | no-water-wakes | 16.7/16.8/16.8 | 16.7/16.8/16.8 | 2.2/2.6/3.0 | 2.2/2.8/3.0 |
| 5/0.1/moving | full | 33.3/33.4/33.4 | 33.3/33.4/33.4 | 22.4/24.7/26.7 | 20.6/22.6/25.0 |
| 5/0.1/moving | no-water | 16.7/33.4/33.4 | 16.7/33.3/33.5 | 14.3/15.5/16.5 | 13.2/14.1/14.5 |
| 5/0.1/moving | no-wakes | 16.7/16.7/16.8 | 16.7/16.8/16.8 | 10.9/11.9/12.3 | 10.0/11.3/11.6 |
| 5/0.1/moving | no-islands | 33.3/33.4/49.9 | 16.7/33.4/33.4 | 21.5/26.6/30.8 | 19.1/21.0/21.6 |
| 5/0.1/moving | no-hulls | 33.3/33.4/33.4 | 33.3/33.4/33.4 | 22.3/24.1/25.7 | 20.5/22.3/23.1 |
| 5/0.1/moving | no-tracers | 33.3/33.4/33.4 | 33.2/33.4/33.4 | 22.3/25.0/26.8 | 20.4/22.4/22.9 |
| 5/0.1/moving | no-water-wakes | 16.7/16.8/16.8 | 16.7/16.7/16.8 | 2.2/2.7/3.0 | 2.2/2.9/4.0 |

### Marginal costs in moving Wave 5

Full-minus-disabled **median submission** deltas, not additive GPU costs.

| Removed drawing | Normal before/after | Wide before/after |
| --- | --- | --- |
| Water | 7.4/7.4 | 8.1/7.4 |
| Wakes | 22.5/22.6 | 11.5/10.6 |
| Islands | 1.3/1.5 | 0.9/1.5 |
| Hull art | -0.2/0.2 | 0.1/0.1 |
| Projectile body + tracer | 1.1/0.4 | 0.1/0.2 |
| Water + wakes | 22.6/22.6 | 20.2/18.4 |

Water adds roughly 7–8ms in the heavy scene despite near-zero command timers. Wakes dominate normal zoom; at wide zoom the first island draw charges deferred water work as well as actual resampling. Removing island art drops only around 1–1.5ms from heavy Wave 5 submission and does not cure pacing. Hull/projectile deltas are small; signed tiny negatives are noise. Do not attribute the entire wide `islands` timer to island filtering.

Forced render + readback, twelve samples after ordinary runs: baseline median/p95 31.4/38.6ms; candidate 30.9/37.3ms. These probes are separate from normal frame pacing.

### Live gameplay and visual inspection

Separate fresh normal-game pages (no diagnostic loaded), 1440×900, real Wave
1/5 AI and physics. Setup moved the player outside one naturally generated
coast to make terrain visible, then held forward thrust for 5.5 seconds to
establish wakes. Zoom used actual wheel input; enemies retained natural
spawn/AI movement. This is a smoke test, not a full mission or 20-on-screen
stress test. No invulnerability, weapon or simulation changes were used.

| Wave | Zoom | Frame median/p95/p99 ms | Enemy / player wake points | Runtime errors |
| --- | --- | --- | --- | --- |
| 1 | .45 | 16.7/16.8/16.8 | 500 / 100 | none |
| 1 | .1 | 16.7/16.7/16.8 | 500 / 100 | none |
| 5 | .45 | 16.7/16.8/33.4 | 2000 / 100 | none |
| 5 | .1 | 16.8/33.4/33.5 | 2000 / 100 | none |

Both waves retained 5/20 enemies, positive hull health and PLAYING state;
Escape paused and resumed correctly. Actual generated island cache totals
were 141,121,536 and 141,103,104 bytes (about 134.57 MiB). Warm hull caches were
653,612 bytes in Wave 1 and 959,420 bytes in Wave 5 (about .62/.91 MiB).

Inspected live screenshots at both zooms and paired baseline/candidate stress
screenshots. Island paintings and centers, deck/turret alignment, gold/ember
shell trails and continuous normal-zoom foam remain intact. The water is
slightly softer at low zoom due to prefiltered sampling; its palette, world
scale and moving painted texture are retained. No new flat/clipped terrain
edges or dotted normal-zoom wakes were introduced. Synthetic terrain/ship
overlap is deliberately not treated as a collision defect or clearance proof.
Existing coast-pixel and clearance regression tests remain the collision gate.

The skill-provided web-game Playwright client also reached gameplay, moved
the ship and produced an inspected screenshot without an error log. Local
artifacts are under `output/performance/live/` and
`output/playwright/performance-client/`.

### Regression verification

- `npm.cmd run verify`: **PASS, exit 0** after the final rendering changes.
  Existing startup/menu/Codex, desktop/mobile input, refits/progression,
  weapons/damage/expiry, painted coast/bounds, secondary mounts and 100-seed
  island layout checks remain green.
- Added water blend/anchoring/transform checks at .1/.45/2 zoom. Mean RGBA
  channel deltas versus the resolution-matched original four-pass pipeline:
  .413/.343/.301 (maximum 3/3/2). This isolates compositing/placement; it is
  **not** a pixel-identity claim versus the unfiltered original 1024px texture.
- Repeating water rendering 100 times creates no new patterns after warm-up.
  Wakes retain 100 history points, expire when stopped, draw 297 samples at
  normal zoom, 150 in the radius-50 wide fixture, zero off-screen, and visible
  foam pixels. No composite/atlas wake cache remains.
- Profiling fixtures produce correct 5/20 rosters and all phase timers.
  Ordinary game pages do not load the diagnostic/reference source.
- `node --check` on renderer, diagnostic, profiler and verifier; `git diff
  --check`: **PASS, exit 0**. Diff inspection found no simulation, island
  geometry/placement, asset PNG, dependency, CI workflow or secret changes.

| Local release check | Result |
| --- | --- |
| Existing correctness/input/gameplay regressions | pass |
| Water cache/blend and wake lifetime/visibility regression checks | pass |
| Art screenshots, live Wave 1/5 smoke and browser errors | pass |
| Sustained representative Wave 5 60 FPS | fail |
| Reliable foreground / lower-end mobile performance | not verified |
| Merge, deployment, WebGL migration | not performed |

The earlier PR description's light-scene 16.7/16.8ms sample does not cover
established Wave 5 wake load; this investigation supersedes that performance
readiness claim. The remaining bottleneck warrants the separate proposal,
not a claim that the graphics problem is solved.

## Final status: optimized Canvas2D manually accepted (2026-09-29)

James's original gameplay report concerned an early painted-graphics PR #13
build: severe slowdown, sometimes below roughly 10 FPS, especially while
zooming or with multiple ships visible. That was a user observation, not an
instrumented sample; the exact early tested commit was not recorded.

Canvas2D was optimized afterward in
`171f87bf643e635609e6c35d88e4d97725e94a2f` ("Profile painted renderer and remove
avoidable Canvas work"): cached water patterns, fewer full-screen fills,
prefiltered sampling at wide zoom, wake visibility culling, and skipping only
subpixel-redundant wake centers. PR #14 branched from this already-optimized
state. Its Pixi comparison did not use the original slow implementation.

PR #14 was merged into PR #13 as
`49467a30b63ea57694f60b2dacc8b8c1dfc94e7b`. James subsequently played normal
localhost gameplay without `renderer-lab` and confirmed smooth play under the
previously problematic kind of use. The served checkout was
`77b79463c8dc1dddde07fe76359942295f423d60`, whose file tree is identical to that
merge commit. This is manual/user acceptance, with no invented FPS measurement.
The final documentation, agent-guidance, and workflow cleanup leaves that
runtime unchanged, so this acceptance continues to apply.

The completed foreground Chrome comparison on RTX 4090 / ANGLE D3D11 found no
material Pixi advantage over optimized Canvas2D; see
[the experiment record](pixi-renderer-experiment.md). Canvas2D remains the
normal/default renderer. Pixi and profiling remain loopback-only, explicit
developer options. The original headless and stress measurements remain valid
for their recorded builds and environments; manual acceptance does not erase
them or establish sustained 60 FPS across hardware. Lower-end/mobile hardware
performance remains unverified, separately from the accepted desktop play.
