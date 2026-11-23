"""Triage orchestration: build input → provider → guards → store → proposals."""

from __future__ import annotations

import hashlib
import logging

from sqlmodel import Session, select

from app import audit
from app.config import Settings
from app.models import AnalysisRun, IssueAnalysis, IssueSnapshot, Repository, utcnow
from app.schemas.triage import InjectionFlag, TriageInput
from app.triage.duplicates import DuplicateIndex
from app.triage.guards import apply_output_guards
from app.triage.providers.base import PROMPT_VERSION, ProviderError

log = logging.getLogger(__name__)


def body_hash(title: str, body: str | None) -> str:
    return hashlib.sha256(f"{title}\n{body or ''}".encode()).hexdigest()


def build_index(session: Session, repository_id: int) -> DuplicateIndex:
    issues = session.exec(
        select(IssueSnapshot).where(IssueSnapshot.repository_id == repository_id)
    ).all()
    return DuplicateIndex([(i.id, i.number, i.title, i.body) for i in issues if i.id is not None])


def build_input(
    repo: Repository, issue: IssueSnapshot, settings: Settings, index: DuplicateIndex
) -> TriageInput:
    body = issue.body or ""
    truncated = len(body) > settings.ai_max_issue_chars
    if truncated:
        body = body[: settings.ai_max_issue_chars]
    flags = [
        InjectionFlag(**f)
        for f in issue.injection_flags
        if f.get("field") == "title" or f.get("span_end", 0) <= len(body)
    ]
    return TriageInput(
        repo_full_name=repo.full_name,
        repo_html_url=repo.html_url,
        issue_number=issue.number,
        title=issue.title,
        body=body,
        author_login=issue.author_login,
        author_association=issue.author_association,
        existing_labels=list(issue.labels),
        allowed_labels=list(repo.label_names),
        duplicate_candidates=index.candidates(
            issue.id or -1, threshold=settings.dup_related_threshold
        ),
        injection_flags=flags,
        truncated=truncated,
    )


def latest_analysis(session: Session, issue_id: int) -> IssueAnalysis | None:
    return session.exec(
        select(IssueAnalysis)
        .where(IssueAnalysis.issue_id == issue_id)
        .order_by(IssueAnalysis.id.desc())  # type: ignore[union-attr]
    ).first()


