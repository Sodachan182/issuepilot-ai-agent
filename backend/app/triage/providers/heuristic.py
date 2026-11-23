"""Deterministic, offline, rule-based triage. Never presented as AI output."""

from __future__ import annotations

import re
import time

from app.config import Settings
from app.schemas.triage import CATEGORY_DISPLAY, ProviderResult, TriageInput, TriageResult
from app.triage import labels as label_map

HEURISTIC_LABEL = "Heuristic (rule-based)"

CATEGORY_KEYWORDS: dict[str, dict[str, int]] = {
    "bug": {
        "bug": 3,
        "crash": 3,
        "crashes": 3,
        "crashed": 3,
        "error": 2,
        "exception": 3,
        "traceback": 3,
        "fails": 2,
        "failing": 2,
        "failed": 2,
        "broken": 2,
        "regression": 3,
        "doesn't work": 2,
        "does not work": 2,
        "not working": 2,
        "unexpected": 1,
        "incorrect": 1,
        "wrong": 1,
        "stack trace": 2,
        "throws": 2,
        "undefined": 1,
        "panic": 2,
        "freezes": 2,
        "hangs": 2,
    },
    "feature_request": {
        "feature": 3,
        "add support": 3,
        "support for": 2,
        "would be nice": 3,
        "would be great": 3,
        "proposal": 2,
        "suggestion": 2,
        "option to": 2,
        "ability to": 2,
        "enhancement": 3,
        "it would be": 1,
        "new command": 2,
        "could we": 1,
        "allow users": 2,
        "request": 1,
    },
    "documentation": {
        "docs": 3,
        "documentation": 3,
        "readme": 3,
        "typo": 3,
        "tutorial": 2,
        "guide": 1,
        "docstring": 2,
        "spelling": 2,
        "wording": 2,
        "broken link": 3,
        "outdated": 2,
        "changelog": 2,
        "example": 1,
    },
    "question": {
        "how do i": 4,
        "how to": 3,
        "how can i": 4,
        "is it possible": 4,
        "question": 3,
        "what is the": 2,
        "can i": 2,
        "why does": 2,
        "any way to": 3,
        "is there a way": 4,
        "clarification": 2,
        "recommended way": 3,
        "best practice": 2,
    },
    "maintenance": {
        "bump": 3,
        "upgrade": 2,
        "dependency": 3,
        "dependencies": 3,
        "deprecat": 3,
        "refactor": 3,
        "cleanup": 3,
        "clean up": 3,
        "ci": 2,
        "flaky": 3,
        "lint": 2,
        "chore": 3,
        "migrate": 2,
        "end of life": 2,
        "eol": 2,
        "tech debt": 3,
        "workflow": 1,
    },
}
PREFIX_KEYWORDS = {"deprecat"}

TEMPLATE_MARKERS: dict[str, list[str]] = {
    "bug": [
        "steps to reproduce",
        "expected behavior",
        "expected behaviour",
        "actual behavior",
        "actual behaviour",
        "to reproduce",
    ],
    "feature_request": [
        "is your feature request related",
        "describe the solution",
        "proposed solution",
        "alternatives considered",
    ],
    "documentation": ["documentation page", "docs page"],
    "question": [],
    "maintenance": [],
}
TIE_ORDER = ["bug", "feature_request", "question", "documentation", "maintenance"]

SEVERITY_KEYWORDS = {
    "critical": [
        "security",
        "vulnerability",
        "cve",
        "data loss",
        "corrupt",
        "corrupted",
        "crash on startup",
        "outage",
        "exploit",
        "credentials leak",
    ],
    "high": [
        "crash",
        "crashes",
        "regression",
        "broken",
        "cannot",
        "can't",
        "fails",
        "failing",
        "exception",
        "blocker",
        "unusable",
        "500",
    ],
    "low": ["typo", "cosmetic", "minor", "wording", "spelling", "nit", "nice to have"],
}

PRIORITY_FOR = {"critical": "P0", "high": "P1", "medium": "P2", "low": "P3"}
_PRIORITY_RANK = ["P0", "P1", "P2", "P3"]

_HTML_COMMENT = re.compile(r"<!--[\s\S]*?-->")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
_VERSION = re.compile(r"\bv?\d+\.\d+(\.\d+)?\b")


def _kw_pattern(kw: str) -> re.Pattern[str]:
    tail = r"\w*" if kw in PREFIX_KEYWORDS else r"(?![a-z0-9])"
    return re.compile(r"(?<![a-z0-9])" + re.escape(kw) + tail)


_COMPILED = {
    cat: [(kw, w, _kw_pattern(kw)) for kw, w in kws.items()]
    for cat, kws in CATEGORY_KEYWORDS.items()
}
_SEV_COMPILED = {sev: [_kw_pattern(k) for k in kws] for sev, kws in SEVERITY_KEYWORDS.items()}


_BOUNDARY = re.compile(r"[.!?\n]")


