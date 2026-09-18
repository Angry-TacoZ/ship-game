---
name: api-integration-security
description: Assess third-party API integrations for trust boundaries, secret exposure, abuse controls, and safe deployment.
---

# API Integration Security

When adding or modifying an API integration:

1. Classify access as public or anonymous, user-authenticated, or project-billed.
2. Identify browser/client, server, database, provider, build-output, deployment, and untrusted-input boundaries.
3. Identify credentials, tokens, configuration values, and request paths.
4. Confirm paid or privileged credentials remain server-side.
5. Check for public-build prefixes such as `VITE_*` and `NEXT_PUBLIC_*`.
6. For public paid endpoints, verify authentication or an explicit anonymous-use decision, rate limits, request-size limits, model/tool allowlists, quotas, budget alerts, and provider caps.
7. For Firebase or Google Cloud, check API restrictions, enabled APIs, billing budgets, and quotas.
8. For client-only demos, use mocks, canned responses, local-only mode, or a disabled non-persistent bring-your-own-key path.
9. If a client-side paid call or exposed credential exists, stop further exposure, rotate or revoke affected credentials, remove the exposure from source and built output, and verify before redeployment.
10. Report secret location, callers, controls, limits, and source/build checks.
