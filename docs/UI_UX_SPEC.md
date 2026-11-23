# IssuePilot — UI/UX Specification

> Goal: a calm, dense, trustworthy developer tool in the spirit of Linear and GitHub. Someone who opens it should assume a small product team built it, not a template generator.

---

## 1. Design principles

1. **Content first.** Issues and decisions are the interface. Chrome stays quiet: neutral surfaces, hairline borders, one accent.
2. **Density with breathing room.** Compact 36 px table rows and 13 px UI text, with generous margins between *sections* rather than inside components.
3. **Show your work.** Every AI suggestion can be expanded to see the evidence behind it. Provenance (AI model or heuristic) is always visible.
4. **Safe by design.** Destructive or outward-facing actions look different, explain why they are disabled, and always preview exactly what will happen.
5. **Keyboard-native.** Every core flow can be completed without a mouse.
6. **Honest UI.** No fake numbers, no decorative charts, no "magic" language.

---

## 2. Anti-AI-slop rules (hard requirements — review every screen against this list)

- ❌ No gradient backgrounds, gradient text, glassmorphism, neon glows, blurred blobs or aurora effects.
- ❌ No sparkle ✨ / magic-wand icons and no words like "magic", "supercharge", "unleash", "revolutionize" or "AI-powered insights". Use "Analyze", "Suggestion" and "Draft reply".
- ❌ No emoji in UI chrome, headings, buttons or toasts.
- ❌ No marketing hero sections inside the app. The empty state is one sentence plus two buttons.
- ❌ No fabricated or placeholder metrics, sparklines, trend arrows or "98% accuracy" claims. Charts appear only on Reports, built from real counts.
- ❌ No oversized cards with 32 px padding around one number. No grids of identical stat cards on every page.
- ❌ No more than one brand accent (indigo). Semantic colors are reserved for status and category meaning.
- ❌ No drop shadows on in-flow content. Shadows are allowed only on overlays (popover, dialog, dropdown, toast).
- ❌ No typewriter or streaming animation for AI output, and no bouncing or pulsing "thinking" orbs. Use skeletons and a determinate progress bar.
- ❌ No lorem ipsum, "John Doe" or "Acme Inc." filler in the shell. Demo issues must read like real tracker issues.
- ❌ No centered single-column layouts for data screens.
- ❌ No mixed icon sets. Use lucide only, 16 px, stroke 1.75 (20 px in empty states).
- ✅ Sentence case everywhere. Specific verbs: "Apply 2 labels", "Post comment", "Re-analyze". No exclamation marks.

---

## 3. Design tokens

Implement as CSS variables in `src/styles/globals.css` (`:root` = light, `.dark` = dark) and map them into Tailwind/shadcn theme variables. Exact hex values:

### 3.1 Color — light
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FFFFFF` | App background |
| `--surface` | `#FAFAFA` | Sidebar, table header, panels |
| `--surface-2` | `#F4F4F5` | Hover rows, inputs, code blocks |
| `--border` | `#E4E4E7` | Hairlines, dividers |
| `--border-strong` | `#D4D4D8` | Input borders, focused panels |
| `--text` | `#18181B` | Primary text |
| `--text-muted` | `#52525B` | Secondary text |
| `--text-subtle` | `#71717A` | Meta, timestamps (≥ 4.5:1 on `--bg`) |
| `--accent` | `#4F46E5` | Primary buttons, links, focus ring, selected nav |
| `--accent-hover` | `#4338CA` | |
| `--accent-subtle` | `#EEF2FF` | Selected row tint, accent badges |
| `--accent-fg` | `#FFFFFF` | Text on accent |
| `--focus-ring` | `#6366F1` | 2 px ring + 2 px offset |

### 3.2 Color — dark
| Token | Hex |
|---|---|
| `--bg` | `#0A0A0B` |
| `--surface` | `#111113` |
| `--surface-2` | `#18181B` |
| `--border` | `#26262B` |
| `--border-strong` | `#3A3A42` |
| `--text` | `#F4F4F5` |
| `--text-muted` | `#A1A1AA` |
| `--text-subtle` | `#8B8B95` |
| `--accent` | `#6366F1` (buttons use `#4F46E5` fill for white-text contrast) |
| `--accent-text` | `#A5B4FC` (accent-colored text/links on dark) |
| `--accent-subtle` | `#1E1B4B` |
| `--focus-ring` | `#818CF8` |

