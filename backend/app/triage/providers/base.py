"""Provider protocol, shared prompt building and retry-once JSON validation."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Literal, Protocol

from pydantic import ValidationError

from app.schemas.triage import TriageInput, TriageResult
from app.triage.guards import escape_for_prompt

PROMPT_VERSION = "triage_v1"
_PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / f"{PROMPT_VERSION}.md"


class ProviderError(Exception):
    """code: auth | rate_limited | timeout | invalid_output | blocked | not_configured | unknown"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class TriageProvider(Protocol):
    name: str
    mode: Literal["ai", "heuristic"]
    label: str
    model: str | None

    def is_configured(self) -> bool: ...

    def analyze(self, inp: TriageInput):  # -> ProviderResult
        ...

    def health_check(self) -> tuple[bool, str]: ...


def system_prompt() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8")


def build_user_content(inp: TriageInput) -> str:
    """Untrusted text is escaped and wrapped in delimiter tags; never mixed into instructions."""
    lines = [
        f"<repository>{escape_for_prompt(inp.repo_full_name)}</repository>",
        f"<allowed_labels>{json.dumps(inp.allowed_labels, ensure_ascii=False)}</allowed_labels>",
        f"<existing_labels>{json.dumps(inp.existing_labels, ensure_ascii=False)}</existing_labels>",
        f"<author_association>{escape_for_prompt(inp.author_association)}</author_association>",
    ]
    if inp.injection_flags:
        ids = sorted({f.pattern_id for f in inp.injection_flags})
        lines.append(f"<preflight_flags>{json.dumps(ids)}</preflight_flags>")
    if inp.truncated:
        lines.append("<note>The issue body was truncated for length.</note>")
    lines += [
        f'<untrusted_issue number="{inp.issue_number}">',
        f"<title>{escape_for_prompt(inp.title)}</title>",
        f"<body>{escape_for_prompt(inp.body)}</body>",
        "</untrusted_issue>",
        "<duplicate_candidates>",
    ]
    for c in inp.duplicate_candidates:
        lines.append(
            f'<duplicate_candidate number="{c.number}" similarity="{c.similarity:.2f}">'
            f"{escape_for_prompt(c.title)} — {escape_for_prompt(c.excerpt)}</duplicate_candidate>"
        )
    lines.append("</duplicate_candidates>")
    lines.append("Return the triage JSON object now.")
    return "\n".join(lines)


_JSON_OBJECT = re.compile(r"\{[\s\S]*\}")


def parse_triage_json(text: str) -> TriageResult:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
    try:
        return TriageResult.model_validate_json(raw)
    except ValidationError:
        match = _JSON_OBJECT.search(raw)
        if match and match.group(0) != raw:
            return TriageResult.model_validate_json(match.group(0))
        raise


def _error_summary(exc: ValidationError) -> str:
    parts = []
    for err in exc.errors()[:6]:
        loc = ".".join(str(x) for x in err.get("loc", ()))
        parts.append(f"{loc or 'root'}: {err.get('msg', 'invalid')}")
    return "; ".join(parts)[:600]


def call_with_retry(call: Callable[[str], str], user_content: str) -> tuple[TriageResult, int]:
    """Call the model, validate, retry once with the validation error. Returns (result, attempts)."""
    text = call(user_content)
    try:
        return parse_triage_json(text), 1
    except (ValidationError, ValueError) as exc:
        summary = _error_summary(exc) if isinstance(exc, ValidationError) else "not valid JSON"
    retry_content = (
        user_content
        + "\n\nYour previous output was invalid for the required JSON schema: "
        + summary
        + "\nReturn only a corrected JSON object."
    )
    text = call(retry_content)
    try:
        return parse_triage_json(text), 2
    except (ValidationError, ValueError) as exc:
        raise ProviderError(
            "invalid_output", "The model returned output that does not match the schema twice"
        ) from exc
