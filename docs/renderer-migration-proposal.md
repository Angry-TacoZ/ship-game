# Separate renderer proposal — approval required

This is a proposal, not implementation or authorization to migrate PR #13.
Keep the painted assets, foam concept, shell trails, and gameplay unchanged.
Use this option only if the Canvas2D performance gate remains inadequate.

## Two approaches

| Approach | Advantages for this game | Costs and risks |
| --- | --- | --- |
| PixiJS with WebGL | Existing sprite/texture batching, tiled water, scene transforms and texture lifecycle; matches this mostly sprite-based scene | New dependency and renderer integration; batching still depends on texture/blend order; overdraw and texture memory still matter |
| Raw WebGL | Complete control over water sampling and instanced trail geometry | Must implement batching, shaders, texture lifetime, context recovery, and debugging; much larger learning and regression surface |

Recommendation: evaluate PixiJS first in a separate draft PR, not a wholesale
game-engine rewrite. Its [official performance guide](https://pixijs.com/8.x/guides/concepts/performance-tips)
describes sprite batching, spritesheets, draw-order constraints, and texture
management. This suggests a suitable fit; it does not prove this game will meet
60 FPS, nor remove the need to measure transparent wake overdraw.

## Renderer boundary

The existing fixed-step update owns movement, targeting, firing, collisions,
wave/refit progression and wake history. It must not use Pixi's ticker to change
simulation timing.

Define a rendering adapter that receives the current read-only world state,
camera/zoom, viewport, time and asset references. Avoid copying large histories
on every frame. Keep input, Web Audio, HTML menus/HUD and collision coast data
outside that adapter. Retain Canvas2D as an A/B reference until acceptance.

- Water: two screen-covering tiled textured layers with the same world anchoring,
  tint and offset animation.
- Islands: uploaded cached artwork, unchanged world rectangles, centers,
  silhouettes and alpha-derived collision outlines.
- Ships: existing cached hull/deck textures with independently transformed
  turret art; preserve secondary visual mounts and projectile origins.
- Wakes: bounded pooled sprites/particles sharing the existing foam texture,
  age, opacity, jitter and draw order. Try batching before changing their look.
- Shells/effects: existing body/trail sprites, bounded pools, matching color,
  length, layering and expiry. No new gameplay particles or damage logic.

## Proposed acceptance gates

1. Reuse the documented 1440×900 eight-scene matrix and all seven A/B modes.
   Include frame pacing, render submission, memory, and real gameplay at both
   zoom levels. Compare on the same machine/browser without concurrent tests.
2. Preserve painted scene screenshots and all existing verifier contracts;
   compare coast/collision alignment, weapon origins, wake lifetime and zoom.
3. Measure sustained Wave 5 gameplay with established wakes and zoom changes,
   not just stationary snapshots. Target near-16.7ms p95 pacing on James's
   desktop; explicitly identify missed frames and browser/hardware limitations.
4. Test resize, menus/Codex, pause/resume, texture disposal/restart and WebGL
   context-loss recovery. Verify mobile/touch separately; no desktop-to-mobile
   performance claim.
5. Review the separate draft before switching the default renderer or deploying.

No dependency installation, WebGL implementation, merge or deployment is part
of the current investigation. James must approve this direction first.