### 3.3 Semantic colors
Chips use a **subtle tinted background + colored text + 6 px dot**, never saturated fills. Give each a light and dark pair:

| Meaning | Light text / bg | Dark text / bg |
|---|---|---|
| Category · Bug | `#B91C1C` / `#FEF2F2` | `#FCA5A5` / `#2A1215` |
| Category · Feature Request | `#4338CA` / `#EEF2FF` | `#A5B4FC` / `#1E1B4B` |
| Category · Documentation | `#0369A1` / `#F0F9FF` | `#7DD3FC` / `#0C1F2E` |
| Category · Question | `#A16207` / `#FEFCE8` | `#FDE68A` / `#2A220C` |
| Category · Maintenance | `#3F3F46` / `#F4F4F5` | `#D4D4D8` / `#232327` |
| Severity · critical | `#DC2626` | `#F87171` |
| Severity · high | `#EA580C` | `#FB923C` |
| Severity · medium | `#CA8A04` | `#FACC15` |
| Severity · low | `#71717A` | `#A1A1AA` |
| Success | `#15803D` | `#4ADE80` |
| Warning (heuristic, injection) | `#B45309` | `#FBBF24` |
| Danger | `#B91C1C` | `#F87171` |

Severity is shown as a **4-bar signal icon** (filled bars 1–4) plus a text label, so meaning never depends on color alone.

### 3.4 Typography
- UI font: **Inter Variable** (`@fontsource-variable/inter`), with `font-feature-settings: "cv11", "ss01", "tnum"` for tables.
- Mono: **JetBrains Mono** for issue numbers, labels, model ids, code and confirm inputs.
- Weights: 400, 500 and 600 only.

| Token | Size / line-height | Use |
|---|---|---|
| `text-xs` | 12 / 16 | Meta, chips, table secondary |
| `text-sm` | 13 / 20 | **Default UI text**, table cells, buttons |
| `text-base` | 14 / 22 | Issue body, draft reply editor |
| `text-md` | 16 / 24 | Section titles in panels |
| `text-lg` | 20 / 28 | Page titles |
| `text-xl` | 24 / 32 | Issue title in workspace |

Letter-spacing: −0.01em for ≥ 20 px. Maximum line length for the issue body is 72ch.

### 3.5 Spacing, radius, elevation, motion
- 4 px grid. Common steps are 4, 8, 12, 16, 24 and 32.
- Radius: 4 px for chips and badges; 6 px for inputs, buttons and table selection; 8 px for panels, dialogs and popovers.
- Elevation: overlays only. `0 8px 24px -8px rgba(0,0,0,.18), 0 0 0 1px var(--border)`.
- Motion: 120–160 ms `ease-out` for hover, disclosure and dialog. Honor `prefers-reduced-motion: reduce` (turn off transitions and skeleton shimmer).

### 3.6 Brand
- Wordmark "IssuePilot" in Inter 600, 14 px, with a 16 px mark: a rounded-square outline containing a small upward chevron (a simple compass/pilot idea), drawn in `--accent`. Inline SVG, also used for the favicon.
- No mascot and no illustrations. Empty states use a single 20 px lucide icon inside a 40 px circle filled with `--surface-2`.

---

## 4. App shell

```
┌──────────────┬──────────────────────────────────────────────────────────────────┐
│ ◰ IssuePilot │ acme-widgets ▾   ·  Read-only        [AI · gemini-…] [⟳ 4,812] ◐ │ ← TopBar 48px
│──────────────│──────────────────────────────────────────────────────────────────│
│ Repositories │                                                                  │
│ Inbox        │                    Page content                                  │
│ History      │                                                                  │
│ Reports      │                                                                  │
│              │                                                                  │
│ ──────────── │                                                                  │
│ Settings     │                                                                  │
└──────────────┴──────────────────────────────────────────────────────────────────┘
  Sidebar 224px (collapsible to 56px icons-only; state persisted)
```

- **TopBar:**
  - Repository switcher (combobox of connected repos)
  - Repo mode badge: `Demo data` / `Read-only` / `Write-enabled`
  - Provider pill: `AI · <model>` (indigo outline) or `Heuristic mode` (amber outline + `Cpu` icon), with a tooltip explaining it
  - GitHub rate-limit indicator (`Gauge` icon + remaining count; turns amber below 10%)
  - Theme toggle (Light / Dark / System)
