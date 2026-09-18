---
name: ci-baseline
description: Run repository verification on pull requests and default-branch changes.
---

# GitHub CI Baseline

For a maintained software repository:

1. Configure GitHub Actions for pull requests and pushes to the default branch.
2. Install dependencies using the repository's documented method.
3. Run the repository's canonical verifier, `npm run verify`, including desktop/mobile browser smoke checks. This static game has no production build step. Add lint, deterministic tests, type checks, and security scans to that verifier when they are configured safely.
4. Keep ordinary CI deterministic and non-destructive.
5. Avoid production credentials when tests and builds can run without them.
6. When permissions allow it, require stable CI checks before merging.
7. If CI is intentionally skipped, document the reason.
8. Treat passing CI as evidence, not as an unqualified production-readiness claim.
