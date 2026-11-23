---
name: issuepilot-safety-rules
description: Use when touching GitHub client code, actions/proposals, prompts, guards, or anything that handles tokens or untrusted issue text.
---

# IssuePilot safety rules

- Only `backend/app/actions/service.py` may call `GitHubClient.add_labels` / `create_comment` (enforced by `tests/unit/test_policy_static.py`).
- Never add close/reopen/lock/edit-issue/remove-label/create-label operations.
- Write policy (`app/actions/policy.py`): DEMO_REPO, WRITE_DISABLED, NO_TOKEN, REPO_NOT_ALLOWLISTED, NO_PUSH_PERMISSION,
  PROPOSAL_NOT_APPROVED / ALREADY_APPLIED, CONFIRMATION_MISMATCH; apply also checks ISSUE_CLOSED,
  ISSUE_CHANGED_SINCE_ANALYSIS and NOTHING_TO_APPLY after re-fetching the issue.
- Issue text and model output are untrusted: escape + delimit (`guards.escape_for_prompt`), allow-list labels and duplicates,
  verify evidence quotes verbatim, sanitize drafts. The model gets no tools.
- Never silently fall back from AI to heuristic output; label heuristic results as rule-based.
- Secrets: `SecretStr` only, never in API responses, logs or audit details; run `scripts/check-secrets.ps1` before pushing.
- Never perform live GitHub writes during development without explicit user approval.
- Tests that must stay green: T-POL-*, T-APP-*, T-SEC-*, T-INJ-* (see `docs/TEST_PLAN.md`).
