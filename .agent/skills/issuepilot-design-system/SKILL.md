---
name: issuepilot-design-system
description: Use when building or reviewing any IssuePilot UI component or screen.
---

# IssuePilot design system

Source of truth: `docs/UI_UX_SPEC.md` (tokens §3, components §6, states §7, a11y §8, QA §11).
Tokens live in `frontend/src/styles/globals.css` as CSS variables (`:root` light, `.dark` dark) mapped to Tailwind colors
(`bg`, `surface`, `surface-2`, `border`, `fg`, `muted`, `subtle`, `accent`, `accent-text`, `warning`, `danger`, `success`).

Rules:
- One accent (indigo). Semantic colors only for meaning (category chips, severity, warnings).
- No gradients, glows, emoji, sparkle icons, "magic" copy, hero sections or fake metrics. Shadows only on overlays.
- 13 px UI text, 36 px table rows, Inter + JetBrains Mono, lucide icons at 16 px / stroke 1.75.
- Provenance is always visible: use `ModeBadge` / `ProviderPill`. Heuristic output must read "Heuristic (rule-based)"; never "AI".
- Disabled actions use `aria-disabled` plus a reachable explanation (see `ProposalBar`).
- Every data view needs loading (skeleton), empty, error and rate-limited states.
- Check new screens with Playwright + axe (`frontend/e2e/app.spec.ts`, E2E-13) in both themes and at 390 px.
