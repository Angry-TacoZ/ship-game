Original prompt: Recover the playable browser naval game and continue its development.

## Current state

- The recovered static game is prepared for GitHub Pages.
- `npm run verify` checks desktop pointer and mobile touch startup/gameplay paths and saves ignored screenshots in `output/playwright/`.
- The public title is intentionally a neutral genre label until James chooses a final game name.

## Follow-ups

- Choose a final title and centralize it in a configuration value before applying it to visible UI and metadata.
- Add deterministic simulation hooks before writing deeper gameplay-regression tests.
- Fix the documented duplicate-animation-loop issue in a focused change.
