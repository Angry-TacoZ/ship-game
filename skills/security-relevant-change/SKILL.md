---
name: security-relevant-change
description: Review, implement, verify, and report changes involving trust boundaries, untrusted input, secrets, access control, or sensitive side effects.
---

# Security-Relevant Change

Before editing:

1. Identify browser/client, server, database, third-party, filesystem, CI/deployment, and external-input boundaries.
2. Identify request bodies, query parameters, headers, cookies, local storage, uploads, webhooks, database content, and provider responses that are untrusted.
3. Identify authentication, authorization, validation, logging, secret, and side-effect paths.
4. Prefer existing framework security primitives.

During implementation:

1. Use trusted-boundary validation and allow-lists.
2. Centralize security-sensitive decisions.
3. Enforce authorization server-side.
4. Keep secrets and sensitive operations server-side.
5. Use safe database, shell, file, randomness, logging, and error-handling patterns.
6. Add exposure-appropriate limits and abuse controls.
7. Make invalid states difficult to represent and avoid happy-path-only behavior.
8. Update related contract consumers and documentation.

Verify relevant tests, type checks, lint/build checks, runtime checks, allowed and denied access paths, malformed and boundary inputs, and injection/path-traversal risks where applicable. If verification cannot be run, state exactly what was not verified and the remaining risk.

Report trust boundaries, secret access, validation and access-control checks, failure cases tested, and remaining security risks.
