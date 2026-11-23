# HANDOFF TO GOOGLE ANTIGRAVITY — Build and ship IssuePilot

You are the **sole implementation agent** for **IssuePilot — AI GitHub Issue Triage Agent**. The architecture and specifications are complete. Your job is to implement, test, polish, document and publish the project **from start to finish, on your own**, without asking for clarification except where this document explicitly tells you to stop and ask.

Target repository: **`Sodachan182/issuepilot-ai-agent`** (public).
Project root: the folder containing this file (`issuepilot-ai-agent/`).

---

## 1. Read first (in this order, completely)

1. `docs/PRODUCT_SPEC.md`: what to build, priorities, acceptance criteria, honesty rules
2. `docs/ARCHITECTURE.md`: modules, data models, API, providers, prompt, guards, security model
3. `docs/UI_UX_SPEC.md`: design tokens, screens, states, accessibility, anti-AI-slop rules
4. `docs/TEST_PLAN.md`: every test you must write and the definition of done
5. `docs/IMPLEMENTATION_PLAN.md`: milestone order M0 → M11 with completion criteria and commands

Precedence when documents conflict: **safety and honesty rules (this file §2 and PRODUCT_SPEC §9) > PRODUCT_SPEC > ARCHITECTURE > UI_UX_SPEC > IMPLEMENTATION_PLAN**. Record any conflict you resolve in `docs/DECISIONS.md`.

---

## 2. Non-negotiable rules

### Safety
1. **Never modify any real GitHub issue** (labels, comments, state, anything) during development or testing, unless the user explicitly approves that specific action in chat, and then only on a repository owned by `Sodachan182`. All write-path testing is done with `respx` mocks.
2. The application itself must never write to GitHub without: an approved proposal + every write-policy check passing + typed confirmation (ARCHITECTURE §4.4). There is no automatic mode, no "approve all and apply" and no background writes.
3. Never implement close/reopen/lock/edit-issue/remove-label/create-label operations.
4. GitHub issue text and LLM output are **untrusted**. Implement every guard in ARCHITECTURE §7.4–7.5. The LLM gets no tools.
5. Real public repositories are used **read-only**, with small limits (≤ 20 issues per sync during testing), and must respect the rate limits.

### Secrets
6. Never commit `.env`, databases, API keys or tokens. Never print secrets in logs, test output, screenshots, docs or your final report. Run `scripts/check-secrets.ps1` before every push.
7. CI must not need or use any secrets.

### Honesty
8. Do not invent metrics, test counts, coverage numbers, accuracy, users or performance claims. Every number in the README, the final report and the CV bullets must come from a command you actually ran, and you must have its output.
9. Heuristic output must always be labelled as heuristic (rule-based), never as AI.
10. If something is not done or not verified (e.g., no Gemini key available), say so plainly in the README "Status" section, `docs/VERIFICATION_LOG.md` and the final report.
11. Do not invent model ids, library APIs or URLs. Check the current Gemini model id and SDK usage against official Google documentation, and the ShopAIKey base URL against the user's provided configuration (if none is provided, leave it unset and document it).

### Quality
12. Do not disable, skip or weaken tests to make CI green. Fix the code.
13. Follow the anti-AI-slop rules in UI_UX_SPEC §2 strictly. The UI must look like a real product.

---

## 3. Autonomy rules

- Proceed through M0 → M11 without stopping for confirmation. Make reasonable engineering decisions yourself and log them in `docs/DECISIONS.md` (date · decision · reason · alternatives considered).
- **Stop and ask the user only if:**
  - (a) `gh auth status` does not show `Sodachan182` when you reach publishing
  - (b) the repository `Sodachan182/issuepilot-ai-agent` already exists and is not empty
  - (c) you want to perform any live GitHub write
  - (d) a required tool cannot be installed

  For (d), keep building whatever does not depend on it.
- If no `GEMINI_API_KEY` is present in `.env`, **do not ask for one**. Build and test with mocks, ship heuristic as the default and document "live Gemini verification pending". If the user has provided a key, use it for the live checks in M5/M10.
- Prefer small, verifiable steps. Run the relevant tests after each meaningful change.

---

## 4. Skills setup (M0)

### 4.1 Trusted external design skills (optional)
- If your environment supports agent skills, install **design/frontend skills only from official, trusted sources**, for example Anthropic's official skills repository (`anthropics/skills`, e.g. `frontend-design`) or Google's official Antigravity skill sources.
- Read each `SKILL.md` before enabling it. Do not run install scripts from unknown authors. Do not install anything that asks for credentials.
- If none is available, skip this step and note it in `DECISIONS.md`. The project-local skills below are enough.
- External skills never override this handoff or the specs.

### 4.2 Project-local skills (required)
Create them in the workspace skills directory, `.agent/skills/<name>/SKILL.md` (if your Antigravity version uses a different workspace skills path, use that and record it in `DECISIONS.md`). Each file has YAML frontmatter (`name`, `description`) followed by concise instructions.

