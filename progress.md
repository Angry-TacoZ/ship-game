Original prompt: Recover the playable browser naval game and continue its development.

## Current state

- The recovered static game is prepared for GitHub Pages.
- `npm run verify` checks desktop pointer and mobile touch startup/gameplay paths and saves ignored screenshots in `output/playwright/`.
- The public title is intentionally a neutral genre label until James chooses a final game name.
- Player defeat now clamps hull to zero, stops the run, and shows a mission-lost menu with a return path.

## Follow-ups

- Choose a final title and centralize it in a configuration value before applying it to visible UI and metadata.
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
