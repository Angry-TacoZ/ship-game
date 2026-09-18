---
name: delivery-to-release
description: Move meaningful work from defined scope through verified release and post-release review.
---

# Delivery to Verified Release

1. Define the problem, acceptance criteria, constraints, non-goals, risks, and observable definition of done in the related issue or pull request.
2. Separate deterministic correctness tests from quality evaluations.
3. Before merge or deployment, run applicable lint, type checks, tests, builds, smoke tests, security scans, dependency checks, and evaluations.
4. Record material architecture decisions and tradeoffs.
5. Review client, server, database, third-party, filesystem, CI/deployment, and untrusted-input boundaries.
6. Preserve actionable logs, safe errors, appropriate metrics, and release-to-commit traceability.
7. Verify the live deployment before claiming release success.
8. Document rollback and recovery before material deployment or persistent-data changes.
9. Keep lockfiles, safe environment examples, configuration, runtime requirements, and clean-machine reproduction paths current.
10. After shipping, verify intended improvement and check for correctness, quality, reliability, security, cost, latency, and usability regressions.