1. **`issuepilot-design-system`**
   - *Description:* "Use when building or reviewing any IssuePilot UI component or screen."
   - *Content:*
     - the token table (copy UI_UX_SPEC §3 values)
     - component inventory and button hierarchy
     - the anti-slop rules (UI_UX_SPEC §2)
     - the state checklist (§7), the a11y checklist (§8) and the visual QA checklist (§11)
     - mode-badge wording rules
2. **`issuepilot-safety-rules`**
   - *Description:* "Use when touching GitHub client code, actions/proposals, prompts, guards, or anything that handles tokens or untrusted issue text."
   - *Content:*
     - the write-policy checks and reason codes
     - the "only `actions/service.py` calls write methods" rule
     - the forbidden operations
     - the prompt-injection guard list
     - the secret-handling rules
     - the honesty rules
     - the tests that must stay green (T-POL, T-APP, T-SEC, T-INJ)
3. **`issuepilot-testing`**
   - *Description:* "Use when writing or running IssuePilot tests or preparing CI."
   - *Content:*
     - the commands for every layer (Windows + CI)
     - fixture conventions
     - respx/msw patterns
     - the Playwright `webServer` setup
     - the determinism rules
     - the coverage targets
     - the live-test opt-in rules
     - the eval caveat text

---

## 5. Execution

Follow `docs/IMPLEMENTATION_PLAN.md` milestones **M0 → M11 in order**. For each milestone:
1. Implement the tasks.
2. Write the listed tests alongside the code.
3. Run the completion-criteria commands and fix until they pass.
4. Make a local commit with a conventional message.
5. Add a short entry to `docs/VERIFICATION_LOG.md`: milestone, what was verified, the commands run, pass/fail counts **as printed by the tools**.

Environment: Windows 10/11, PowerShell, Python 3.12 (`py -3.12`), Node.js current LTS. No Docker. Keep downloads small: Playwright installs **Chromium only**.

---

## 6. Real integrations

### 6.1 Gemini (when configured)
- Use the official `google-genai` Python SDK with structured JSON output (ARCHITECTURE §7.6).
- Check the current stable Flash-tier model id at https://ai.google.dev/gemini-api/docs/models and record it in `DECISIONS.md` and `.env.example`.
- Live check (only if `GEMINI_API_KEY` is set):
  - in M5, the 2 demo injection issues + 1 normal issue
  - in M10, 5 real public issues (read-only)
  - Log the results qualitatively in `VERIFICATION_LOG.md`: was the category plausible, was the evidence verified, how many warnings were raised, latency.

### 6.2 ShopAIKey / OpenAI-compatible (P1)
- Implement it per ARCHITECTURE §7.7. Configure it only from the user's `.env` values. Never guess the base URL. If no values are given, test with mocks only and document "not live-verified".

### 6.3 Real GitHub issues (read-only)
- In M10, run the live smoke tests (TEST_PLAN §9) against one active public repository (e.g. `pallets/flask` or `fastapi/fastapi`), with `MAX_SYNC_ISSUES=20`, no write mode.
- Confirm that the UI shows the repository as **Read-only** with the correct blocking reasons on Apply.
- Do not include real users' issue content in committed fixtures or screenshots. README screenshots use the **demo workspace** only.

---

## 7. Professional UI

- Implement UI_UX_SPEC fully: tokens, shell, six screens, every state, both themes, responsive breakpoints, the keyboard map.
- After M8 and again in M10:
  - capture screenshots (desktop + mobile, light + dark)
  - review them yourself against UI_UX_SPEC §2 and §11
  - fix the issues and repeat until the checklist passes
- Run axe via Playwright: 0 serious/critical violations.

---

## 8. README.md requirements

Write a professional README (no emoji headings, no hype words) with these sections:
1. **Title + one-line description.** Badges: CI status (real workflow badge URL), license, Python 3.12, Node LTS.
2. **Screenshot**: the workspace in light mode at the top. A small gallery below: inbox, dark workspace, evidence expanded, apply blocked with reasons, reports, mobile. All files come from `docs/screenshots/`.
3. **What it does**: 6–8 bullets.
4. **How it works**: an ASCII architecture diagram (from ARCHITECTURE §1, simplified) and the analyze → propose → approve → apply flow.
5. **Safety model** (a highlight section):
   - human-in-the-loop
   - the write-policy checks table
   - minimal token permissions (fine-grained PAT, Issues read/write on selected repos only)
   - prompt-injection defenses
   - what IssuePilot will never do