def _expand_to_sentences(text: str, spans: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Widen flagged spans to whole sentences so injected text cannot steer the rules."""
    out = []
    for start, end in spans:
        left = max((m.end() for m in _BOUNDARY.finditer(text, 0, start)), default=0)
        right_match = _BOUNDARY.search(text, end)
        right = right_match.end() if right_match else len(text)
        out.append((left, right))
    return out


def _strip_flagged(text: str, spans: list[tuple[int, int]]) -> str:
    """Remove injection-flagged spans so they cannot influence the rules."""
    if not spans:
        return text
    out, last = [], 0
    for start, end in sorted(spans):
        start = max(start, last)
        if start >= end:
            continue
        if start < last:
            continue
        out.append(text[last:start])
        out.append(" ")
        last = end
    out.append(text[last:])
    return "".join(out)


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT.split(text) if s and s.strip()]


class HeuristicProvider:
    name = "heuristic"
    mode = "heuristic"
    label = HEURISTIC_LABEL
    model = None

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings

    def is_configured(self) -> bool:
        return True

    def health_check(self) -> tuple[bool, str]:
        return True, "Heuristic rules are always available (no AI model used)."

    # ------------------------------------------------------------------ analysis
    def analyze(self, inp: TriageInput) -> ProviderResult:
        started = time.perf_counter()
        triage = self.triage(inp)
        return ProviderResult(
            triage=triage,
            mode="heuristic",
            provider=self.name,
            provider_label=HEURISTIC_LABEL,
            model=None,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )

    def triage(self, inp: TriageInput) -> TriageResult:
        title_spans = [
            (f.span_start, f.span_end) for f in inp.injection_flags if f.field == "title"
        ]
        body_spans = _expand_to_sentences(
            inp.body,
            [(f.span_start, f.span_end) for f in inp.injection_flags if f.field == "body"],
        )
        title = _strip_flagged(inp.title, title_spans).lower()
        body = _HTML_COMMENT.sub(" ", _strip_flagged(inp.body, body_spans)).lower()

        scores: dict[str, int] = {}
        hits: dict[str, list[tuple[int, str]]] = {}
        for cat, patterns in _COMPILED.items():
            score = 0
            cat_hits: list[tuple[int, str]] = []
            for kw, weight, pattern in patterns:
                t = min(len(pattern.findall(title)), 2)
                b = min(len(pattern.findall(body)), 3)
                if t or b:
                    score += weight * (2 * t + b)
                    cat_hits.append((weight * (2 * t + b), kw))
            for marker in TEMPLATE_MARKERS[cat]:
                if marker in body:
                    score += 3
                    cat_hits.append((3, marker))
            scores[cat] = score
            hits[cat] = sorted(cat_hits, reverse=True)
        if inp.title.strip().endswith("?"):
            scores["question"] += 3
        existing = label_map.category_for_labels(inp.existing_labels)
        if existing:
            scores[existing] += 5

        ranked = sorted(TIE_ORDER, key=lambda c: (-scores[c], TIE_ORDER.index(c)))
        category = ranked[0]
        top, second = scores[ranked[0]], scores[ranked[1]]
        if top == 0:
            category = "question" if inp.title.strip().endswith("?") else "bug"
        margin = top - second
        confidence = "high" if margin >= 6 else "medium" if margin >= 3 else "low"

        severity, sev_kw = self._severity(category, f"{title}\n{body}")
        priority = PRIORITY_FOR[severity]
        if category in ("question", "documentation") and _PRIORITY_RANK.index(priority) < 2:
            priority = "P2"

        warnings: list[str] = []
        if top == 0 or (len(inp.body.strip()) < 40 and confidence == "low"):
            confidence = "low"
            warnings.append("insufficient_information")

        evidence = self._evidence(inp, category, hits[category], severity, sev_kw, body_spans)
        dup_verdicts = []
        likely = self.settings.dup_likely_threshold if self.settings else 0.60
        for c in inp.duplicate_candidates:
            verdict = "likely_duplicate" if c.similarity >= likely else "related"
            dup_verdicts.append(
                {
                    "number": c.number,
                    "verdict": verdict,
                    "rationale": f"Lexical similarity {c.similarity:.2f} between the two issues.",
                }
            )
        likely_dup = next(
            (d["number"] for d in dup_verdicts if d["verdict"] == "likely_duplicate"), None
        )

        return TriageResult(
            category=category,  # type: ignore[arg-type]
            severity=severity,  # type: ignore[arg-type]
            priority=priority,  # type: ignore[arg-type]
            confidence=confidence,  # type: ignore[arg-type]
            summary=(
                f"Rule-based classification: {CATEGORY_DISPLAY[category]}, {severity} severity."
            ),
            suggested_labels=label_map.suggest_labels(category, severity, inp.allowed_labels),
            duplicates=dup_verdicts,
            next_steps=self._next_steps(category, inp, likely_dup),
            draft_response=self._draft(category, inp, likely_dup),
            evidence=evidence,
            warnings=warnings,
        )

    @staticmethod
    def _severity(category: str, text: str) -> tuple[str, str | None]:
        def first(sev: str) -> str | None:
            for kw, pattern in zip(SEVERITY_KEYWORDS[sev], _SEV_COMPILED[sev], strict=True):
                if pattern.search(text):
                    return kw
            return None

        crit, high, low = first("critical"), first("high"), first("low")
        if category == "bug":
            if crit:
                return "critical", crit
            if high:
                return "high", high
            if low:
                return "low", low
            return "medium", None
        if category == "maintenance":
            if crit:
                return "high", crit
            if high:
                return "medium", high
            return "low", low
        if category == "feature_request":
            if low:
                return "low", low
            return "medium", None
        # documentation / question
        if crit or high:
            return "medium", crit or high
        return "low", low

    @staticmethod
    def _evidence(
        inp: TriageInput,
        category: str,
        cat_hits: list[tuple[int, str]],
        severity: str,
        sev_kw: str | None,
        body_spans: list[tuple[int, int]],
    ) -> list[dict]:
        def find_quote(keyword: str) -> tuple[str, str] | None:
            if keyword in inp.title.lower():
                return inp.title.strip()[:200], "title"
            pos = 0
            for sentence in _sentences(inp.body):
                idx = inp.body.find(sentence, pos)
                pos = max(pos, idx)
                if any(s <= idx < e or s < idx + len(sentence) <= e for s, e in body_spans):
                    continue
                if "<!--" in sentence or "-->" in sentence:
                    continue
                if keyword in sentence.lower():
                    return sentence[:200], "body"
            return None

        evidence: list[dict] = []
        for _, kw in cat_hits[:3]:
            found = find_quote(kw)
            if found:
                evidence.append(
                    {
                        "claim": f"category: {CATEGORY_DISPLAY[category]}",
                        "quote": found[0],
                        "source": found[1],
                    }
                )
                break
        if sev_kw:
            found = find_quote(sev_kw)
            if found and all(e["quote"] != found[0] for e in evidence):
                evidence.append(
                    {"claim": f"severity: {severity}", "quote": found[0], "source": found[1]}
                )
        if not evidence:
            evidence.append(
                {
                    "claim": f"category: {CATEGORY_DISPLAY[category]}",
                    "quote": inp.title.strip()[:200],
                    "source": "title",
                }
            )
        return evidence

    @staticmethod
    def _missing_info(inp: TriageInput) -> list[str]:
        text = f"{inp.title}\n{inp.body}".lower()
        missing = []
        if not _VERSION.search(text):
            missing.append("the version you are using")
        if "reproduce" not in text and not re.search(r"^\s*1[.)]", inp.body, re.MULTILINE):
            missing.append("minimal steps to reproduce")
        if "```" not in inp.body and "error" not in text and "traceback" not in text:
            missing.append("the full error output or logs")
        return missing

    def _next_steps(self, category: str, inp: TriageInput, dup: int | None) -> list[str]:
        steps: list[str] = []
        if dup:
            steps.append(f"Compare with #{dup}; close one as duplicate if they match.")
        if category == "bug":
            missing = self._missing_info(inp)
            steps.append("Reproduce the problem on the latest release.")
            if missing:
                steps.append("Ask the reporter for " + ", ".join(missing) + ".")
            steps.append("Identify the affected component and add a regression test.")
        elif category == "feature_request":
            steps += [
                "Check whether the request fits the project roadmap and scope.",
                "Discuss the proposed API or UX before implementation.",
            ]
        elif category == "documentation":
            steps += [
                "Locate the affected documentation page or docstring.",
                "Consider labelling as a good first issue if the fix is small.",
            ]
        elif category == "question":
            steps += [
                "Answer or link to the relevant documentation section.",
                "If the question reveals a docs gap, open a documentation issue.",
            ]
        else:
            steps += [
                "Assess impact on supported versions and CI.",
                "Schedule the change in a maintenance window or release.",
            ]
        return steps[:5]

    def _draft(self, category: str, inp: TriageInput, dup: int | None) -> str:
        parts = ["Thanks for opening this issue."]
        if dup:
            parts.append(
                f"It looks closely related to #{dup}; could you check whether that "
                "issue describes the same problem?"
            )
        if category == "bug":
            missing = self._missing_info(inp)
            if missing:
                parts.append("To help us investigate, could you share " + ", ".join(missing) + "?")
            else:
                parts.append("The details you provided are helpful for reproducing this.")
        elif category == "feature_request":
            parts.append(
                "Could you describe the use case in a bit more detail, including any "
                "workaround you use today?"
            )
        elif category == "documentation":
            parts.append("A pull request with the documentation fix would be welcome.")
        elif category == "question":
            parts.append(
                "Could you share what you have tried so far and the version you are using?"
            )
        else:
            parts.append("This looks like a maintenance task; a maintainer will review the scope.")
        parts.append("A maintainer will review this and follow up here.")
        return " ".join(parts)
