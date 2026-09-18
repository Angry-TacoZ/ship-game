---
name: evaluation
description: Evaluate meaningful AI and agentic changes using reproducible baseline and candidate evidence.
---

# Evaluation Workflow

Use this workflow for meaningful AI, agentic, retrieval, scoring, ranking, parsing, recommendation, or automation changes.

1. Establish a runnable, documented baseline and preserve reproduction evidence.
2. Create a fixed set covering normal, edge, ambiguous, malformed, failure, and known-weakness cases.
3. Define purpose-appropriate metrics before judging results.
4. Run baseline and candidate on the same inputs and rubric while controlling the environment where practical.
5. Record the observed problem, evidence, change, post-change result, and disposition.
6. Preserve useful failed experiments.
7. Test failure behavior, including missing or bad inputs, conflicting evidence, tool/API failures, timeouts, empty retrieval, low confidence, permission failures, quota limits, disagreement, and retry exhaustion.
8. Separate model claims, deterministic verification, reviewer challenges, and the accepted result.
9. Record resource use where practical.
10. Make routing and human approval explicit for multi-model, multi-agent, high-impact, or ambiguous work.
11. Provide setup, versions, dependencies, data, commands, expected outputs, runtime, and cost where relevant.
12. Preserve raw evidence and report all cases, limitations, regressions, and exclusions.
13. Match claims to the tested scope and evidence.
14. Do not mark the evaluation complete until baseline, cases, metrics, candidate results, failure/regression review, decisions, reproduction steps, and remaining uncertainty are recorded.

Recommended artifacts:

```text
evals/
├── cases/
│   └── eval_cases.json
├── results/
│   ├── baseline.json
│   └── candidate-v1.json
├── trajectories/
└── README.md
```