- **Sidebar:** text + icon nav items, 32 px tall. The active item uses the `--accent-subtle` background and `--accent` text with a 2 px left bar.
- Content padding is 24 px on desktop and 16 px on mobile. Page header = title (`text-lg`) + one-line description (`text-sm`, muted) + right-aligned primary action.

---

## 5. Screens

### 5.1 Repositories (`/repos`)
- **Connect form:** a single input (placeholder `owner/repo or GitHub URL`) and a **Connect** primary button. Below it: "No GitHub token configured — public repositories only, 60 requests/hour." (or the authenticated login when a token is set).
- **Secondary action:** "Load demo workspace" (ghost button with `FlaskConical` icon).
- **Repo list:** a table, not cards. Columns are Repository (mono `owner/repo` + description, truncated), Mode badge, Issues cached, Analyzed, Last synced (relative, with an absolute tooltip), and Actions (Sync, Open inbox, Remove local data, each as an icon button with a tooltip).
- **Empty state:** "Connect a GitHub repository to start triaging." + [Connect repository] [Load demo workspace].

### 5.2 Issues Inbox (`/repos/:owner/:repo/issues`)
```
Issues · acme-widgets                                   [Sync] [Analyze untriaged (12)]
[🔍 Search issues…] [Category ▾] [Severity ▾] [Priority ▾] [Status ▾] [Flags ▾]  Clear
┌──┬──────┬───────────────────────────────────────┬──────────┬────────┬────┬────┬──────┬────────┐
│☐ │  #   │ Title                                  │ Category │Severity│Pri │Dup │ Mode │Updated │
├──┼──────┼───────────────────────────────────────┼──────────┼────────┼────┼────┼──────┼────────┤
│☐ │ 142  │ Export to CSV crashes with unicode…    │ ● Bug    │ ▮▮▮▯ hi│ P1 │ ⧉2 │ AI   │ 2h ago │
│  │      │   bug  area:export                     │          │        │    │    │      │        │
```
- Row height 36 px (44 px when existing labels wrap onto the second line, shown as 12 px GitHub-style label pills with the repo label color at 15% opacity).
- Unanalyzed rows show `—` in the analysis columns and a subtle "Not analyzed" status.
- Status column: `Not analyzed`, `Analyzed`, `2 pending` (proposals), `Applied`, `Failed` (danger text + tooltip with the error).
- Flags: `⧉ n` duplicate candidates (icon `Copy`), `ShieldAlert` amber icon for injection.
- **Selection bar** (appears when rows are selected; sticky at the bottom of the table): "3 selected · [Analyze selected] [Clear]".
- **Batch progress:** a determinate progress bar under the toolbar ("Analyzing 7 of 12 · Gemini · gemini-…"). Rows update live. A run that finishes with failures shows an inline alert with "View failures".
- Sorting by #, Updated, Severity and Priority. Pagination: 50 per page with simple prev/next.
- Clicking a row (or pressing `Enter` on the focused row) opens the Workspace.

