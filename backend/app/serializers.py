"""Explicit API serializers. Secrets never pass through here."""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, func, select

from app.actions.policy import reason
from app.config import Settings
from app.models import (
    ActionProposal,
    AnalysisRun,
    AuditEvent,
    IssueAnalysis,
    IssueSnapshot,
    Repository,
    iso_utc,
)


def iso(dt: datetime | None) -> str | None:
    return iso_utc(dt)


def repo_write_status(repo: Repository, settings: Settings) -> dict:
    reasons = []
    if repo.is_demo:
        reasons.append(reason("DEMO_REPO"))
    else:
        if not settings.github_write_enabled:
            reasons.append(reason("WRITE_DISABLED"))
        if not settings.github_token_value:
            reasons.append(reason("NO_TOKEN"))
        if repo.full_name_key not in settings.allowed_repos:
            reasons.append(reason("REPO_NOT_ALLOWLISTED", repo=repo.full_name))
        if settings.github_token_value and repo.has_push_permission is not True:
            reasons.append(reason("NO_PUSH_PERMISSION", repo=repo.full_name))
    mode = "demo" if repo.is_demo else ("write_enabled" if not reasons else "read_only")
    return {"allowed": not reasons, "mode": mode, "reasons": reasons}


def repo_out(session: Session, repo: Repository, settings: Settings) -> dict:
    issue_ids = select(IssueSnapshot.id).where(IssueSnapshot.repository_id == repo.id)
    issue_count = session.exec(
        select(func.count())
        .select_from(IssueSnapshot)
        .where(IssueSnapshot.repository_id == repo.id)
    ).one()
    analyzed = session.exec(
        select(func.count(func.distinct(IssueAnalysis.issue_id))).where(
            IssueAnalysis.issue_id.in_(issue_ids),  # type: ignore[attr-defined]
            IssueAnalysis.status == "succeeded",
        )
    ).one()
    return {
        "id": repo.id,
        "owner": repo.owner,
        "name": repo.name,
        "full_name": repo.full_name,
        "html_url": repo.html_url,
        "description": repo.description,
        "is_private": repo.is_private,
        "is_demo": repo.is_demo,
        "label_names": repo.label_names,
        "last_synced_at": iso(repo.last_synced_at),
        "created_at": iso(repo.created_at),
        "issue_count": issue_count,
        "analyzed_count": analyzed,
        "write_status": repo_write_status(repo, settings),
    }


def analysis_summary(a: IssueAnalysis | None) -> dict | None:
    if a is None:
        return None
    return {
        "id": a.id,
        "status": a.status,
        "mode": a.mode,
        "provider_label": a.provider_label,
        "model": a.model,
        "category": a.category,
        "severity": a.severity,
        "priority": a.priority,
        "confidence": a.confidence,
        "duplicate_count": len(a.duplicates),
        "likely_duplicate": any(d.get("verdict") == "likely_duplicate" for d in a.duplicates),
        "injection_detected": a.injection_detected,
        "error": a.error,
        "created_at": iso(a.created_at),
    }


def analysis_out(a: IssueAnalysis, issue: IssueSnapshot | None = None) -> dict:
    return {
        "id": a.id,
        "run_id": a.run_id,
        "issue_id": a.issue_id,
        "status": a.status,
        "error": a.error,
        "mode": a.mode,
        "provider": a.provider,
        "provider_label": a.provider_label,
        "model": a.model,
        "prompt_version": a.prompt_version,
        "category": a.category,
        "severity": a.severity,
        "priority": a.priority,
        "confidence": a.confidence,
        "summary": a.summary,
        "suggested_labels": a.suggested_labels,
        "duplicates": a.duplicates,
        "next_steps": a.next_steps,
        "draft_response": a.draft_response,
        "evidence": a.evidence,
        "injection_detected": a.injection_detected,
        "warnings": a.warnings,
        "latency_ms": a.latency_ms,
        "input_tokens": a.input_tokens,
        "output_tokens": a.output_tokens,
        "stale": bool(issue is not None and issue.body_hash != a.issue_body_hash),
        "created_at": iso(a.created_at),
    }


def issue_out(i: IssueSnapshot) -> dict:
    return {
        "id": i.id,
        "repository_id": i.repository_id,
        "number": i.number,
        "title": i.title,
        "body": i.body,
        "state": i.state,
        "author_login": i.author_login,
        "author_association": i.author_association,
        "labels": i.labels,
        "comments_count": i.comments_count,
        "html_url": i.html_url,
        "created_at": iso(i.gh_created_at),
        "updated_at": iso(i.gh_updated_at),
        "injection_flags": i.injection_flags,
        "fetched_at": iso(i.fetched_at),
    }


def proposal_out(p: ActionProposal) -> dict:
    return {
        "id": p.id,
        "analysis_id": p.analysis_id,
        "issue_id": p.issue_id,
        "repository_id": p.repository_id,
        "type": p.type,
        "payload": p.payload,
        "original_payload": p.original_payload,
        "edited": p.edited,
        "status": p.status,
        "reject_reason": p.reject_reason,
        "github_ref": p.github_ref,
        "error": p.error,
        "created_at": iso(p.created_at),
        "decided_at": iso(p.decided_at),
        "applied_at": iso(p.applied_at),
    }


def run_out(run: AnalysisRun, repo_name: str | None = None) -> dict:
    duration = None
    if run.finished_at:
        duration = int((run.finished_at - run.started_at).total_seconds() * 1000)
    return {
        "id": run.id,
        "repository_id": run.repository_id,
        "repository": repo_name,
        "provider": run.provider,
        "provider_label": run.provider_label,
        "model": run.model,
        "mode": run.mode,
        "prompt_version": run.prompt_version,
        "status": run.status,
        "total": run.total,
        "succeeded": run.succeeded,
        "failed": run.failed,
        "started_at": iso(run.started_at),
        "finished_at": iso(run.finished_at),
        "duration_ms": duration,
    }


def audit_out(e: AuditEvent, repo_name: str | None = None) -> dict:
    return {
        "id": e.id,
        "ts": iso(e.ts),
        "actor": e.actor,
        "event_type": e.event_type,
        "repository_id": e.repository_id,
        "repository": repo_name,
        "issue_number": e.issue_number,
        "proposal_id": e.proposal_id,
        "details": e.details,
    }
