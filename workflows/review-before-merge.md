---
name: review-before-merge
description: Confirm an approved review path before merging a non-trivial pull request.
---

# Review Before Merge

1. Determine whether the pull request is non-trivial.
2. Confirm required verification and CI checks have passed.
3. Confirm one approved review path:
   - external review supplied by James with an `Approve` verdict;
   - approval from a distinct GitHub reviewer; or
   - explicit instruction from James to merge without review after the pending review has been disclosed.
4. Do not treat passing checks, marking a draft ready, no comments, a pending reviewer, or a timeout as approval.
5. If the approved path is absent, do not merge.
6. Record the review source and merge authorization in the project report.
