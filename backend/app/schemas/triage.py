"""The LLM output contract and provider input types."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["bug", "feature_request", "documentation", "question", "maintenance"]
Severity = Literal["critical", "high", "medium", "low"]
Priority = Literal["P0", "P1", "P2", "P3"]
Confidence = Literal["low", "medium", "high"]

CATEGORIES: tuple[str, ...] = ("bug", "feature_request", "documentation", "question", "maintenance")
CATEGORY_DISPLAY = {
    "bug": "Bug",
    "feature_request": "Feature Request",
    "documentation": "Documentation",
    "question": "Question",
    "maintenance": "Maintenance",
}
SEVERITIES: tuple[str, ...] = ("critical", "high", "medium", "low")
PRIORITIES: tuple[str, ...] = ("P0", "P1", "P2", "P3")


class LabelSuggestion(BaseModel):
    name: str = Field(max_length=100)
    reason: str = Field(default="", max_length=300)


class DuplicateVerdict(BaseModel):
    number: int
    verdict: Literal["likely_duplicate", "related", "not_duplicate"]
    rationale: str = Field(default="", max_length=400)


class Evidence(BaseModel):
    claim: str = Field(max_length=120)
    quote: str = Field(max_length=400)
    source: Literal["title", "body"] = "body"


class TriageResult(BaseModel):
    category: Category
    severity: Severity
    priority: Priority
    confidence: Confidence
    summary: str = Field(max_length=280)
    suggested_labels: list[LabelSuggestion] = Field(default_factory=list, max_length=5)
    duplicates: list[DuplicateVerdict] = Field(default_factory=list, max_length=5)
    next_steps: list[str] = Field(min_length=1, max_length=6)
    draft_response: str = Field(max_length=4000)
    evidence: list[Evidence] = Field(min_length=1, max_length=8)
    warnings: list[str] = Field(default_factory=list, max_length=5)


class DuplicateCandidate(BaseModel):
    issue_id: int
    number: int
    title: str
    similarity: float
    excerpt: str = ""


class InjectionFlag(BaseModel):
    pattern_id: str
    field: Literal["title", "body"]
    span_start: int
    span_end: int
    excerpt: str


class TriageInput(BaseModel):
    repo_full_name: str
    repo_html_url: str = ""
    issue_number: int
    title: str
    body: str
    author_login: str = ""
    author_association: str = "NONE"
    existing_labels: list[str] = Field(default_factory=list)
    allowed_labels: list[str] = Field(default_factory=list)
    duplicate_candidates: list[DuplicateCandidate] = Field(default_factory=list)
    injection_flags: list[InjectionFlag] = Field(default_factory=list)
    truncated: bool = False


class ProviderResult(BaseModel):
    triage: TriageResult
    mode: Literal["ai", "heuristic"]
    provider: str
    provider_label: str
    model: str | None = None
    latency_ms: int = 0
    input_tokens: int | None = None
    output_tokens: int | None = None


def triage_json_schema() -> dict:
    """Plain JSON schema (no $refs) for providers that support structured output."""
    string = {"type": "string"}
    return {
        "type": "object",
        "properties": {
            "category": {"type": "string", "enum": list(CATEGORIES)},
            "severity": {"type": "string", "enum": list(SEVERITIES)},
            "priority": {"type": "string", "enum": list(PRIORITIES)},
            "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
            "summary": string,
            "suggested_labels": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"name": string, "reason": string},
                    "required": ["name", "reason"],
                },
            },
            "duplicates": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "number": {"type": "integer"},
                        "verdict": {
                            "type": "string",
                            "enum": ["likely_duplicate", "related", "not_duplicate"],
                        },
                        "rationale": string,
                    },
                    "required": ["number", "verdict", "rationale"],
                },
            },
            "next_steps": {"type": "array", "items": string},
            "draft_response": string,
            "evidence": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "claim": string,
                        "quote": string,
                        "source": {"type": "string", "enum": ["title", "body"]},
                    },
                    "required": ["claim", "quote", "source"],
                },
            },
            "warnings": {"type": "array", "items": string},
        },
        "required": [
            "category",
            "severity",
            "priority",
            "confidence",
            "summary",
            "suggested_labels",
            "duplicates",
            "next_steps",
            "draft_response",
            "evidence",
            "warnings",
        ],
    }
