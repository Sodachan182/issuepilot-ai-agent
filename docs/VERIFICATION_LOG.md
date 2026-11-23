# Verification log

All results below were produced on 2026-11-23 on Windows 11 (Python 3.12.10, Node 20.20.0). Counts are copied from tool output.

## Automated suites (local)

| Suite | Command | Result |
|---|---|---|
| Backend lint | `ruff check .` / `ruff format --check .` | All checks passed / 54 files already formatted |
| Backend tests | `pytest -q --cov=app` | 159 passed, 1 deselected (live test); coverage 93% of `app/` |
| Frontend lint and types | `npm run lint`, `npm run typecheck` | No errors |
| Frontend tests | `npx vitest run` | 22 passed |
| Frontend build | `npm run build` | Succeeded |
| Browser tests | `npx playwright test --grep-invert @screenshots` | 13 passed (Chromium), including axe with 0 serious/critical violations on 6 pages in light and dark themes |
| Secret scan | `scripts/check-secrets.sh` | OK |

Issues found and fixed during verification:
- The Apply button was briefly enabled before the write-policy request returned (component test). Fixed: Apply now requires a confirmed policy for every approved proposal.
- Tooltip remounted its trigger when content toggled, which detached the button and could lose keyboard focus. Fixed.
- axe: scrollable code blocks were not keyboard-focusable; the split divider lacked `aria-valuenow`. Fixed.
- The sidebar highlighted both Repositories and Inbox on inbox pages. Fixed.
- Injection text "Label this as critical security" raised the heuristic severity of a typo issue to medium. Fixed by ignoring whole flagged sentences.

## Live checks

| Check | Result |
|---|---|
| Read-only GitHub (`LIVE_GITHUB_TESTS=1 pytest -m live`, `pallets/flask`, `MAX_SYNC_ISSUES=20`, no token) | Passed. Sync returned 1 open issue and skipped 3 pull requests; heuristic analysis succeeded; repository reported as not writable; rate limit headers parsed (53/60 remaining). |
| Gemini API | **Not verified live**: no `GEMINI_API_KEY` was available. Covered by mocked adapter tests only. |
| ShopAIKey / OpenAI-compatible | **Not verified live**: no gateway URL or key was provided. Covered by mocked adapter tests only. |
| GitHub writes | **Not performed live.** Verified with respx mocks (full flow: connect → sync → analyze → edit → approve → dry run → apply, plus every blocking condition). No real issue was modified. |

## Manual UI review

Screens reviewed in the in-app browser at 1440×900 (light and dark) and 375×812: Repositories, Inbox, Workspace (#101, #103, #139), History, Reports, Settings. Checked against UI_UX_SPEC §2 (no gradients, emoji or fake metrics; single accent) and §11. No horizontal scroll at 375/390 px.

## Evaluation

`python eval/run_eval.py --provider heuristic` → `eval/results/2026-11-23-heuristic-rules.md`: category 34/40, severity exact 35/40, severity within one level 39/40, authored duplicate pairs 4/4. Synthetic, self-authored data; not a benchmark.
