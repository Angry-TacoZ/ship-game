---
name: interaction-usability
description: Review and verify user-facing workflows across mouse, touch, keyboard, focus, and semantic interaction paths.
---

# Interaction Usability

1. Treat PC mouse or pointer and mobile touch as the default application baseline.
2. Check whether the project already declares additional input methods.
3. If not, ask James which additional input methods are in scope before implementing or reviewing the primary user workflow.
4. Test every declared input method.
5. Verify semantic buttons for actions, links for navigation, logical focus order, visible focus, touch target size, understandable labels and errors, dialog focus entry/containment/restoration, and no nested interactive controls.
6. Add automated coverage where practical.
7. Record selected methods and verification results in the issue or pull request.
8. Treat any incomplete in-scope input path as a usability defect before marking the workflow verified.
