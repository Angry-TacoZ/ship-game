---
name: readiness-review
description: Assess and report application readiness for a declared operating scope.
---

# Production Readiness Review

1. Declare the intended operating scope.
2. Review applicable correctness, security and privacy, data integrity, reliability, observability, delivery, performance, accessibility, external-service/cost, and documentation areas.
3. Apply scope-appropriate expectations. Do not require internet-scale controls for a private local application, but do not omit controls required by public or high-impact use.
4. Treat exposed credentials, missing authorization, unvalidated trust-boundary input, critical dependency risk, failing required checks, missing recovery, unsafe schema changes, uncontrolled paid calls, untraceable public deployments, and silent data-loss or false-success paths as blockers when applicable.
5. Assign exactly one readiness status:
   - `PRODUCTION-READY FOR DECLARED SCOPE`
   - `CONDITIONALLY READY`
   - `NOT PRODUCTION-READY`
   - `NOT ASSESSED`
6. Report conditional or not-ready status near the top of the final report.
7. For each blocker, provide evidence, likely impact, and the smallest credible remediation.
8. Separate confirmed defects from unverified risks.
9. Include a compact matrix using `pass`, `fail`, `not applicable`, or `not verified` for substantial application work and readiness reviews.
10. Qualify readiness claims by scope and evidence date.
