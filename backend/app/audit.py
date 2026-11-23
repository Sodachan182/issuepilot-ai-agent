"""Audit trail + secret redaction helpers."""

from __future__ import annotations

import logging
import re
from typing import Any

from sqlmodel import Session

from app.models import AuditEvent

_SENSITIVE_KEY = re.compile(r"token|key|secret|authorization|password", re.IGNORECASE)
_SECRET_VALUE = re.compile(
    r"(ghp_[A-Za-z0-9]{10,}|gho_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}"
    r"|AIza[0-9A-Za-z_\-]{10,}|sk-[A-Za-z0-9_\-]{10,}|Bearer\s+\S+)"
)


def redact_text(text: str) -> str:
    return _SECRET_VALUE.sub("[REDACTED]", text)


def redact(value: Any) -> Any:
    """Recursively drop sensitive keys and mask secret-looking values."""
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items() if not _SENSITIVE_KEY.search(str(k))}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        redacted = redact_text(message)
        if redacted != message:
            record.msg = redacted
            record.args = ()
        return True


def record_event(
    session: Session,
    event_type: str,
    *,
    repository_id: int | None = None,
    issue_number: int | None = None,
    proposal_id: int | None = None,
    details: dict | None = None,
    commit: bool = True,
) -> AuditEvent:
    event = AuditEvent(
        event_type=event_type,
        repository_id=repository_id,
        issue_number=issue_number,
        proposal_id=proposal_id,
        details=redact(details or {}),
    )
    session.add(event)
    if commit:
        session.commit()
    return event
