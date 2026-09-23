# Browser Naval Game Prototype

Recovered from James Lane's [shared Gemini Canvas](https://gemini.google.com/share/58d79ed504b5) on September 18, 2026.

## Play locally

### AI Duel Lab (experimental)

Run `npm ci` then `npm start` and open `http://127.0.0.1:8765/duel.html` for a separate controlled 1v1 experiment. The default deterministic control and labeled mock latency mode require no API key. [AI-DUEL-EXPERIMENT.md](AI-DUEL-EXPERIMENT.md) covers shared combat, fairness controls, telemetry, verification, limitations and the local-only Jev setup. The original Skirmish mode remains below.

From this folder, run:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765 in a browser. Choose **Click to Engage**, **Skirmish**, then a navy.

- W/S or Up/Down: forward/reverse thrust.
- A/D or Left/Right: turn.
- Right-click the ocean: autopilot waypoint.
- Mouse wheel: zoom.
- Escape: pause/resume.
- Weapons automatically target and fire at enemies within range.
- Options includes cruise control; when enabled, left-click or touch sets a waypoint too.

## Recovery scope

`index.html` contains the recovered HTML, CSS, game logic, procedural graphics, and procedural Web Audio. No build step or game engine is required. The original Tailwind CDN dependency remains and needs an internet connection for generated UI styling, including classes introduced during play.

The file was extracted from the running game document. Gemini-injected hosting, authentication, logging, and API bridge scripts were removed. Browser-serialized markup, initial canvas dimensions, and the generated Tailwind style block are retained. This is a recovered standalone snapshot, not the original pre-render HTML file or its editing history.

The game's own inline JavaScript is byte-for-byte identical to the shared version. SHA-256:

```text
7138e94aadced5f1820882b4522f3f44bc1d2a5bc4f800cadb0e238f775fcd2f
```

## Preserve the original feel

Before changing movement or weapons, compare with this recovery baseline:

- Simulation uses a fixed 1000/60 ms step; movement uses `dt / 16.6`.
- Hull acceleration per navy: USA 0.06, Japan 0.045, Germany 0.075, UK 0.09.
- Velocity retains `0.985 ** ts` each update, allowing momentum and gradual deceleration.
- Manual turn rate is `0.018 * ts`; waypoint turn rate is `0.015 * ts`.
- Reverse thrust is -0.4; rotating the hull does not immediately rotate velocity.
- Main shell speed is 11, size 13; secondary speed is 15, size 5. These are straight-moving projectiles, not simulated ballistic arcs or physical mass.
- Main batteries initially stagger by 450 ms per turret, with navy-specific reloads of 11–21 seconds.
- Turret traverse, wake particles, and synthesized gun sounds contribute to the feel.

## Verification and existing limitations

Recovery checks: JavaScript syntax passed; source hash matched the live shared game. Local Chrome checks reached the main menu, nation selection, rendered battlefield/HUD/radar, waypoint activation, and Escape pause. No JavaScript errors were reported at that checkpoint; Tailwind reports its standard development-CDN warning. This was a recovery smoke check, not full gameplay validation or a subjective feel comparison.

Existing issues identified by reading the recovered source, left unchanged to preserve the baseline:

- Every `startGame()` starts another animation loop; restarting a run can stack loops and alter speed.
- The player now enters a defeat state at zero hull, clears active projectiles, and can return to the command menu.
- XP-triggered refits pause gameplay until one reward is selected; on wave 5, the selected reward resumes the final wave.
- Islands use the same procedural outer shoreline for rendering and collision; ships are kept outside the shoreline and slide along it when approaching at an angle.
- Array removal during `forEach` can skip updates; a friendly projectile can damage multiple overlapping enemies after its life reaches zero.

The next engineering step should be a focused gameplay-baseline test and a separate fix for the duplicate animation loop before broader development.

## Agent guidance

This repository uses GitAgent: start with `AGENTS.md`, then `SOUL.md`, `RULES.md`, and applicable files in `workflows/` and `skills/`.

Application, gameplay, user-facing, configuration, dependency, security, deployment, and portfolio changes require a focused `codex/*` branch and pull request. The only local bypass is ordinary explanation-only or documentation-only work that cannot affect runtime behavior and is outside the repository's agent, harness, governance, instruction, and workflow-policy surface; James must explicitly authorize that bypass within Codex. Changes to `AGENTS.md`, `SOUL.md`, `RULES.md`, files under `workflows/` or `skills/`, or any other repository-local file that governs agent behavior or engineering policy always require a branch and pull request.

The guidance was copied from [Test Subject 01](https://github.com/Angry-TacoZ/test-subject-01), commit `af07945` on `codex/gitagent-verifier`. All rules, 13 procedural workflows, four reusable skills, and the PR template are preserved. Adaptations are limited to this recovered single-file game's identity and verification/CI instructions. GitAgent runtime files and generated verification artifacts are ignored.

Test Subject 01's Phaser/Vite application and application-specific verifier scripts were not copied. The project started without a configured Git remote, canonical verifier, or hosted CI/deployment setup. Those are explicit setup gaps, not passing checks; the original verification and review requirements still apply.
