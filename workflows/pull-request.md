---
name: pull-request
description: Create, validate, and report a focused pull request for meaningful project changes.
---

# Pull Request Workflow

1. For larger feature work, meaningful refactors, public-facing changes, security-relevant changes, data-model changes, Firebase/function changes, or portfolio-relevant work, create a focused `codex/<short-change-name>` branch.
2. Keep unrelated local changes out of the pull request and stage files explicitly.
3. Run relevant project verification before opening the pull request.
4. Run applicable secret and API-exposure scans for browser-delivered or public deployment work.
5. Open the pull request as a draft unless explicitly asked otherwise.
6. Do not deploy from the pull-request branch unless explicitly requested for preview or staging.
7. After merge, verify the remote merge state, fetch, switch to the target branch, fast-forward only, and confirm local `HEAD` matches the remote target.
8. If synchronization would discard work or is otherwise blocked, leave the checkout unchanged and report the blocker.
9. Report the pull-request link, branch, commit SHA, validation, current status, and remaining work.