### 5.3 Triage Workspace (`/repos/:owner/:repo/issues/:number`) — the core screen
```
← Inbox   #142  Export to CSV crashes with unicode characters in names      [Open on GitHub ↗]
          open · opened by @lena-k · CONTRIBUTOR · 3 days ago · 4 comments     ‹ prev  next ›
┌──────────────────────── Original issue ─────────────┬──────────── Suggested triage ──────────────┐
│ Existing labels: [area:export]                      │ AI · gemini-… · triage_v1 · 2 min ago  [Re-analyze]
│                                                     │ ┌───────────────────────────────────────┐ │
│ ⚠ Possible prompt injection (1)   [Show]            │ │ Bug  ·  ▮▮▮▯ High  ·  P1  ·  Confidence: Medium │
│                                                     │ │ Export fails on non-ASCII names; affects all  │
│ (rendered markdown, 72ch, sanitized)                │ │ CSV exports since 2.3.0.               │ │
│ ...                                                 │ │ ▸ Why?                                 │ │
│ ```                                                 │ └───────────────────────────────────────┘ │
│ UnicodeEncodeError: 'ascii' codec ...               │ Labels                         ▸ Why?     │
│ ```                                                 │  ☑ bug   ☑ area:export   ☐ priority:high  │
│ [Images hidden · Show images]                       │ Possible duplicates                       │
│                                                     │  #87  CSV export breaks on emoji   0.71 likely  [Compare] │
│                                                     │  #12  Encoding option for export   0.38 related │
│                                                     │ Next steps                                 │
│                                                     │  1. Reproduce with name "Zoë" on 2.3.0     │
│                                                     │  2. Check writer encoding in export/csv.py │
│                                                     │ Draft reply           [Edit] [Copy]  Edited│
│                                                     │  Thanks for the detailed report …          │
│                                                     │ Warnings: 1 unverified quote removed       │
├─────────────────────────────────────────────────────┴───────────────────────────────────────────┤
│ Proposals:  Add 2 labels · Approved      Post comment · Pending       [Reject] [Approve] [Apply to GitHub] │ ← sticky footer
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Behavior:
- **Split** is 50/50 at ≥ 1280 px, with a draggable divider (min 360 px per pane) whose position persists. Each pane scrolls on its own.
- **Provenance line** at the top of the right pane, always visible: the mode badge, model id, prompt version, relative time and a staleness notice ("Issue changed since this analysis — Re-analyze", amber) when `body_hash` differs.
- **Summary card:** category chip, severity signal, priority tag, confidence (text, not a percentage) and the one-line summary.
- **"Why?" disclosures** (Radix Collapsible) under each section reveal evidence items:
  `Severity: high` → "> crashes for every export that contains a non-ASCII name" · *from body*. Clicking a quote scrolls the left pane to the matching text and highlights it for 2 s (`<mark>` with `--accent-subtle`).
- **Injection notice:** an amber inline alert listing matched patterns. "Show" highlights the spans in the left pane with an amber underline. The copy reads: "This issue contains text that looks like instructions to an AI. IssuePilot treats it as data. Review suggestions carefully."
- **Labels:** checkbox chips. Labels not in the repo never appear. If no repo label matches, show "No matching labels in this repository".
- **Duplicates:** rows with mono issue number, title, `lexical similarity 0.71` and a verdict tag. **Compare** opens a right-side Sheet with the two issues side by side.
- **Draft reply:** read view (rendered markdown) by default. **Edit** switches to a textarea (mono off, 14 px, auto-height, 2,000-char counter) with Write/Preview tabs, Save and Cancel. Editing marks the proposal *Edited* and keeps "View original suggestion". **Copy** copies the markdown.
- **Failed analysis:** the right pane shows an error state with the provider error code and message plus [Retry] and the hint "Using the heuristic engine? Set AI_PROVIDER=heuristic in .env."
- **Sticky footer (proposal bar):** lists each proposal with a status tag.
  - Buttons: **Reject** (ghost), **Approve** (secondary), **Apply to GitHub** (primary).
  - Apply is disabled unless at least one proposal is approved *and* the policy allows it. When disabled, a tooltip and an `Info` icon list the reasons from `GET /proposals/{id}/policy` in plain language, e.g.:
    - "Writes are disabled. Set GITHUB_WRITE_ENABLED=true."
    - "acme/lib is not in WRITE_ALLOWED_REPOS."
    - "Demo repository — writes are not possible."
- **Apply dialog** (`AlertDialog`):
  - Title: "Apply changes to acme/lib#142"
  - Body: a list of exact effects:
    - "Add labels: `bug`, `area:export`" (shows "already present — skipped" when relevant)
    - "Post comment:" followed by the rendered comment in a bordered box
  - A **Dry run** button that shows the JSON request
  - Typed confirmation input (mono) with placeholder `acme/lib#142`. The confirm button stays disabled until the input matches exactly.
  - Primary button text: "Apply 2 changes".
  - Result: a toast for each change with a link to the GitHub comment. Errors show inline in the dialog.
- `‹ prev / next ›` and `j/k` move through the inbox order and keep the current filters.

### 5.4 History (`/history`)
- Two tabs: **Analysis runs** and **Audit log**.
- **Runs table:** Started, Repository, Provider · model, Mode badge, Issues (✓ succeeded / ✗ failed), Duration, Status. A run expands to show per-issue rows linking to the Workspace.
- **Audit log:** a dense monospace-accented list with time, event type tag, repo#issue, and a details summary (e.g., "apply_blocked — WRITE_DISABLED, REPO_NOT_ALLOWLISTED"). Filter by event type.

