---
name: external-review-handoff
description: Process external AI pull-request reviews without confusing them with GitHub-native approvals.
---

# External Review Handoff

1. Identify pasted review text from James as an external AI review.
2. State the external verdict, blocking findings, non-blocking findings, and uncertainty.
3. Preserve external-review provenance in the relevant pull request, issue, or report.
4. Check the GitHub source of truth for reviews actually recorded on the pull request.
5. Process the verdict:
   - `Approve` with no blockers: recheck the head, verification, CI, and mergeability before continuing the authorized merge workflow.
   - `Request changes`: implement applicable blockers, update related tests/docs, rerun verification, push, and return for review.
   - `Comment`: assess each recommendation, implement actionable in-scope corrections, and report intentionally omitted suggestions.
   - `Approve` with warnings: distinguish non-blocking follow-ups from conditional approval.
6. Do not merge while the verdict is conditional or blocking findings remain.
