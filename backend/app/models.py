"""SQLModel tables. Timestamps are stored as naive UTC datetimes."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


def iso_utc(dt: datetime | None) -> str | None:
    """ISO-8601 in UTC with a trailing Z (naive values are treated as UTC)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _json_list() -> Any:
    return Field(default_factory=list, sa_column=Column(JSON, nullable=False))


def _json_dict() -> Any:
    return Field(default_factory=dict, sa_column=Column(JSON, nullable=False))


class Repository(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    owner: str
    name: str
    full_name: str
    full_name_key: str = Field(index=True, unique=True)
    html_url: str = ""
    description: str | None = None
    is_private: bool = False
    is_demo: bool = False
    label_names: list[str] = _json_list()
    has_push_permission: bool | None = None
    last_synced_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


class IssueSnapshot(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("repository_id", "number"),)

    id: int | None = Field(default=None, primary_key=True)
    repository_id: int = Field(foreign_key="repository.id", index=True)
    number: int
    title: str
    body: str = Field(default="", sa_column=Column(Text, nullable=False, default=""))
    state: str = "open"
    author_login: str = ""
    author_association: str = "NONE"
    labels: list[str] = _json_list()
    comments_count: int = 0
    html_url: str = ""
    gh_created_at: datetime | None = None
    gh_updated_at: datetime | None = None
    body_hash: str = ""
    injection_flags: list[dict] = _json_list()
    fetched_at: datetime = Field(default_factory=utcnow)


class AnalysisRun(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    repository_id: int = Field(foreign_key="repository.id", index=True)
    provider: str
    provider_label: str
    model: str | None = None
    mode: str
    prompt_version: str
    status: str = "running"  # running | completed | partial | failed
    total: int = 0
    succeeded: int = 0
    failed: int = 0
    issue_ids: list[int] = _json_list()
    started_at: datetime = Field(default_factory=utcnow)
    finished_at: datetime | None = None


class IssueAnalysis(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    run_id: int | None = Field(default=None, foreign_key="analysisrun.id", index=True)
    issue_id: int = Field(foreign_key="issuesnapshot.id", index=True)
    issue_body_hash: str = ""
    mode: str
    provider: str
    provider_label: str
    model: str | None = None
    prompt_version: str
    status: str  # succeeded | failed
    error: str | None = None
    category: str | None = None
    severity: str | None = None
    priority: str | None = None
    confidence: str | None = None
    summary: str | None = None
    suggested_labels: list[dict] = _json_list()
    duplicates: list[dict] = _json_list()
    next_steps: list[str] = _json_list()
    draft_response: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    evidence: list[dict] = _json_list()
    injection_detected: bool = False
    warnings: list[str] = _json_list()
    latency_ms: int = 0
    input_tokens: int | None = None
    output_tokens: int | None = None
    created_at: datetime = Field(default_factory=utcnow)


class ActionProposal(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    analysis_id: int = Field(foreign_key="issueanalysis.id", index=True)
    issue_id: int = Field(foreign_key="issuesnapshot.id", index=True)
    repository_id: int = Field(foreign_key="repository.id", index=True)
    type: str  # add_labels | post_comment
    payload: dict = _json_dict()
    original_payload: dict = _json_dict()
    edited: bool = False
    status: str = "proposed"  # proposed | approved | rejected | applied | failed
    reject_reason: str | None = None
    github_ref: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    decided_at: datetime | None = None
    applied_at: datetime | None = None


class AuditEvent(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ts: datetime = Field(default_factory=utcnow, index=True)
    actor: str = "local-user"
    event_type: str = Field(index=True)
    repository_id: int | None = Field(default=None, foreign_key="repository.id", index=True)
    issue_number: int | None = None
    proposal_id: int | None = None
    details: dict = _json_dict()