def analyze_issue(
    session: Session,
    repo: Repository,
    issue: IssueSnapshot,
    provider,  # noqa: ANN001
    settings: Settings,
    *,
    index: DuplicateIndex | None = None,
    run_id: int | None = None,
) -> IssueAnalysis:
    from app.actions.service import create_proposals

    index = index or build_index(session, repo.id)  # type: ignore[arg-type]
    inp = build_input(repo, issue, settings, index)
    base = {
        "run_id": run_id,
        "issue_id": issue.id,
        "issue_body_hash": issue.body_hash,
        "mode": provider.mode,
        "provider": provider.name,
        "provider_label": provider.label,
        "model": provider.model,
        "prompt_version": PROMPT_VERSION if provider.mode == "ai" else "heuristic_v1",
    }
    try:
        result = provider.analyze(inp)
    except ProviderError as exc:
        analysis = IssueAnalysis(**base, status="failed", error=f"{exc.code}: {exc.message}")
        session.add(analysis)
        session.commit()
        session.refresh(analysis)
        audit.record_event(
            session,
            "analysis_failed",
            repository_id=repo.id,
            issue_number=issue.number,
            details={"code": exc.code, "provider": provider.name},
        )
        return analysis
    except Exception as exc:  # noqa: BLE001
        log.exception("Unexpected provider failure")
        analysis = IssueAnalysis(**base, status="failed", error=f"unknown: {type(exc).__name__}")
        session.add(analysis)
        session.commit()
        session.refresh(analysis)
        audit.record_event(
            session,
            "analysis_failed",
            repository_id=repo.id,
            issue_number=issue.number,
            details={"code": "unknown"},
        )
        return analysis

    guarded = apply_output_guards(result.triage, inp)
    t = guarded.triage
    analysis = IssueAnalysis(
        **{**base, "model": result.model, "provider_label": result.provider_label},
        status="succeeded",
        category=t.category,
        severity=t.severity,
        priority=t.priority,
        confidence=t.confidence,
        summary=t.summary[:280],
        suggested_labels=guarded.suggested_labels,
        duplicates=guarded.duplicates,
        next_steps=[s[:500] for s in t.next_steps],
        draft_response=guarded.draft_response,
        evidence=guarded.evidence,
        injection_detected=guarded.injection_detected,
        warnings=guarded.warnings,
        latency_ms=result.latency_ms,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
    session.add(analysis)
    session.commit()
    session.refresh(analysis)
    create_proposals(session, analysis, issue, repo)
    audit.record_event(
        session,
        "analysis_completed",
        repository_id=repo.id,
        issue_number=issue.number,
        details={
            "analysis_id": analysis.id,
            "mode": analysis.mode,
            "provider": analysis.provider,
            "model": analysis.model,
        },
    )
    return analysis


def select_issue_ids(
    session: Session, repo: Repository, scope: str, issue_ids: list[int] | None, cap: int
) -> list[int]:
    issues = session.exec(
        select(IssueSnapshot)
        .where(IssueSnapshot.repository_id == repo.id)
        .order_by(IssueSnapshot.number.desc())  # type: ignore[attr-defined]
    ).all()
    if scope == "selected":
        wanted = set(issue_ids or [])
        chosen = [i.id for i in issues if i.id in wanted]
    else:
        chosen = []
        for i in issues:
            latest = latest_analysis(session, i.id)  # type: ignore[arg-type]
            if latest is None or latest.status != "succeeded":
                chosen.append(i.id)
    return [c for c in chosen if c is not None][:cap]


def start_run(
    session: Session,
    repo: Repository,
    issue_ids: list[int],
    provider,  # noqa: ANN001
) -> AnalysisRun:
    run = AnalysisRun(
        repository_id=repo.id,  # type: ignore[arg-type]
        provider=provider.name,
        provider_label=provider.label,
        model=provider.model,
        mode=provider.mode,
        prompt_version=PROMPT_VERSION if provider.mode == "ai" else "heuristic_v1",
        total=len(issue_ids),
        issue_ids=issue_ids,
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    audit.record_event(
        session,
        "analysis_run_started",
        repository_id=repo.id,
        details={"run_id": run.id, "total": run.total, "provider": provider.name},
    )
    return run


def execute_run(run_id: int, provider, settings: Settings) -> None:  # noqa: ANN001
    from app.db import new_session

    with new_session() as session:
        run = session.get(AnalysisRun, run_id)
        if run is None:
            return
        repo = session.get(Repository, run.repository_id)
        if repo is None:
            run.status = "failed"
            session.add(run)
            session.commit()
            return
        index = build_index(session, repo.id)  # type: ignore[arg-type]
        for issue_id in run.issue_ids:
            issue = session.get(IssueSnapshot, issue_id)
            if issue is None:
                run.failed += 1
                continue
            analysis = analyze_issue(
                session, repo, issue, provider, settings, index=index, run_id=run.id
            )
            if analysis.status == "succeeded":
                run.succeeded += 1
            else:
                run.failed += 1
            session.add(run)
            session.commit()
        if run.failed == 0:
            run.status = "completed"
        elif run.succeeded == 0 and run.total > 0:
            run.status = "failed"
        else:
            run.status = "partial"
        run.finished_at = utcnow()
        session.add(run)
        session.commit()


def mark_interrupted_runs(session: Session) -> int:
    runs = session.exec(select(AnalysisRun).where(AnalysisRun.status == "running")).all()
    for run in runs:
        run.status = "failed"
        run.finished_at = utcnow()
        session.add(run)
    session.commit()
    return len(runs)