### 5.5 Reports (`/reports`)
- Controls: repository select, date range (presets 7d / 30d / All), Export ▾ (Markdown, JSON).
- **Top row:** a compact inline stat strip (not cards) with Issues analyzed · AI analyses · Heuristic analyses · Failed · Proposals approved / rejected / applied. Numbers in 20 px tabular figures with labels in 12 px muted text.
- **Distributions:** three horizontal bar lists (category, severity, priority). Each bar is a div with width proportional to its count, uses the chip color at 70% opacity, and shows the count at the end. No chart library is needed.
- **Needs attention:** a table of P0/P1 issues.
- **Likely duplicate pairs:** a list.
- **Footer note** (muted): "Counts reflect IssuePilot suggestions, not verified ground truth."

### 5.6 Settings (`/settings`)
Sections are separated by hairlines, with a two-column layout (label/description on the left, value/control on the right):
- **AI provider:** active provider, label, model, configured ✓/✗, [Test connection] (shows latency and the result). Note: "Change provider in .env and restart the backend." Never show keys; show `Configured` or `Not set`.
- **GitHub:** token configured, authenticated as `login`, rate limit `4,812 / 5,000 · resets 14:05`, write mode, allow-listed repos (mono chips).
- **Appearance:** theme segmented control (System / Light / Dark), sidebar collapsed default.
- **Data:** "Reset demo workspace" and "Delete local data for a repository" (each confirms first; local only).

---

## 6. Component inventory

shadcn/ui primitives: Button, Input, Textarea, Select, Combobox (Command + Popover), Checkbox, Tabs, Tooltip, Dialog, AlertDialog, Sheet, DropdownMenu, Collapsible, Badge, Separator, Skeleton, Progress, ScrollArea, Table, Toggle Group, Sonner (toasts).

App components (in `components/app/`):
| Component | Purpose |
|---|---|
| `AppShell`, `Sidebar`, `TopBar` | Layout |
| `RepoSwitcher` | Combobox of repos |
| `RepoModeBadge` | Demo / Read-only / Write-enabled |
| `ProviderPill`, `ModeBadge` | AI vs Heuristic provenance (one source of truth for wording) |
| `CategoryChip`, `SeverityIndicator`, `PriorityTag`, `ConfidenceText` | Triage attributes |
| `IssueTable` | TanStack Table wrapper with selection and keyboard navigation |
| `MarkdownView` | Sanitized markdown, image blocking, highlight API |
| `EvidenceDisclosure` | "Why?" + quote list + scroll-to-source |
| `InjectionNotice` | Amber alert + highlight toggle |
| `DuplicateList`, `CompareSheet` | Duplicates |
| `DraftReplyEditor` | View/Edit/Preview/Copy |
| `ProposalBar`, `ApplyDialog`, `PolicyReasons` | Approval and apply |
| `RunProgress` | Batch progress |
| `EmptyState`, `ErrorState`, `RateLimitNotice` | States |
| `KeyboardShortcutsDialog` | `?` overlay |

Button hierarchy: one primary per view region. Primary = accent fill. Secondary = `--surface-2` fill with a border. Ghost = text only. Destructive actions (Remove local data) use danger text plus confirmation.

---

## 7. UI states (each must be implemented and visible in Playwright screenshots)

| State | Treatment |
|---|---|
| Loading (first load) | Skeleton rows (8) matching the table layout; skeleton blocks in the Workspace panes |
| Background refetch | A thin 2 px indeterminate bar under the TopBar; no layout shift |
| Empty – no repos | EmptyState with Connect + Demo actions |
| Empty – no issues | "No open issues found in owner/repo." + Sync button |
| Empty – filters | "No issues match these filters." + Clear filters |
| Not analyzed | Right pane: "This issue hasn't been analyzed yet." + [Analyze] (+ shortcut hint `A`) |
| Analyzing | Right-pane skeleton + "Analyzing with Gemini · gemini-…" (or "Running heuristic rules") |
| Analysis failed | ErrorState with code, message and Retry |
| Provider not configured | Inline alert explaining which env vars are missing; Analyze disabled |
| Heuristic mode | Amber `Heuristic mode` pill in the TopBar; every heuristic result shows "Heuristic (rule-based) — no AI model used" |
| Rate limited | `RateLimitNotice`: "GitHub rate limit reached. Resets at 14:05. Cached data is still available." |
| Offline / backend down | Full-width error banner: "Can't reach the IssuePilot backend at 127.0.0.1:8000." + Retry |
| Write blocked | Disabled Apply + reasons tooltip; also a `PolicyReasons` list inside the proposal bar popover |
| Applied | Proposal tag `Applied` (success) + "View on GitHub ↗" |
| Stale analysis | Amber line in the provenance header + Re-analyze |
| Injection flagged | InjectionNotice; ShieldAlert icon in the inbox row |

