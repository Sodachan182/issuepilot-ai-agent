# Decisions

Record of implementation decisions and deviations from the specs. Format: date · decision · reason · alternatives.

| Date | Decision | Reason | Alternatives considered |
|---|---|---|---|
| 2026-11-23 | Implementation done by Claude Code instead of Google Antigravity | The user reported Antigravity was not working and asked for the whole build and publish here | Waiting for Antigravity |
| 2026-11-23 | Default `GEMINI_MODEL=gemini-3.8-flash` | The Gemini models page (ai.google.dev → aistudio.google.com/docs/models) listed it as a stable Flash model on 2026-11-23; `gemini-2.5-flash` is marked deprecated with routing changes from 2026-12-01 | `gemini-3.6-flash` (also stable), `gemini-flash-latest` alias (not pinned) |
| 2026-11-23 | Gemini structured output via `response_json_schema` with a hand-written, `$ref`-free JSON schema; Pydantic validates afterwards | Avoids SDK schema-feature mismatches (max lengths, refs); Pydantic remains the source of truth | Passing the Pydantic model as `response_schema` |
| 2026-11-23 | ShopAIKey base URL and model are not hard-coded | No official values were provided; the spec forbids guessing | Shipping a guessed URL |
| 2026-11-23 | Timezone-aware UTC datetimes everywhere | The installed SQLModel version rejects naive datetimes | Annotating fields as naive |
| 2026-11-23 | API routes grouped into `api/system.py`, `api/repos.py`, `api/proposals.py` instead of one file per resource | Fewer files with the same endpoints and behavior | One router module per resource |
| 2026-11-23 | Frontend routes use repository ids (`/repos/:id/issues/:number`) instead of `owner/repo` paths | Simpler routing with no escaping of slashes; the repo name is shown in the header | `owner/repo` path segments |
| 2026-11-23 | Hand-written shadcn-style primitives on Radix (Dialog, Tooltip) instead of running the shadcn CLI; plain table instead of TanStack Table | Fewer dependencies and no interactive CLI; the table needs only sorting, selection and keyboard navigation | shadcn CLI, TanStack Table |
| 2026-11-23 | No `Setting` table; UI preferences (theme, sidebar, split ratio, current repo) live in localStorage | They are per-browser conveniences, not shared state | Persisting them in SQLite |
| 2026-11-23 | Demo repository short-circuits the write policy to a single `DEMO_REPO` reason | Listing unrelated reasons (token, allow-list) for data that does not exist on GitHub was confusing | Listing all reasons |
| 2026-11-23 | Heuristic engine drops whole sentences that contain flagged injection text before scoring | Partial span removal let "critical security" in an injection line raise severity | Removing only the matched span |
| 2026-11-23 | New proposals supersede still-open proposals from an earlier analysis of the same issue (`superseded` status) | Prevents stale suggestions from being applied after re-analysis | Deleting old proposals |
| 2026-11-23 | Tooltip always renders the same element tree | Switching between wrapped and unwrapped trigger remounted the Apply button and lost focus (found by a component test) | — |
| 2026-11-23 | Code blocks in rendered issues are focusable (`tabIndex=0`), and the split divider exposes `aria-valuenow` | Fix axe `scrollable-region-focusable` and `aria-required-attr` findings | — |
| 2026-11-23 | Vitest 3 (not 2) | Vitest 2 bundles Vite 5 types, which conflict with Vite 6 in `vite.config.ts` | Separate vitest config |
| 2026-11-23 | Known heuristic false positives/negatives are accepted and documented, not tuned away | The evaluation set is self-authored; over-tuning would make its numbers meaningless | Adding keywords per failing issue |
| 2026-11-23 | Project-local skills placed in `.agent/skills/` | Matches the handoff; kept for future Antigravity sessions | — |
