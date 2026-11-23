# IssuePilot

AI-assisted GitHub issue triage with evidence-backed suggestions, prompt-injection defenses and human approval for every change.

[![CI](https://github.com/Sodachan182/issuepilot-ai-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/Sodachan182/issuepilot-ai-agent/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![Python 3.12](https://img.shields.io/badge/python-3.12-3776AB)
![Node 20 LTS](https://img.shields.io/badge/node-20%20LTS-339933)

![Triage workspace](docs/screenshots/workspace.png)

IssuePilot reads issues from a GitHub repository and proposes a category, severity, priority, labels, likely duplicates, next steps and a draft maintainer reply. Every suggestion links back to verbatim quotes from the issue. Nothing is written to GitHub until a person approves the change, previews it and types a confirmation, and only for repositories that are explicitly allow-listed and writable by the configured token.

| Inbox | Evidence | Injection flagged, apply blocked |
|---|---|---|
| ![Inbox](docs/screenshots/inbox.png) | ![Evidence](docs/screenshots/evidence.png) | ![Injection](docs/screenshots/injection-apply-blocked.png) |
| **Dark theme** | **Reports** | **Mobile** |
| ![Dark](docs/screenshots/workspace-dark.png) | ![Reports](docs/screenshots/reports.png) | ![Mobile](docs/screenshots/mobile-workspace.png) |

Screenshots are taken from the running app by `frontend/e2e/screenshots.spec.ts` using the synthetic demo workspace. They show heuristic (rule-based) output, labelled as such.

## What it does

- Connects to public repositories without a token, or to private/authorized ones with a fine-grained token, and syncs open issues (pull requests are filtered out).
- Triages each issue into Bug, Feature Request, Documentation, Question or Maintenance, with severity (critical to low), priority (P0 to P3) and a qualitative confidence.
- Suggests labels, but only labels that already exist in the repository.
- Finds likely duplicates with TF-IDF cosine similarity over cached issues; the model may only confirm or reject those candidates.
- Drafts a reply for the maintainer to edit, sanitized against @mentions and foreign links.
- Shows the evidence for each claim as quotes that the backend has verified appear verbatim in the issue.
- Flags issues that contain text aimed at an AI (hidden HTML comments, "ignore previous instructions", fake system lines, invisible characters).
- Applies approved labels and comments to allow-listed repositories after a dry-run preview and typed confirmation, and records everything in an audit log.
- Tracks analysis runs and exports Markdown/JSON reports.

## How it works

```
 Browser (React + TS + Vite, Tailwind)            FastAPI backend (127.0.0.1:8000)                     External
 ┌───────────────────────────────────┐   /api    ┌────────────────────────────────────────────┐
 │ Repos · Inbox · Triage Workspace   │ ───────▶ │ github/client  ─ read ───────────────────────┼──▶ GitHub REST API
 │ History · Reports · Settings       │          │ triage/service                               │
 └───────────────────────────────────┘          │   ├─ duplicates (TF-IDF, local)               │
                                                │   ├─ guards (injection, allow-lists, quotes) │
                                                │   └─ providers: gemini ──────────────────────┼──▶ Gemini API
                                                │                 openai_compatible ───────────┼──▶ ShopAIKey / gateway
                                                │                 heuristic (offline rules)    │
                                                │ actions/policy + actions/service ─ write ────┼──▶ GitHub (labels, comment)
                                                │ SQLite (issues, analyses, proposals, audit)  │
                                                └────────────────────────────────────────────┘
```

**Flow:** sync → analyze → proposals created → you edit / approve / reject → dry run → typed confirmation → apply → audit.

The language model never has tools and never talks to GitHub. It returns JSON that is validated against a schema (with one retry), filtered, and stored. Only `backend/app/actions/service.py` can call the two GitHub write endpoints, and a test parses the source to enforce that.

## Safety model

**Human in the loop.** There is no automatic mode, no "approve all", and no background writes. Each proposal (add labels, post comment) must be approved individually, and applying requires typing `owner/repo#number`.

**Write policy.** Every check must pass; all failing reasons are shown in the UI:

| Check | Blocks when |
|---|---|
| Demo repository | The repository is the local synthetic demo (always blocked) |
| `GITHUB_WRITE_ENABLED` | Not `true` (default `false`) |
| Token | `GITHUB_TOKEN` is not set |
| Allow-list | Repository is not listed exactly in `WRITE_ALLOWED_REPOS` |
| Permission | GitHub does not report push access for the token (checked live at apply time) |
| Approval | The proposal is not approved, or was already applied |
| Confirmation | The typed text does not match `owner/repo#number` exactly |
| Freshness | The issue was closed or its title/body changed since the analysis |
| Content | Labels no longer exist or are already present, so nothing is left to apply |

**Minimal token permissions.** Reading public repositories needs no token. For writes, create a fine-grained personal access token limited to the specific repositories with **Issues: Read and write** and nothing else. Classic tokens with the broad `repo` scope are not recommended.

**Prompt-injection defenses.**
- Issue text is escaped and wrapped in `<untrusted_issue>` delimiters under a system instruction that treats it as data.
- The model has no tools; its output is schema-validated.
- Labels are kept only if they exist in the repository; duplicate numbers only if they were computed candidates.
- Evidence quotes must appear verbatim in the issue or they are removed (and counted in the warnings).
- Draft replies are stripped of HTML, foreign links and @mentions of anyone except the reporter.
- A detector flags suspicious spans in the UI; the rule-based engine ignores flagged sentences entirely.
- Issue Markdown is rendered without raw HTML, links get `rel="noopener noreferrer nofollow"`, and remote images are blocked until you choose to load them.

**What IssuePilot never does:** close, reopen, lock or edit issues; remove or create labels; write to repositories that are not allow-listed; post anything you have not approved and confirmed. Secrets stay in the backend `.env`; the API only reports whether a key is configured.

## AI mode vs. heuristic mode

| `AI_PROVIDER` | What runs | How the UI labels it |
|---|---|---|
| `heuristic` (default) | Deterministic keyword rules, offline | Amber **Heuristic (rule-based)** badge, "no AI model used" |
| `gemini` | Gemini via the official `google-genai` SDK with a JSON schema | **AI · model-id** with prompt version |
| `openai_compatible` | Any OpenAI-compatible gateway, e.g. ShopAIKey, via the `openai` SDK | **AI · ShopAIKey · model-id** |

If an AI provider is selected but not configured, analysis is refused with a clear message. If the model returns invalid output twice, the analysis is stored as failed. IssuePilot never silently substitutes rule-based output for AI output.

## Quick start (Windows PowerShell)

Prerequisites: Python 3.12, Node.js 20 LTS or newer, Git.

```powershell
git clone https://github.com/Sodachan182/issuepilot-ai-agent.git
```
```powershell
cd issuepilot-ai-agent
```
```powershell
.\scripts\dev.ps1
```

The script creates `backend/.venv`, installs dependencies, copies `.env.example` to `.env` (heuristic mode, read-only), and starts the backend (http://127.0.0.1:8000/docs) and the frontend (http://localhost:5173). Click **Load demo workspace**, then **Analyze untriaged**.

Manual setup, if you prefer:

```powershell
cd backend; py -3.12 -m venv .venv; .\.venv\Scripts\python -m pip install -e ".[dev]"; .\.venv\Scripts\python -m uvicorn app.main:app --port 8000
```
```powershell
cd frontend; npm install; npm run dev
```

To use Gemini, set in `.env`:

```
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-3.8-flash
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | `heuristic` | `heuristic`, `gemini` or `openai_compatible` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | empty, `gemini-3.8-flash` | Gemini credentials and model |
| `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_MODEL` | empty | OpenAI-compatible gateway (e.g. ShopAIKey); take values from your gateway |
| `OPENAI_COMPAT_PROVIDER_NAME` | `ShopAIKey` | Name shown in the UI |
| `AI_TIMEOUT_SECONDS`, `AI_MAX_ISSUE_CHARS`, `AI_MAX_BATCH` | `45`, `12000`, `25` | Request timeout, body truncation, issues per batch |
| `GITHUB_TOKEN` | empty | Optional fine-grained PAT |
| `GITHUB_WRITE_ENABLED` | `false` | Global write switch |
| `WRITE_ALLOWED_REPOS` | empty | Comma-separated `owner/repo` list (exact match) |
| `MAX_SYNC_ISSUES` | `100` | Open issues fetched per sync |
| `DUP_RELATED_THRESHOLD`, `DUP_LIKELY_THRESHOLD` | `0.35`, `0.60` | Lexical similarity thresholds (heuristic, not validated) |
| `DATABASE_URL` | `sqlite:///<repo>/data/issuepilot.db` | Local database |
| `CORS_ORIGINS` | `http://localhost:5173,…` | Allowed browser origins |

## Testing

| Layer | Command | What it covers |
|---|---|---|
| Backend | `cd backend; .\.venv\Scripts\python -m pytest --cov=app` | 159 tests: parsing, GitHub client (respx mocks), injection corpus, output guards, heuristic engine, duplicates, write policy, mocked full write flow, secret leakage, reports |
| Frontend | `cd frontend; npm run test -- --run` | 22 component tests (vitest + Testing Library) |
| Browser | `cd frontend; npx playwright test --grep-invert @screenshots` | 13 Playwright scenarios incl. keyboard-only use, 390 px layout, backend outage, axe checks in both themes |
| Static | `ruff check`, `ruff format --check`, `npm run lint`, `npm run typecheck` | Lint and types |
| Live (opt-in) | `$env:LIVE_GITHUB_TESTS="1"; pytest -m live tests/live -s` | Read-only sync and analysis of a real public repository |

CI (GitHub Actions) runs the secret scan, backend on Ubuntu and Windows, frontend, and the Playwright suite. CI uses the heuristic provider and mocks, so it needs no secrets.

## Evaluation

`eval/run_eval.py` runs a provider over the 40 demo issues and compares with hand-written expected labels. Latest heuristic result ([eval/results](eval/results)):

| Metric | Heuristic (rule-based) |
|---|---|
| Category agreement | 34/40 |
| Severity agreement (exact) | 35/40 |
| Severity within one level | 39/40 |
| Authored duplicate pairs found as candidates | 4/4 |

> Synthetic, self-authored dataset (n = 40). The expected labels were written by the same project that wrote the issues, and the rules were developed alongside this data, so these numbers show consistency on this data and are **not** a benchmark of real-world accuracy. No AI evaluation numbers are published yet.

## Status and limitations

- **Gemini and ShopAIKey were not verified against the live APIs** in this build because no keys were available. Both adapters are covered by mocked tests (request shape, schema, retry, error mapping). See `docs/VERIFICATION_LOG.md`.
- Read-only sync and heuristic analysis were verified against a real public repository (`pallets/flask`).
- Writes to GitHub were verified only against mocked endpoints; no real issue was modified.
- Duplicate detection is lexical; paraphrased duplicates can be missed.
- The heuristic engine is a keyword classifier. In the evaluation above it misclassified, for example, a security report in an example server as documentation.
- This is a local, single-user tool with no authentication. Do not expose the backend publicly.

## Project structure

```
backend/   FastAPI app (app/), tests (tests/), pyproject.toml
frontend/  React + TypeScript + Vite app (src/), Playwright specs (e2e/)
eval/      Synthetic evaluation script, labels and results
docs/      Product, architecture, UI/UX, test and implementation specs; decisions; verification log
scripts/   dev.ps1 (start both servers), check-secrets.ps1/.sh
```

## Tech stack

Python 3.12, FastAPI, Pydantic v2, SQLModel/SQLite, httpx, google-genai, openai · React 18, TypeScript, Vite, Tailwind CSS 4, Radix UI, TanStack Query, react-markdown + rehype-sanitize · pytest, respx, ruff, vitest, Testing Library, Playwright, axe-core · GitHub Actions.

## License

MIT, see [LICENSE](LICENSE).
