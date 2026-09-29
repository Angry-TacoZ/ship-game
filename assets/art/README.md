# Painted naval art prototype

These original bitmap assets were generated with the built-in OpenAI image generator for James's approved painted coastal art direction. No runtime or CI call to an image API is required.

- `ocean.png`: overhead open ocean, petrol blue/teal, fine directional ripples and restrained white crests; no land, ships, or baked wakes. The renderer blends opposite edges once and adds a subtle moving overlay.
- `island.png`: transparent land-only cutout with rocky ridges, forest clearings, short sand beaches, and cliff shading. Generated as a centered, continuous, approximately star-convex island with no separate satellite rocks. The renderer samples 128 radial alpha edges and uses that outline for both land rendering and collision. The artwork is uniformly scaled and rotated, never warped to a separate coast.
- `ship-deck.png`: transparent overhead ship, bow right, weathered gray steel and timber deck, compact aft superstructure. No baked main guns: movable turrets are drawn separately. The same deck material supports the existing nation silhouettes and enemy sizes in this prototype.

Generation prompts specified overhead hand-painted strategy-game art, readable masses at gameplay scale, restrained natural color, and matching illumination. Source PNGs retain their generated pixels; trimming, texture edge blending, and resolution limiting occur in cached browser canvases.

## Prototype limits

There are three painted island families and one deck illustration. `island-lowland.png` adds a triangular meadow/woodland island with a broad sandy shore; `island-spine.png` adds a narrow rugged spine with sparse vegetation. The built-in generator used `island.png` as a style-only reference; briefs required genuinely different silhouettes, centered continuous land, transparent margins, no water/surf, and strict overhead lighting. Each family has its own 128-sample alpha coast shared by rendering and collision. Five of each family appear in each 15-island layout, with random rotations and existing size variation. Historically distinct ship superstructures remain future art work. Baked light rotates with each sprite. Lower-end mobile GPU performance needs a hardware check before release.

Placement rejects overlapping conservative visual envelopes (1.30 times gameplay radius, plus 18px halo and the shadow-offset magnitude), leaving at least 450 world pixels of open water. The origin has at least 700px visual clearance. After 256 rejected attempts a bounded fallback places the island beyond all existing envelopes; the sea is unbounded. Gameplay radii and ship collision-clearance rules are unchanged.

Island caches are at most 1536 pixels on either axis (at most 135 MiB of raw RGBA pixels for 15 islands, excluding decoded source images, GPU copies, and the main canvas). This limits sampling resolution, not world dimensions or collision clearance. The water tile and hull detail are cached; wakes are bounded to 100 points per ship and expire after stopping.

The Canvas performance pass caches water patterns per destination context and
sample resolution. Tint is baked into the unchanged painted texture; two
screen-space fills retain world anchoring and the subtle offset animation.
128/256/512/1024px sampling levels cover the same 1024 world units and reduce
minification work. Low zoom is slightly softer through antialiasing, not a new
palette or replacement painting. Raw water sampling caches occupy 5.3125 MiB.
Wakes retain their original foam texture, three lateral samples, jitter, history
and expiry. Off-screen points are culled conservatively; only subpixel-redundant
centers are skipped, with opacity compensation. Normal-zoom wake spacing is
unchanged. The single 96px foam cache remains 36 KiB. These changes do not by
themselves establish sustained 60 FPS; see the performance investigation.

Shells use three small code-painted sprite pairs (main, secondary, enemy), not generated images: shaded pointed bodies, bright cores, and tapered gold/ember trails. Trails follow velocity and are limited to distance traveled from the launch point, at most 170 world pixels for main shells or 105 for other shells. Rendering uses at most two cached image draws per shell, with no live blur, particle spawning, or history buffers. Collision/damage/speed/lifetime rules remain in the original projectile update path; hit or expired shells draw nothing.
