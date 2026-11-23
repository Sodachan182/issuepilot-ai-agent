"""Repositories, issues, analyses and runs."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.api.deps import get_issue_or_404, get_repo_or_404
from app.config import get_settings
from app.db import get_session
from app.demo.seed import delete_repository_data
from app.errors import AppError, not_found
from app.github.sync import connect_repository, sync_repository
from app.models import ActionProposal, AnalysisRun, IssueAnalysis, IssueSnapshot, Repository
from app.serializers import (
    analysis_out,
    analysis_summary,
    iso,
    issue_out,
    proposal_out,
    repo_out,
    run_out,
)
from app.triage import service as triage
from app.triage.providers.factory import get_provider

router = APIRouter()

SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
PRIORITY_RANK = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}


class ConnectIn(BaseModel):
    input: str = Field(min_length=1, max_length=200)


class AnalyzeBatchIn(BaseModel):
    repository_id: int
    scope: Literal["selected", "untriaged"] = "untriaged"
    issue_ids: list[int] | None = None


def _provider_or_error():  # noqa: ANN202
    settings = get_settings()
    provider = get_provider(settings)
    if not provider.is_configured():
        raise AppError(
            "PROVIDER_NOT_CONFIGURED",
            f"The {provider.label} provider is not configured. Add its API key and model to .env, "
            "or set AI_PROVIDER=heuristic for rule-based analysis.",
            400,
            {"provider": provider.name},
        )
    return provider, settings


@router.get("/repos")
def list_repos(session: Session = Depends(get_session)) -> list[dict]:
    settings = get_settings()
    repos = session.exec(select(Repository).order_by(Repository.id)).all()  # type: ignore[arg-type]
    return [repo_out(session, r, settings) for r in repos]


@router.post("/repos")
def connect_repo(
    body: ConnectIn, response: Response, session: Session = Depends(get_session)
) -> dict:
    settings = get_settings()
    try:
        repo, created = connect_repository(session, body.input, settings)
    except ValueError as exc:
        raise AppError("VALIDATION_ERROR", str(exc), 422) from exc
    response.status_code = 201 if created else 200
    return repo_out(session, repo, settings)


@router.get("/repos/{repo_id}")
def get_repo(repo_id: int, session: Session = Depends(get_session)) -> dict:
    return repo_out(session, get_repo_or_404(session, repo_id), get_settings())


@router.delete("/repos/{repo_id}", status_code=204)
def delete_repo(repo_id: int, session: Session = Depends(get_session)) -> Response:
    delete_repository_data(session, get_repo_or_404(session, repo_id))
    return Response(status_code=204)


@router.post("/repos/{repo_id}/sync")
def sync_repo(repo_id: int, session: Session = Depends(get_session)) -> dict:
    repo = get_repo_or_404(session, repo_id)
    if repo.is_demo:
        raise AppError("INVALID_STATE", "The demo repository is local data and is not synced", 409)
    return sync_repository(session, repo, get_settings())


def _latest_by_issue(session: Session, issue_ids: list[int]) -> dict[int, IssueAnalysis]:
    latest: dict[int, IssueAnalysis] = {}
    if not issue_ids:
        return latest
    rows = session.exec(
        select(IssueAnalysis)
        .where(IssueAnalysis.issue_id.in_(issue_ids))  # type: ignore[attr-defined]
        .order_by(IssueAnalysis.id)  # type: ignore[arg-type]
    ).all()
    for a in rows:
        latest[a.issue_id] = a
    return latest


def _row_status(analysis: IssueAnalysis | None, proposals: list[ActionProposal]) -> str:
    if analysis is None:
        return "untriaged"
    if analysis.status == "failed":
        return "failed"
    current = [p for p in proposals if p.analysis_id == analysis.id]
    if any(p.status in ("proposed", "approved") for p in current):
        return "pending"
    if any(p.status == "applied" for p in current):
        return "applied"
    return "analyzed"


@router.get("/repos/{repo_id}/issues")
def list_issues(
    repo_id: int,
    q: str | None = None,
    category: str | None = None,
    severity: str | None = None,
    priority: str | None = None,
    status: str | None = None,
    flag: str | None = None,
    sort: str = Query("number", pattern="^(number|updated|severity|priority)$"),
    direction: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    session: Session = Depends(get_session),
) -> dict:
    get_repo_or_404(session, repo_id)
    issues = session.exec(select(IssueSnapshot).where(IssueSnapshot.repository_id == repo_id)).all()
    ids = [i.id for i in issues if i.id is not None]
    latest = _latest_by_issue(session, ids)
    proposals: dict[int, list[ActionProposal]] = {}
    if ids:
        for p in session.exec(
            select(ActionProposal).where(ActionProposal.issue_id.in_(ids))  # type: ignore[attr-defined]
        ):
            proposals.setdefault(p.issue_id, []).append(p)

    rows = []
    for i in issues:
        a = latest.get(i.id)  # type: ignore[arg-type]
        ok = a if a and a.status == "succeeded" else None
        props = proposals.get(i.id, [])  # type: ignore[arg-type]
        row_status = _row_status(a, props)
        if q:
            needle = q.strip().lower().lstrip("#")
            if needle not in i.title.lower() and needle != str(i.number):
                continue
        if category and (ok is None or ok.category != category):
            continue
        if severity and (ok is None or ok.severity != severity):
            continue
        if priority and (ok is None or ok.priority != priority):
            continue
        if status and row_status != status:
            continue
        if flag == "duplicate" and not (ok and ok.duplicates):
            continue
        if flag == "injection" and not i.injection_flags:
            continue
        rows.append(
            {
                "id": i.id,
                "number": i.number,
                "title": i.title,
                "labels": i.labels,
                "author_login": i.author_login,
                "comments_count": i.comments_count,
                "updated_at": iso(i.gh_updated_at),
                "html_url": i.html_url,
                "injection_flagged": bool(i.injection_flags),
                "status": row_status,
                "pending_proposals": sum(
                    1
                    for p in props
                    if a is not None
                    and p.analysis_id == a.id
                    and p.status in ("proposed", "approved")
                ),
                "latest_analysis": analysis_summary(a),
                "_sev": SEVERITY_RANK.get(ok.severity, 9) if ok and ok.severity else 9,
                "_pri": PRIORITY_RANK.get(ok.priority, 9) if ok and ok.priority else 9,
                "_upd": i.gh_updated_at.isoformat() if i.gh_updated_at else "",
            }
        )
    reverse = direction == "desc"
    if sort == "number":
        rows.sort(key=lambda r: r["number"], reverse=reverse)
    elif sort == "updated":
        rows.sort(key=lambda r: r["_upd"], reverse=reverse)
    elif sort == "severity":
        rows.sort(key=lambda r: (r["_sev"], -r["number"]), reverse=not reverse)
    else:
        rows.sort(key=lambda r: (r["_pri"], -r["number"]), reverse=not reverse)
    total = len(rows)
    page_rows = rows[(page - 1) * page_size : page * page_size]
    for r in page_rows:
        for k in ("_sev", "_pri", "_upd"):
            r.pop(k)
    return {"items": page_rows, "total": total, "page": page, "page_size": page_size}


@router.get("/repos/{repo_id}/issues/by-number/{number}")
def issue_by_number(repo_id: int, number: int, session: Session = Depends(get_session)) -> dict:
    issue = session.exec(
        select(IssueSnapshot).where(
            IssueSnapshot.repository_id == repo_id, IssueSnapshot.number == number
        )
    ).first()
    if issue is None:
        raise not_found("Issue")
    return issue_detail(issue.id, session)  # type: ignore[arg-type]


@router.get("/issues/{issue_id}")
def issue_detail(issue_id: int, session: Session = Depends(get_session)) -> dict:
    issue = get_issue_or_404(session, issue_id)
    repo = get_repo_or_404(session, issue.repository_id)
    analyses = session.exec(
        select(IssueAnalysis)
        .where(IssueAnalysis.issue_id == issue_id)
        .order_by(IssueAnalysis.id.desc())  # type: ignore[union-attr]
    ).all()
    latest = analyses[0] if analyses else None
    proposals = []
    if latest is not None:
        proposals = session.exec(
            select(ActionProposal)
            .where(ActionProposal.analysis_id == latest.id)
            .order_by(ActionProposal.id)  # type: ignore[arg-type]
        ).all()
    dup_numbers = [d["number"] for d in (latest.duplicates if latest else [])]
    dup_issues = []
    if dup_numbers:
        dup_issues = [
            {
                "id": d.id,
                "number": d.number,
                "title": d.title,
                "body": d.body,
                "html_url": d.html_url,
            }
            for d in session.exec(
                select(IssueSnapshot).where(
                    IssueSnapshot.repository_id == repo.id,
                    IssueSnapshot.number.in_(dup_numbers),  # type: ignore[attr-defined]
                )
            )
        ]
    return {
        "issue": issue_out(issue),
        "repository": {
            "id": repo.id,
            "full_name": repo.full_name,
            "is_demo": repo.is_demo,
            "html_url": repo.html_url,
        },
        "latest_analysis": analysis_out(latest, issue) if latest else None,
        "analyses": [
            {
                "id": a.id,
                "status": a.status,
                "mode": a.mode,
                "model": a.model,
                "provider_label": a.provider_label,
                "created_at": iso(a.created_at),
            }
            for a in analyses
        ],
        "proposals": [proposal_out(p) for p in proposals],
        "duplicate_issues": dup_issues,
    }


@router.post("/issues/{issue_id}/analyze")
def analyze_one(issue_id: int, session: Session = Depends(get_session)) -> dict:
    issue = get_issue_or_404(session, issue_id)
    repo = get_repo_or_404(session, issue.repository_id)
    provider, settings = _provider_or_error()
    analysis = triage.analyze_issue(session, repo, issue, provider, settings)
    return analysis_out(analysis, issue)


@router.post("/analyses", status_code=202)
def analyze_batch(
    body: AnalyzeBatchIn, background: BackgroundTasks, session: Session = Depends(get_session)
) -> dict:
    repo = get_repo_or_404(session, body.repository_id)
    provider, settings = _provider_or_error()
    if body.scope == "selected" and not body.issue_ids:
        raise AppError("VALIDATION_ERROR", "Select at least one issue", 422)
    requested = len(body.issue_ids or []) if body.scope == "selected" else None
    ids = triage.select_issue_ids(session, repo, body.scope, body.issue_ids, settings.ai_max_batch)
    if not ids:
        raise AppError("NOTHING_TO_ANALYZE", "There are no issues to analyze", 409)
    run = triage.start_run(session, repo, ids, provider)
    background.add_task(triage.execute_run, run.id, provider, settings)
    return {
        "run_id": run.id,
        "total": run.total,
        "capped": requested is not None and requested > run.total,
        "max_batch": settings.ai_max_batch,
    }


@router.get("/runs/{run_id}")
def get_run(run_id: int, session: Session = Depends(get_session)) -> dict:
    run = session.get(AnalysisRun, run_id)
    if run is None:
        raise not_found("Run")
    repo = session.get(Repository, run.repository_id)
    analyses = {
        a.issue_id: a
        for a in session.exec(select(IssueAnalysis).where(IssueAnalysis.run_id == run_id))
    }
    issues = {
        i.id: i
        for i in session.exec(
            select(IssueSnapshot).where(IssueSnapshot.id.in_(run.issue_ids or [-1]))  # type: ignore[union-attr]
        )
    }
    items = []
    for issue_id in run.issue_ids:
        a = analyses.get(issue_id)
        i = issues.get(issue_id)
        items.append(
            {
                "issue_id": issue_id,
                "number": i.number if i else None,
                "title": i.title if i else None,
                "status": a.status if a else "pending",
                "category": a.category if a else None,
                "error": a.error if a else None,
            }
        )
    return {**run_out(run, repo.full_name if repo else None), "items": items}


@router.get("/analyses/{analysis_id}")
def get_analysis(analysis_id: int, session: Session = Depends(get_session)) -> dict:
    a = session.get(IssueAnalysis, analysis_id)
    if a is None:
        raise not_found("Analysis")
    return analysis_out(a, session.get(IssueSnapshot, a.issue_id))
