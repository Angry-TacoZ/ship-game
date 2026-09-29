Original prompt: Recover the playable browser naval game and continue its development.

## Current state

- The recovered static game is prepared for GitHub Pages.
- `npm run verify` checks desktop pointer and mobile touch startup/gameplay paths and saves ignored screenshots in `output/playwright/`.
- The game title is Ship Happens in the browser title and splash/menu branding.
- Player defeat now clamps hull to zero, stops the run, and shows a mission-lost menu with a return path.

## Follow-ups

- Add deterministic simulation hooks before writing deeper gameplay-regression tests.
- Fix the documented duplicate-animation-loop issue in a focused change.

## Five-wave enemy progression

- Added finite rosters for five waves: PT boats only in wave 1, destroyers introduced in wave 2, and increasing mixed fleets through wave 5.
- Wave 5 now ends at a Mission Complete screen instead of opening an unbounded wave 6.
- `npm run verify` passes after the progression change.

## Island collision fix

- Added shared collision resolution against the procedural outer shoreline, with clearance based on the rendered hull footprint.
- Player ships remove inward velocity when they collide, preserving shoreline sliding; enemies use position constraints because their movement remains direct position stepping.
- Added `?verify-island-collision` browser verification coverage.
- `npm run verify` passes on the island-collision branch.

## Enemy orbit behavior

- Replaced the enemy dead-stop at 700 units with a moving combat orbit that corrects radius while applying tangential movement.
- Enemies periodically reverse orbit direction and vary their target radius to create readable evasive shifts.
- Added `?verify-enemy-orbit` browser verification for movement, approach, radius maintenance, and orbit shifting.

## Secondary firing arcs

- Secondary mounts now only select targets within their own port or starboard 180-degree arc; targets directly on the bow/stern centerline remain available to either side.
- Added `?verify-secondary-arcs` coverage for each side accepting its own arc and rejecting the opposite side.

## Smooth enemy steering

- Replaced direct full-speed enemy position stepping with hull heading, velocity, acceleration, and braking state.
- Enemy hulls now turn at class-specific rates, slow through hard turns, and steer toward a short predicted player position.
- Extended `?verify-enemy-orbit` coverage to require bounded speed/heading changes, smooth orbit shifts, and smooth response to player movement for both enemy types.

## Reactive combat steering

- Replaced timer-driven orbit reversal with tactical APPROACH, CROSS, REPOSITION, SEPARATE, and CLEAR steering modes.
- Mode selection now follows range, closing/retreat rate, lateral player movement, nearby islands, and enemy congestion; a short cooldown only prevents rapid mode thrashing.
- Orbit verification now proves distinct decisions for stationary, lateral-moving, retreating, and rapidly closing players, in addition to smooth movement and firing-range checks.

## Committed enemy steering

- Candidate tactical plans now remain candidates until the steering cooldown permits committing them; active movement uses only the committed mode and crossing side.
- Added regression coverage for forward hull/velocity alignment, hard-turn braking, cooldown-held CROSS behavior, delayed REPOSITION, and urgent SEPARATE interruption.

## Ship Happens title and fleet codex

- Renamed the browser title and splash/menu logo to Ship Happens; adjusted the logo for narrow screens.
- Added a main-menu Codex between Options and Credits, with all four playable navy models, country, doctrine summary, weapon stats, and level-one starting values.
- Reused the gameplay hull and turret renderer for codex models so the cards reflect the actual player-ship silhouettes and mounts.
- Added desktop keyboard focus/close behavior and mobile touch scrolling; extended `npm run verify` to check rendered models, displayed stats, and menu navigation.

## Island elevation and detail pass

- Added a focused `codex/island-elevation` branch change for layered island terrain: directional gradients, a cast terrain shadow, contour/cliff accents, low hills, rocks, and more readable tree shading.
- Kept `ISLAND_LAYERS[0]` as the rendered/collision shoreline source and left ship clearance calculations unchanged.
- Added `?verify-island-detail` fixture coverage and an `output/playwright/island-detail.png` screenshot so the visual change is deterministic and inspectable.
- `npm run verify` passes after the island render change.

## PR #9 render-buffer clipping follow-up

- Replaced the fixed `radius * 2.5` backing canvas with bounds derived from the `1.30 * radius` theoretical outer shoreline, maximum layer stroke, `(20, 28)` terrain shadow, tree/hill/rock extents, and 12px per-edge safety padding.
- Stored per-island buffer centers and draw buffers at `island position - buffer center`, preserving the world-space shoreline center.
- Extended `?verify-island-detail` to assert sampled and theoretical render bounds, positive edge padding, world-center placement, and the shared rendered/collision shoreline formula for the required radius-500 seeded fixture.

## Natural island forms and surface texture

