"""Defenses around untrusted issue text and untrusted model output.

Applied to every provider (AI and heuristic alike):
- detect_injection: flags text that looks like instructions aimed at an AI (never blocks).
- escape_for_prompt: stops issue text from opening/closing prompt delimiter tags.
- apply_output_guards: allow-lists labels and duplicates, verifies evidence quotes
  verbatim, and sanitizes the draft reply.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.schemas.triage import InjectionFlag, TriageInput, TriageResult

_FLAGS = re.IGNORECASE | re.MULTILINE

INJECTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "ignore_instructions",
        re.compile(
            r"\b(ignore|disregard|forget)\s+(all\s+|any\s+)?(the\s+|your\s+)?"
            r"(previous|prior|above|earlier)\s+(instructions?|prompts?|rules)",
            _FLAGS,
        ),
    ),
    (
        "role_override",
        re.compile(
            r"\byou are now\b|\bact as (a|an)\s+\w+\s+(ai|assistant|bot|model)\b|"
            r"\bpretend to be\b|\bnew instructions\s*:",
            _FLAGS,
        ),
    ),
    (
        "system_spoof",
        re.compile(
            r"^\s*(system|assistant)\s*:|\[system\]|<\s*/?\s*(system|untrusted_issue|instructions)\s*>",
            _FLAGS,
        ),
    ),
    (
        "tool_command",
        re.compile(
            r"\blabel (this|it) (as|with)\b|\b(apply|add|set) (the )?labels? \S+ (to|on) this issue\b|\bclose this issue\b|"
            r"\bmark (this|it) as (critical|p0|urgent)\b|\bpost (a|this) comment\b",
            _FLAGS,
        ),
    ),
    (
        "prompt_exfil",
        re.compile(
            r"\b(reveal|print|show|output|repeat)\s+(your|the)\s+(system\s+)?(prompt|instructions)\b|"
            r"\b(your|the)\s+api[_ ]?key\b",
            _FLAGS,
        ),
    ),
    ("invisible_chars", re.compile(r"[​-‏⁠﻿‪-‮⁦-⁩]")),
    ("long_base64", re.compile(r"[A-Za-z0-9+/]{200,}={0,2}")),
]

_HTML_COMMENT = re.compile(r"<!--([\s\S]*?)-->")
_INSTRUCTION_VERBS = re.compile(
    r"\b(ignore|label|close|post|comment|assistant|ai|instruction|reply|mark|system)\b",
    re.IGNORECASE,
)


def _excerpt(text: str, start: int, end: int) -> str:
    snippet = text[start:end]
    if len(snippet) > 120:
        snippet = snippet[:117] + "..."
    return snippet


def detect_injection(title: str, body: str) -> list[dict]:
    flags: list[InjectionFlag] = []
    for field_name, text in (("title", title or ""), ("body", body or "")):
        for pattern_id, pattern in INJECTION_PATTERNS:
            for m in pattern.finditer(text):
                flags.append(
                    InjectionFlag(
                        pattern_id=pattern_id,
                        field=field_name,  # type: ignore[arg-type]
                        span_start=m.start(),
                        span_end=m.end(),
                        excerpt=_excerpt(text, m.start(), m.end()),
                    )
                )
        for m in _HTML_COMMENT.finditer(text):
            inner = m.group(1)
            if len(inner.strip()) > 20 and _INSTRUCTION_VERBS.search(inner):
                flags.append(
                    InjectionFlag(
                        pattern_id="hidden_html_comment",
                        field=field_name,  # type: ignore[arg-type]
                        span_start=m.start(),
                        span_end=m.end(),
                        excerpt=_excerpt(text, m.start(), m.end()),
                    )
                )
    flags.sort(key=lambda f: (f.field, f.span_start))
    return [f.model_dump() for f in flags]


# --------------------------------------------------------------------------- prompt
_ESCAPE = str.maketrans({"<": "‹", ">": "›"})
_UNESCAPE = str.maketrans({"‹": "<", "›": ">"})


def escape_for_prompt(text: str) -> str:
    return (text or "").translate(_ESCAPE)


def unescape_from_prompt(text: str) -> str:
    return (text or "").translate(_UNESCAPE)


# --------------------------------------------------------------------------- output
def _norm(text: str) -> str:
    return " ".join((text or "").split())


_URL = re.compile(r"https?://[^\s)\]>\"']+")
_MENTION = re.compile(r"(?<![\w`/@.])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\b")
_TAG = re.compile(r"</?[A-Za-z][^>]{0,200}>")
_BANNED = re.compile(r"ignore (all )?previous( instructions)?|system prompt", re.IGNORECASE)
MAX_DRAFT_CHARS = 2000


def sanitize_draft(text: str, *, author: str, source_text: str, repo_url: str) -> str:
    out = _TAG.sub("", text or "")

    def _mention(m: re.Match[str]) -> str:
        return m.group(0) if author and m.group(1).lower() == author.lower() else m.group(1)

    out = _MENTION.sub(_mention, out)

    def _url(m: re.Match[str]) -> str:
        url = m.group(0).rstrip(".,;:")
        tail = m.group(0)[len(url) :]
        if url in source_text or (repo_url and url.startswith(repo_url.rstrip("/") + "/")):
            return m.group(0)
        return "[link removed]" + tail

    out = _URL.sub(_url, out)
    out = _BANNED.sub("[removed]", out)
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    if len(out) > MAX_DRAFT_CHARS:
        out = out[: MAX_DRAFT_CHARS - 1].rstrip() + "…"
    return out


@dataclass
class GuardedResult:
    triage: TriageResult
    suggested_labels: list[dict] = field(default_factory=list)
    duplicates: list[dict] = field(default_factory=list)
    evidence: list[dict] = field(default_factory=list)
    draft_response: str = ""
    warnings: list[str] = field(default_factory=list)
    injection_detected: bool = False


def apply_output_guards(result: TriageResult, inp: TriageInput) -> GuardedResult:
    warnings: list[str] = []
    for w in result.warnings:
        w = w.strip().lower().replace(" ", "_")[:60]
        if w and w not in warnings:
            warnings.append(w)

    # Labels: only labels that exist in the repository.
    canonical = {name.lower(): name for name in inp.allowed_labels}
    labels: list[dict] = []
    removed_labels = 0
    for s in result.suggested_labels:
        name = canonical.get(s.name.strip().lower())
        if name is None:
            removed_labels += 1
            continue
        if any(lbl["name"] == name for lbl in labels):
            continue
        labels.append({"name": name, "reason": s.reason})
    if removed_labels:
        warnings.append(f"removed_unknown_labels:{removed_labels}")

    # Duplicates: only computed candidates; similarity/title come from our data.
    candidates = {c.number: c for c in inp.duplicate_candidates}
    duplicates: list[dict] = []
    removed_dups = 0
    for d in result.duplicates:
        c = candidates.get(d.number)
        if c is None or d.number == inp.issue_number:
            removed_dups += 1
            continue
        if any(x["number"] == d.number for x in duplicates):
            continue
        duplicates.append(
            {
                "number": c.number,
                "title": c.title,
                "similarity": round(c.similarity, 3),
                "verdict": d.verdict,
                "rationale": d.rationale,
            }
        )
    if removed_dups:
        warnings.append(f"removed_unknown_duplicates:{removed_dups}")
    duplicates.sort(key=lambda x: x["similarity"], reverse=True)

    # Evidence: quotes must appear verbatim (whitespace-normalized) in the issue.
    title_n, body_n = _norm(inp.title), _norm(inp.body)
    evidence: list[dict] = []
    removed_ev = 0
    for e in result.evidence:
        quote = _norm(unescape_from_prompt(e.quote)).strip().strip('"').strip()
        if not quote:
            removed_ev += 1
            continue
        if quote in title_n:
            source = "title"
        elif quote in body_n:
            source = "body"
        else:
            removed_ev += 1
            continue
        evidence.append({"claim": e.claim, "quote": quote[:400], "source": source})
    if removed_ev:
        warnings.append(f"removed_unverified_evidence:{removed_ev}")
    if not evidence:
        evidence.append({"claim": "summary", "quote": title_n[:160], "source": "title"})
        warnings.append("no_verified_evidence")

    draft = sanitize_draft(
        result.draft_response,
        author=inp.author_login,
        source_text=f"{inp.title}\n{inp.body}",
        repo_url=inp.repo_html_url,
    )

    injection = bool(inp.injection_flags) or "possible_prompt_injection" in warnings
    if injection and result.severity == "critical":
        warnings.append("critical_with_injection_review_manually")
    if inp.truncated and "truncated_input" not in warnings:
        warnings.append("truncated_input")

    return GuardedResult(
        triage=result,
        suggested_labels=labels,
        duplicates=duplicates,
        evidence=evidence,
        draft_response=draft,
        warnings=warnings[:12],
        injection_detected=injection,
    )
