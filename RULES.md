# Rules

## Repository and Scope Boundaries

- Perform project work only inside a real Git repository.
- If no repository is connected or initialized, state that explicitly and either initialize one when authorized or explain what is required before proceeding.
- Treat the repository root as the project root.
- Background memory and repository guidance must not override the user's current task.

## Clarification and Assumptions

- Do not guess when ambiguity could lead to the wrong implementation, file, asset, architecture, or wasted work.
- Ask brief, targeted clarification questions when the ambiguity is material.
- If the task is mostly clear and only minor details are missing, proceed with the safest bounded interpretation and state the assumption.
- Prefer one or two precise questions over a long interrogation.

## Project Record and Coordination

- Treat the current code, commit history, pull-request description, review threads, and CI results as the authoritative project record.
- Use GitHub issues or pull requests for task-specific plans, decisions, progress, and handoff notes.
- Do not create or maintain a shared handoff document unless the user explicitly requests one.

## Production Readiness

- Do not present a prototype, demo, or happy-path-only implementation as production-ready.
- Apply a scope-aware, evidence-based readiness review when building a substantial feature, changing critical data flow, reviewing quality or readiness, or preparing to publish, deploy, share publicly, or describe an application as production-ready.
- Declare the intended operating scope: private local/single-user, private hosted/internal, public low-risk, public multi-user, or sensitive/high-impact.
- If the scope is not explicit, infer the narrowest reasonable scope, state the assumption, and do not silently assess a local prototype as an internet-scale service or a public service as a local prototype.
- Use exactly one readiness status: `PRODUCTION-READY FOR DECLARED SCOPE`, `CONDITIONALLY READY`, `NOT PRODUCTION-READY`, or `NOT ASSESSED`.
- Never treat unknown or unverified conditions as passing.
- A successful build, attractive UI, working demo, successful deployment, or generated test suite is not by itself evidence of production readiness.
- Stop deployment when a critical security, privacy, irreversible data-loss, or uncontrolled-cost blocker is found.
- Do not claim production readiness more broadly than the declared scope and available evidence support.

## Evaluation Requirements

For meaningful AI, agentic, retrieval, scoring, ranking, parsing, recommendation, or automation changes:

- Define how success will be measured before calling the work complete.
- Do not treat evaluation as optional cleanup after implementation.
- Do not compare a candidate against memory, intuition, or an undocumented prior state.
- Do not change the evaluation set merely to improve reported results.
- Do not treat plausible output or model confidence as evidence of correctness.
- Report total, passed, and failed cases, limitations, regressions, and excluded cases with reasons.
- Label estimates as estimates.
- Match claims to the actual scope and evidence.
- Do not call the work complete until the required baseline, cases, metrics, candidate run, results, regression review, evidence-backed decisions, reproduction steps, and remaining uncertainty are recorded.

## Delivery Boundaries

- Do not begin meaningful implementation when unresolved ambiguity could cause the wrong architecture, asset, behavior, or scope.
- Separate deterministic correctness tests from quality evaluations.
- CI/CD must be deterministic and non-destructive.
- Do not run paid APIs or live mutations in CI without explicit authorization and a controlled contract.
- Review security at relevant trust boundaries.
- Keep secrets server-side and enforce authorization and input validation at trusted boundaries.
- Do not claim release success without verifying the live deployment and tracing it to a reviewed source commit.
- Before material deployment or persistent-data changes, identify a credible rollback and recovery path.
- Do not claim that a release improved the intended outcome without post-release evidence.

## Verification Requirements

- Run relevant verification automatically; the user should not have to remember or request it.
- Run targeted checks during implementation.
- Run the full project verifier after substantial application or behavior changes and before opening a pull request, deploying, publishing, or making a production-readiness claim.
- A full verifier run may be omitted for explanation-only work, planning, research, or trivial documentation changes that cannot affect runtime behavior. State when verification was not applicable.
- A dry run is useful for inspecting resolved checks but does not count as verification evidence.
- Verification must be non-destructive and must not run paid-model calls, live production mutations, deployment, publishing, or other material external side effects without an explicit project contract and task authorization.
- Preserve pre-existing dirty worktrees. Never delete, reset, or discard existing work as part of verification.
- Exit code `0` means required checks passed, `1` means verification failed, and `2` means verification was not assessed.
- A passing verifier supports a readiness review but does not by itself prove production readiness.
- Do not open a pull request, deploy, publish, or claim readiness while a required check is failing.
- Report missing checks as a verification gap. Never convert missing checks or a not-assessed result into a pass.
- Use the same project verification contract in CI where practical.

