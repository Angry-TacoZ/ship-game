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

## Island collision fix

- Added shared collision resolution against the procedural outer shoreline, with clearance based on the rendered hull footprint.
- Player ships remove inward velocity when they collide, preserving shoreline sliding; enemies use position constraints because their movement remains direct position stepping.
- Added `?verify-island-collision` browser verification coverage.
- `npm run verify` passes on the island-collision branch.