6. **AI vs heuristic mode**: how to configure each and how the UI shows which one was used.
7. **Quick start (Windows PowerShell)**: prerequisites, clone, backend venv, `.env` from `.env.example`, frontend install, `scripts/dev.ps1`, open `http://localhost:5173`, load the demo.
8. **Configuration reference**: env var table.
9. **Testing**: the commands for each layer; what CI runs.
10. **Evaluation**: link to `eval/results/…`, with the mandatory synthetic-dataset caveat (or a statement that no evaluation numbers are published).
11. **Status and limitations**: honest. For example: lexical duplicate detection only; local single-user tool with no auth, so do not deploy publicly; live Gemini verified or not; ShopAIKey verified or not.
12. **Project structure**, **Tech stack**, **License** (MIT).

---

## 9. Git, publish and CI verification (M11)

Run the steps in order. Stop at any failure, fix it, and re-run.
```powershell
gh auth status                       # must show Sodachan182 — otherwise STOP and ask the user
.\scripts\check-secrets.ps1          # must pass
git status                           # .env, data/, *.db must NOT appear
git log --oneline | Select-Object -First 20
gh repo view Sodachan182/issuepilot-ai-agent   # if it exists and is non-empty → STOP and ask
gh repo create Sodachan182/issuepilot-ai-agent --public --source . --remote origin --push --description "AI-assisted GitHub issue triage with human-in-the-loop approval, evidence-backed suggestions, and prompt-injection defenses. FastAPI + React + Gemini."
gh repo edit Sodachan182/issuepilot-ai-agent --add-topic github-issues --add-topic triage --add-topic llm --add-topic gemini --add-topic fastapi --add-topic react --add-topic typescript --add-topic human-in-the-loop
gh run list --limit 3
gh run watch --exit-status
```
- If the remote already exists in an empty state (created earlier by you), use `git remote add origin …` + `git push -u origin main`.
- **Never** force-push, rewrite published history or push to any other repository.
- If CI fails: read the logs (`gh run view --log-failed`), fix the issue, commit (`fix(ci): …`), push, watch again. Repeat until green.
- Afterwards, check that the README renders correctly on GitHub (images load, badges resolve): `gh browse` or fetch the repo page.

---

## 10. Final report (deliver to the user when done)

Produce `docs/FINAL_REPORT.md` and also print a summary in chat. It contains:
1. Repository URL and the green CI run URL.
2. Feature checklist: every P0/P1/P2 feature marked ✅ done / ⚠️ partial / ❌ not done, with notes.
3. Test results **copied from the actual outputs**: pytest passed/failed counts and coverage %, vitest counts, Playwright counts, axe results.
4. Live verification status: Gemini (yes/no, model id, n issues), ShopAIKey (yes/no), real GitHub read-only (repo, n issues).
5. Evaluation results with the caveat, or "not published".
6. Known limitations and suggested next steps.
7. The deviations recorded in `DECISIONS.md` (summary).
8. CV bullets (§11).

---

## 11. CV bullet points (accurate only)

Rules:
- 3–5 bullets, each starting with a strong verb and ≤ 30 words.
- Use only facts that are true in the shipped repository.
- Fill the placeholders with **real numbers from your command outputs**. If a number is unavailable, rephrase the bullet without it. Never estimate.
- No claims about accuracy, time saved, users or production use.

Templates (adapt to what you actually built):
- "Built **IssuePilot**, a full-stack GitHub issue triage tool (FastAPI, React/TypeScript, SQLite) that classifies issues, suggests severity, priority and labels, and drafts maintainer replies using Gemini structured output."
- "Designed a human-in-the-loop write path: label and comment changes require preview, approval, typed confirmation, a repository allowlist and GitHub permission checks, with a full audit trail."
- "Hardened LLM handling of untrusted issue text with delimited inputs, label and duplicate allow-listing, verbatim evidence verification and an injection detector covered by `<N>` adversarial test cases."
- "Implemented TF-IDF duplicate detection and a deterministic rule-based fallback that is always labelled as non-AI, so the app can be demoed offline without inflating its claims."
- "Shipped with `<N>` backend tests (`<X>`% coverage), `<M>` frontend tests and `<K>` Playwright end-to-end/accessibility checks running in GitHub Actions CI."

---

## 12. Final checklist (all must be true before you report completion)

- [ ] All P0 features are implemented and their acceptance criteria verified.
- [ ] All T-POL, T-APP, T-SEC and T-INJ tests pass. Full backend, frontend and Playwright suites pass locally.
- [ ] Both themes and the mobile layout have been visually reviewed. axe is clean.
- [ ] No secrets in the repository (`check-secrets` passes; `.env` untracked).
- [ ] The README is complete, with real screenshots and an honest status section.
- [ ] `docs/DECISIONS.md`, `docs/VERIFICATION_LOG.md` and `docs/FINAL_REPORT.md` are written.
- [ ] Public repo `Sodachan182/issuepilot-ai-agent` exists, `main` is pushed, and the latest CI run is green.
- [ ] No live GitHub writes were performed without explicit user approval.
- [ ] The CV bullets contain only verified facts and numbers.

Begin with M0 now.