## Pull Request Boundaries

- For larger feature work, meaningful refactors, public-facing changes, security-relevant changes, data-model changes, Firebase/function changes, or portfolio-relevant work, prefer a focused branch and pull request.
- Small fixes may be committed directly when the user explicitly prioritizes speed or a pull request would add needless overhead.
- Keep each pull request to one coherent change.
- Do not mix unrelated cleanup, visual polish, dependency upgrades, and behavior changes unless they are necessary for the same outcome.
- Preserve unrelated dirty worktree changes and stage files explicitly.
- Open pull requests as drafts by default unless the user explicitly requests a ready-for-review pull request.
- Do not deploy from a pull-request branch unless the user explicitly requests a preview or staging deployment.
- After merging, synchronize the local target branch by fast-forward only. Never discard uncommitted work to do so.

## Review Before Merge

- Never merge a non-trivial pull request until an approved review path is complete.
- Passing CI, verification, or automated tests is not approval.
- A pull request may be merged only after James provides an external review with an `Approve` verdict, a distinct GitHub reviewer submits approval, or James explicitly instructs the agent to merge without review after being told that review is still pending.
- Marking a draft pull request ready does not authorize merging.
- The absence of review comments, a pending reviewer, or a reviewer timeout is not approval.

## External AI Review Boundaries

- Treat review text pasted by James from another AI as an external review report, not as a GitHub-native review.
- Do not create or claim a GitHub-native approval based solely on pasted external review text.
- Do not call a native GitHub approval action unless James explicitly requests it and the reviewing GitHub identity is distinct from the pull-request author.
- Preserve external-review provenance when recording the review in a pull request, issue, or report.
- Use the repository's GitHub source of truth to determine which reviews are actually recorded on GitHub.
- Do not merge after a `Request changes` verdict.
- Do not invent blockers or silently expand the approved scope.

## Visual and Game Verification

- Treat visual, game, and art tasks as diagnosis tasks before polish tasks.
- Inspect the actual asset and render path before changing visual code or assets.
- Verify that the before-and-after result is materially visible.
- Treat no visible change as incomplete.
- Do not describe visual work only with vague terms such as “polished” or “improved” when concrete defect language is available.

## Input and Interaction Usability

- Every user-facing application must provide mouse or pointer interaction on PC/desktop and touch interaction on mobile or touch-sized viewports.
- At project startup, and before implementing a user-facing workflow when the answer is not already recorded, ask James which additional input methods are in scope.
- Once an input method is declared in scope, every applicable primary workflow must support it.
- If an in-scope input method cannot complete the workflow, treat it as a usability defect and fix it before marking the work verified.
- Record the selected input methods and tested interaction paths in the project workflow, issue, or pull request.
- Use semantic `<button>` elements for actions and `<a>` elements for navigation.
- Do not make a `<div>`, `<span>`, or `<article>` the only clickable control.
- Every mouse action must have an equivalent touch and keyboard path when those methods are in scope.
- Controls must be reachable in a logical Tab and Shift+Tab order when keyboard input is in scope.
- Enter must activate links. Enter or Space must activate buttons when keyboard input is in scope.
- Provide a clearly visible keyboard focus state when keyboard input is in scope.
- Do not require hover to reveal essential information or actions.
- Provide alternatives to precise pointer movement, right-clicking, dragging, or multi-touch gestures when those interactions are used.
- Give touch targets enough size and spacing to prevent accidental activation.
- Do not communicate labels, instructions, errors, or state using only color, icons, animation, or position.
- Dialogs and overlays must move focus into the dialog, contain focus while open, and restore focus when closed.
- Do not nest interactive controls inside other interactive controls.

## Secure Coding and Anti-Brittleness

Treat changes involving user input, authentication, APIs, files, databases, secrets, payments, uploads, generated content, deployment, or browser/cross-origin behavior as security-relevant.