- Diagnosed the island as overly concentric: each elevation reused the same 5/7-frequency radial noise, trees were spread evenly, and hills were ellipses.
- Replaced the repeated star-shaped coast with lower-amplitude multi-frequency noise in the shared rendered/collision shoreline function; collision-clearance calculations are unchanged and the 1.30× render bound remains conservative.
- Varied and nested interior elevation contours; softened layer outlines, clustered tree groves without consuming additional game randomness, added deterministic beach grain, and reshaped hills.
- Extended the deterministic island fixture to require nested/divergent interior contours and at least 40 generated shoreline marks.
- `npm.cmd run verify`, `node --check scripts/verify-project.mjs`, and `git diff --check` pass. The fixture reports nested contours, coastline agreement, world-center preservation, 150 shore marks, and positive calculated buffer padding; sampled shoreline max (602.67px) stays below the 650px render bound.
- Inspected the deterministic detail screenshot and an interactive gameplay screenshot showing two naturally generated islands at the viewport edges; no buffer clipping or runtime errors observed.

## Natural palette, foliage silhouettes, and 2D depth

- Replaced orange/yellow and saturated green elevation bands with sand, olive, and moss tones; softened contour contrast while retaining elevation gradients.
- Replaced circular tree crowns and circular highlights with deterministic uneven foliage lobes, directional shading, and clipped branch texture. Shared tree colors now also drive the seeded visual fixture.
- Added small cast shadows below vegetation ledges and offset tree shadows toward the lower right to suggest height in the top-down 2D view. Crown extents remain inside the existing conservative tree buffer bounds.
- Scope is rendering only: shoreline geometry, island centers, collision clearance, AI, waves, controls, and weapons are unchanged by this follow-up.
- Full verifier, verifier syntax check, and diff whitespace check passed. Inspected the seeded island before/after and a gameplay coast screenshot; the Playwright client produced no error log. Bounds retain 12px minimum theoretical safety padding and shoreline/collision agreement.

## Painted naval art prototype

- James approved a fresh painted art direction covering rocky islands, textured teal water, detailed decks, and foam wakes. This replaces the earlier concentric terrain renderer rather than extending its colored shelves.
- Added local generated PNGs and a cached Canvas renderer. Island coast profiles are sampled from the painted alpha silhouette, normalized below the existing conservative render extent, and shared by rendering/collision. World centers and ship-clearance calculations remain unchanged.
- Added moving water texture, broken coastal foam, cached deck artwork and shaded dynamic turrets for the player/Codex/enemies, and bounded trails that follow movement and expire when ships stop.
- James flagged secondary mounts outside the narrower deck. Moved them inboard using a shared layout for rendering and projectile origins; damage, reload, range, shell speed, and side targeting retain their existing rules.
- Bounded island caches to 1536px per axis and culled off-screen islands. A desktop Chromium rendering sample with all 15 islands loaded measured median/p95 frames around 16.7/16.8ms; this is not a mobile hardware benchmark.
- Updated the verifier's static server to allow only the required HTML, renderer, and PNG assets. New checks cover painted pixel variation, actual coast opacity/offshore transparency, cache budgets/centers, every secondary mount fitting the hull and firing from the same position, stopped-wake expiry, and missing-asset startup recovery guidance.
- Remaining art limits: one island painting and one base deck illustration, baked sprite lighting, and unmeasured lower-end mobile performance. No merge or deployment is part of this draft.
- Final full verifier passes, including all 40 secondary mount containment/origin checks, all 128 inner-coast/offshore pixel samples, world centers, cache budgets, and wake expiry. Renderer/verifier syntax and diff whitespace checks pass. Corrected a verifier-only strict floating comparison after reproducing an inward roundoff of 2.84e-14 pixels; collision resolution itself is unchanged.

## Island spacing and distinct terrain families

- James's gameplay screenshot exposed unrestricted overlapping placement and one repeated painted terrain template. Added two original transparent assets via built-in image generation: triangular meadow/woodland lowland and narrow rugged spine. Uniform aspect-preserving normalization retains their distinct silhouettes; each uses its own shared alpha-derived render/collision coast.
- Added bounded rejection placement with conservative visual extents, a 450px minimum water gap and 700px origin clearance. The 15 islands retain their existing radius range; five of each family appear per layout. A bounded outward fallback handles pathological randomness without overlaps or fewer islands.
- Verifier covers 100 seeded layouts and a constant random source, all three distinct shoreline signatures, coast opacity/offshore transparency, bounds and centers for each family. Offshore pixel samples now measure distance from the entire polygon rather than assuming a radial offset clears adjacent headlands.
- Added ignored runtime render artifacts island-families.png and island-layout.png for actual cached terrain review. Existing ship collision-clearance, AI, weapons, progression, and controls are outside this change. Three source families still repeat; lower-end mobile hardware and baked lighting remain review limitations.
