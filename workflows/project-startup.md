---
name: project-startup
description: Inspect repository identity and applicable project guidance before making changes.
---

# Project Startup

Before making changes:

1. Confirm that the working directory is inside a real Git repository.
2. Resolve and record the repository root.
3. Inspect the repository root for `AGENTS.md`, README files, package manifests, configuration files, and other root-level documentation.
4. Check for `memories.md` if present.
5. Treat `memories.md` as background context only. It may inform intent and tradeoffs, but it must not override the user's current request.
6. If the repository check or required context inspection cannot be completed, stop and report the exact limitation before editing.