Toasts: bottom-right, max 3, 4 s, with action links. No toast for routine navigation.

---

## 8. Accessibility (WCAG 2.2 AA)

- Contrast: body text ≥ 4.5:1 and large text/UI components ≥ 3:1 in **both** themes. Verify with axe in Playwright (`@axe-core/playwright`), with 0 serious or critical violations on each main screen.
- Focus: visible 2 px `--focus-ring` ring with a 2 px offset on every interactive element. Never `outline: none` without a replacement.
- Semantics: landmarks (`nav`, `main`, `header`), one `h1` per page, table with real `<th scope>`, chips with `aria-label` (e.g., "Severity: high"), and severity icons `aria-hidden` with a text label.
- Live regions: batch progress and toast announcements via `aria-live="polite"`. Apply results use `assertive`.
- Dialogs: focus trap, `Esc` closes, focus returns to the trigger.
- Disabled Apply: use `aria-disabled="true"` (not the `disabled` attribute) so the reasons tooltip can be reached by keyboard and screen reader.
- Reduced motion respected. No information conveyed by color alone (severity bars plus text; category chip text).
- Hit targets ≥ 24×24 px (WCAG 2.5.8).

### Keyboard map
| Key | Action | Scope |
|---|---|---|
| `j` / `k` | Next / previous row or issue | Inbox, Workspace |
| `Enter` | Open focused issue | Inbox |
| `x` | Toggle row selection | Inbox |
| `a` | Analyze current/selected | Inbox, Workspace |
| `e` | Edit draft reply | Workspace |
| `Esc` | Close dialog/sheet; leave edit | Global |
| `g i` / `g h` / `g r` | Go to Inbox / History / Reports | Global |
| `?` | Shortcuts dialog | Global |
| `Ctrl+K` | Command palette (P2) | Global |

Shortcuts are ignored while focus is in an input, textarea or contenteditable.

---

## 9. Responsive behavior

| Width | Layout |
|---|---|
| ≥ 1280 px | Sidebar expanded; Workspace split 50/50 with a resizable divider |
| 1024–1279 | Sidebar collapsed to icons; split 55/45 |
| 768–1023 | Workspace becomes tabs **Issue / Triage** (Triage tab default after analysis); the proposal bar stays sticky |
| < 768 | Sidebar becomes a drawer (hamburger in TopBar); the inbox table becomes a stacked list (title, then a chip row); filters move into a "Filters" sheet; the TopBar hides the rate-limit pill (it moves to Settings) |

There must be no horizontal page scroll at 375 px width. The inbox table may scroll horizontally only inside its container at 768–1023 px.

---

## 10. Microcopy reference

| Context | Copy |
|---|---|
| Heuristic badge tooltip | "Rule-based keyword analysis. No AI model was used. Configure GEMINI_API_KEY for AI analysis." |
| AI badge tooltip | "Analyzed by {provider} · {model} using prompt {version}. Suggestions require your review." |
| Draft reply header | "Draft reply · suggested, not posted" |
| Apply disabled (generic) | "Nothing is written to GitHub until you approve and confirm." |
| Dry run result | "Dry run — this is the exact request IssuePilot would send. Nothing was sent." |
| Similarity label | "lexical similarity" |
| Confidence | "Confidence: Low / Medium / High" (never a percentage) |

---

## 11. Visual QA checklist (run on Playwright screenshots, both themes, 1440×900 and 390×844)

- [ ] One accent color; no gradients, glows or emoji.
- [ ] Table rows align on a 4 px grid; numbers use tabular figures.
- [ ] Every analysis shows provenance (AI or heuristic) without needing a hover.
- [ ] Disabled Apply has a reachable explanation.
- [ ] Long titles truncate with an ellipsis and a full-title tooltip.
- [ ] Code blocks in issues scroll horizontally inside their box and do not break the layout.
- [ ] Dark mode has no pure-black text on dark backgrounds and no invisible borders.
- [ ] Empty, loading and error states are present for Inbox and Workspace.
- [ ] axe: 0 serious/critical violations.
