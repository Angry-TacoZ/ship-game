# Painted naval art prototype

These original bitmap assets were generated with the built-in OpenAI image generator for James's approved painted coastal art direction. No runtime or CI call to an image API is required.

- `ocean.png`: overhead open ocean, petrol blue/teal, fine directional ripples and restrained white crests; no land, ships, or baked wakes. The renderer blends opposite edges once and adds a subtle moving overlay.
- `island.png`: transparent land-only cutout with rocky ridges, forest clearings, short sand beaches, and cliff shading. Generated as a centered, continuous, approximately star-convex island with no separate satellite rocks. The renderer samples 128 radial alpha edges and uses that outline for both land rendering and collision. The artwork is uniformly scaled and rotated, never warped to a separate coast.
- `ship-deck.png`: transparent overhead ship, bow right, weathered gray steel and timber deck, compact aft superstructure. No baked main guns: movable turrets are drawn separately. The same deck material supports the existing nation silhouettes and enemy sizes in this prototype.

Generation prompts specified overhead hand-painted strategy-game art, readable masses at gameplay scale, restrained natural color, and matching illumination. Source PNGs retain their generated pixels; trimming, texture edge blending, and resolution limiting occur in cached browser canvases.

## Prototype limits

There is one painted island template and one deck illustration. Island rotation and hull shape/loadout/tint provide variation; separate terrain families and historically distinct ship superstructures remain future art work. Baked light rotates with each sprite. Lower-end mobile GPU performance needs a hardware check before release.

Island caches are at most 1536 pixels on either axis (at most 135 MiB of raw RGBA pixels for 15 islands, excluding decoded source images, GPU copies, and the main canvas). This limits sampling resolution, not world dimensions or collision clearance. The water tile and hull detail are cached; wakes are bounded to 100 points per ship and expire after stopping.
