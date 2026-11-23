# Evaluation: Heuristic (rule-based) (rules)

Date: 2026-11-23 · Mode: heuristic · Prompt/rules: heuristic_v1

> Synthetic, self-authored dataset (n = 40). The expected labels were written by the same project that wrote the issues, so these numbers show consistency on this data and are **not** a benchmark of real-world accuracy.

| Metric | Result |
|---|---|
| Analyses succeeded | 40/40 |
| Category agreement | 34/40 |
| Severity agreement (exact) | 35/40 |
| Severity within one level | 39/40 |
| Authored duplicate pairs found as candidates | 4/4 |

## Category confusion (rows = expected, columns = predicted)

| expected \ predicted | bug | feature_request | documentation | question | maintenance |
|---|---|---|---|---|---|
| bug | 11 | 0 | 1 | 0 | 0 |
| feature_request | 2 | 5 | 1 | 0 | 1 |
| documentation | 0 | 0 | 6 | 1 | 0 |
| question | 0 | 0 | 0 | 6 | 0 |
| maintenance | 0 | 0 | 0 | 0 | 6 |

## Disagreements

- #108 Add a --json output flag to `acme lint`: predicted maintenance/low, expected feature_request/medium
- #111 Broken link to the theming guide on the docs site: predicted documentation/medium, expected documentation/low
- #116 Document how to use DatePicker with React Hook Form: predicted question/low, expected documentation/low
- #120 Flaky test: DatePicker.spec.ts times out on CI: predicted maintenance/medium, expected maintenance/low
- #121 Password reset tokens are written to the server log in plain text: predicted documentation/medium, expected bug/critical
- #129 Dark theme for the DataGrid component: predicted bug/medium, expected feature_request/medium
- #130 Add row virtualization to Table for large datasets: predicted bug/medium, expected feature_request/medium
- #135 Add a copy button to code blocks on the docs site: predicted documentation/low, expected feature_request/low
- #138 Table tutorial uses the removed columns.render API: predicted documentation/low, expected documentation/medium