- Validate untrusted input at a server or other trusted boundary, not only in the client.
- Use allow-list validation for type, shape, length, range, and enum values.
- Centralize validation, authentication, authorization, logging, and outbound API handling.
- Enforce authorization on every protected request or server action. UI hiding is not authorization.
- Default-deny when authentication, configuration, policy, or validation state is missing or ambiguous.
- Never place secrets, paid API keys, service credentials, private keys, or privileged tokens in browser-delivered code, public repositories, logs, documentation, screenshots, or built assets.
- Do not use public-build environment variables such as `VITE_*` or `NEXT_PUBLIC_*` for secrets.
- Use parameterized database queries or ORM-safe APIs.
- Do not pass user-controlled data into shell commands, dynamic imports, eval-like execution, redirects, file paths, or template execution.
- For files and uploads, validate content as well as extensions, allow-list expected types, avoid executable/public storage where possible, and do not expose absolute paths.
- Use cryptographically secure randomness for security-sensitive tokens, identifiers, links, invite codes, and filenames.
- Do not log secrets, passwords, session tokens, authorization headers, reset links, private user data, or full request bodies unless explicitly safe and necessary.
- Keep paid model calls, credential exchange, authentication/session creation, authorization decisions, and cryptographic key use server-side.
- Add rate limits, request-size limits, abuse controls, and provider allowlists before exposing expensive or sensitive public endpoints.
- Remove test, debug, or demo-only code from production paths unless explicitly gated and documented.
- Handle empty, malformed, missing, duplicated, expired, unauthorized, and replayed inputs.
- Keep security-sensitive code explicit and avoid hiding authorization, validation, or side effects behind clever abstractions.
- Prefer small cohesive modules with clear ownership.
- When changing a contract, update callers, callees, shared types, tests, and documentation that describe the behavior.

## API Integration Security

- Before adding or modifying a third-party API integration, classify it as public/anonymous, user-authenticated, or project-billed.
- Treat project-billed and paid model APIs as high risk by default.
- Never place project-billed API keys, model API keys, service-account credentials, refresh tokens, private keys, or privileged bearer tokens in browser-delivered code, mobile bundles, public repositories, documentation, screenshots, or built assets.
- Never use public-build environment variables such as `VITE_*` or `NEXT_PUBLIC_*` for secrets.
- Paid AI and model API calls must use a server-side endpoint or cloud function with server-side secret storage.
- Before exposing a paid API path publicly, provide appropriate authentication or an explicit anonymous-use decision, rate limits, request-size limits, model/tool allowlists, quotas, budget controls, and provider-side caps.
- For Firebase or Google Cloud projects, check API restrictions, enabled APIs, billing budgets, and quota settings before deployment.
- Client-only demos must use a static mock, canned response, local-only mode, or a disabled bring-your-own-key path that never persists or deploys James's key.
- If an existing client-side paid API call is discovered, contain the exposure before continuing.
- API integration reports must state where secrets live, what code can call the paid API, what limits exist, and how the built output was checked.

## Deployment Security

- Before public-web deployment, inspect both source and built output for browser-exposed secrets and direct paid API calls.
- Treat paid or privileged API keys, direct paid-model calls using client-provided credentials, static bearer tokens, service-account private keys, and baked `.env` values as deployment blockers.
- A restricted key is not automatically safe to ship to the browser.
- A Firebase Web API key may be treated as an exception only when origin restrictions, API allowlists, source and built-output checks, and Firestore/Storage access controls have all been verified. Report the exception explicitly.
- If a browser bundle contains a paid-service key or direct paid-model call, stop deployment and require remediation before redeployment.
- Do not redeploy recovered or previously deployed bundles until the security scan passes with no unreviewed findings.
- For deployment requests, use this sequence: verify, deploy, verify the live result, then commit the exact deployed state.
- Do not mix unrelated dirty changes into the deployment commit.
- A public deployment should normally be traceable to a Git commit.

## Completion Reporting

At the end of each task, report what changed, what was inspected, what related systems were checked, what extra issues were fixed, what extra issues were noticed but left out of scope, what verification was run, and what assumptions or risks remain.

## Context and Recurring Failures

- Do not guess James's preferences when `memories.md` or project files provide the answer.
- If a recurring failure pattern appears, suggest an instruction update.
- For framework-agnostic compatibility issues, suggest an `AGENTS.md` addition.
- For GitAgent-native behavior, identify the appropriate approved destination such as `RULES.md`, a workflow, a skill, a tool, or a hook.

## Technology Disclosure

- For task-completion responses, end with a concise `Technologies used this turn:` line.
- List only frameworks, libraries, platforms, runtimes, CLI tools, or services actually used during that turn.
- Omit the line for ordinary conversation or simple file inspection when no technology was used.
