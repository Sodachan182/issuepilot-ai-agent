# Final report

- Repository: https://github.com/Sodachan182/issuepilot-ai-agent
- Green CI run: https://github.com/Sodachan182/issuepilot-ai-agent/actions/runs/45223009880 (secrets, backend Ubuntu, backend Windows, frontend, Playwright e2e: all success)
- Built by Claude Code on 2026-11-23/24 from the specs in `docs/` (Antigravity was unavailable).

## Feature checklist

| ID | Feature | Status |
|---|---|---|
| F-01..F-03 | Connect repo, sync issues (PRs filtered, cap), demo workspace (40 issues, 4 duplicate pairs, 2 injection samples) | ✅ |
| F-04 | Triage: category, severity, priority, labels, duplicates, next steps, draft reply, evidence, confidence | ✅ |
| F-05 | Gemini provider (structured JSON, retry once, error mapping) | ⚠️ Implemented and mock-tested; not verified live (no API key) |
| F-06 | Heuristic provider, labelled as rule-based | ✅ |
| F-07 | Prompt-injection detection and output guards | ✅ |
| F-08 | TF-IDF duplicate detection | ✅ |
| F-09..F-11 | Inbox, workspace, proposals (edit/approve/reject) | ✅ |
| F-12, F-13 | Write policy, dry run, typed confirmation, audit log | ✅ (writes verified with mocks only) |
| F-14 | History | ✅ |
| F-15 | Light/dark themes, responsive, keyboard | ✅ |
| F-16, F-17 | Tests, CI, README with real screenshots | ✅ |
| F-18 | OpenAI-compatible provider (ShopAIKey) | ⚠️ Implemented and mock-tested; not verified live (no URL/key) |
| F-19..F-24 | Reports + export, compare view, settings test connection, eval script, shortcuts, stale-analysis detection | ✅ |
| F-25 | Command palette | ❌ Not built (P2) |
| F-26 | Re-analysis diff | ❌ Not built (P2) |
| F-27 | Label mapping editor | ❌ Not built (P2) |
| F-28 | Embedding re-ranking | ❌ Not built (P2) |
| F-29 | CSV export | ❌ Not built (P2) |

## Test results (from tool output)

- Backend: 159 passed, 1 deselected (opt-in live test); coverage 93% of `app/`; ruff clean.
- Frontend: 22 vitest tests passed; eslint and `tsc` clean; production build succeeds.
- Playwright: 13 passed in Chromium, including axe with 0 serious/critical violations on 6 pages in both themes.
- CI: all 5 jobs green on run 45223009880.

## Live verification

- Real GitHub read-only: `pallets/flask` synced (1 open issue, 3 PRs skipped) and analyzed heuristically; repository correctly reported as not writable.
- Gemini: not verified live. ShopAIKey: not verified live. No live GitHub writes were performed.

## Evaluation

Heuristic on the 40-issue synthetic, self-authored set: category 34/40, severity exact 35/40, within one level 39/40, duplicate pairs 4/4. Not a benchmark.

## Known limitations and next steps

1. Add a `GEMINI_API_KEY` to `.env`, set `AI_PROVIDER=gemini`, run `eval/run_eval.py --provider gemini` and the live test, and record the results.
2. Lexical duplicate detection misses paraphrases; optional embedding re-ranking (F-28).
3. Local single-user tool with no authentication; do not deploy publicly as-is.
4. P2 features listed above.

## CV bullets (verified facts only)

- Built IssuePilot, a full-stack GitHub issue triage tool (FastAPI, React/TypeScript, SQLite) that classifies issues, suggests severity, priority and labels, and drafts maintainer replies using Gemini structured output with a deterministic offline fallback.
- Designed a human-in-the-loop write path: label and comment changes require preview, approval, typed confirmation, a repository allowlist and a live GitHub permission check, with a full audit trail.
- Hardened LLM handling of untrusted issue text with delimited inputs, label and duplicate allow-listing, verbatim evidence verification and an injection detector covered by 26 adversarial and benign test cases.
- Shipped with 159 backend tests (93% coverage), 22 frontend tests and 13 Playwright end-to-end and accessibility checks running in GitHub Actions on Ubuntu and Windows.
