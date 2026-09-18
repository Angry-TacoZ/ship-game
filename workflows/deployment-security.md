---
name: deployment-security
description: Verify, deploy, verify the live result, and record the exact deployed state safely.
---

# Deployment Security

1. Identify the deployment target and declared operating scope.
2. Inspect source and built output for paid or privileged credentials, direct paid-model calls, static bearer tokens, service-account private keys, and baked environment values.
3. Run the repository's approved pre-deployment secret and API-exposure scan.
4. If a blocker is found, stop, report the exact exposure, rotate or revoke credentials when necessary, and remediate before redeployment.
5. Verify any accepted Firebase Web API key exception and document the evidence.
6. Check for unrelated dirty worktree changes and exclude them from the deployment commit.
7. Verify the intended source state.
8. Deploy only after applicable checks pass.
9. Verify the live deployment's primary workflow and visible result.
10. Commit the exact deployed state unless James explicitly directs otherwise.
11. Report the deployment target, deployed commit, verification, live result, accepted exceptions, and remaining risks.
