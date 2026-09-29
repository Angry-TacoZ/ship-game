# Browser naval game agent guidance

This repository uses the GitAgent structure. Read `SOUL.md` for identity, `RULES.md` for hard constraints, and the applicable files under `workflows/` and `skills/` before making changes.

The repository-local GitAgent files are the source of truth for this project. Do not import workspace-specific paths, tools, or instructions from outside this repository.

## Human-reported regression acceptance

Treat James's reproduction of a bug, performance, visual, or usability regression as part of acceptance; record the observed build/commit when possible. Automation helps diagnose and verify behavior, but does not replace that reproduction. After a fix, give James the updated build and ask him to retest the same scenario when practical, before escalating to a larger architecture, replacement technology, or follow-up PR for the same problem. Do not declare the problem fixed solely from automation when a practical retest is available, or still unresolved solely from concerning benchmarks before that retest. Record his confirmation and the exact tested build/commit as acceptance evidence. If retesting is impossible or explicitly declined, record that before escalating.
