---
name: issuepilot-testing
description: Use when writing or running IssuePilot tests or preparing CI.
---

# IssuePilot testing

Windows commands:
- Backend: `cd backend; .\.venv\Scripts\python -m pytest -q --cov=app`; lint `ruff check .; ruff format --check .`
- Frontend: `cd frontend; npm run lint; npm run typecheck; npm run test -- --run; npm run build`
- Browser: `npx playwright install chromium` once, then `npx playwright test --grep-invert @screenshots`
- README screenshots: `npx playwright test --grep @screenshots` (writes `docs/screenshots/*.png`)
- Live read-only (opt-in): `$env:LIVE_GITHUB_TESTS="1"; pytest -m live tests/live -s`
- Evaluation: `backend\.venv\Scripts\python eval\run_eval.py --provider heuristic`

Conventions:
- Backend tests use `tests/conftest.py` fixtures: `configure(**settings)`, `client`, `session`, `gh_mock` (respx, base `https://api.github.test`).
- Fake AI providers via `set_provider_override(...)`; never call real APIs in CI.
- Playwright starts its own backend (port 8011, fresh SQLite, heuristic, writes disabled) and Vite (port 5181).
- Report numbers only from real command output. Eval results always carry the synthetic-dataset caveat.
