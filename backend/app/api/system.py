"""Health, configuration status, demo workspace, history and reports."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session, select

from app import __version__
from app.api.deps import get_repo_or_404
from app.config import get_settings
from app.db import get_session
from app.demo.seed import DEMO_FULL_NAME, delete_repository_data, seed_demo
from app.github.client import RATE_LIMIT, GitHubClient
from app.github.errors import GitHubError
from app.models import AnalysisRun, AuditEvent, Repository
from app.reports.service import build_summary, render_markdown
from app.serializers import audit_out, run_out
from app.triage.providers.factory import get_provider

router = APIRouter()
_login_cache: dict[str, str | None] = {}


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__}


@router.get("/config/status")
def config_status() -> dict:
    settings = get_settings()
    provider = get_provider(settings)
    token = settings.github_token_value
    login = None
    if token:
        if "login" not in _login_cache:
            try:
                with GitHubClient(settings) as gh:
                    _login_cache["login"] = gh.get_authenticated_user().get("login")
            except GitHubError:
                _login_cache["login"] = None
        login = _login_cache.get("login")
    return {
        "ai": {
            "provider": provider.name,
            "provider_label": provider.label,
            "model": provider.model,
            "mode": provider.mode,
            "configured": provider.is_configured(),
        },
        "github": {
            "token_configured": bool(token),
            "authenticated_login": login,
            "write_enabled": settings.github_write_enabled,
            "write_allowed_repos": settings.allowed_repos_display,
            "rate_limit": RATE_LIMIT.as_dict(),
        },
        "limits": {
            "max_sync_issues": settings.max_sync_issues,
            "ai_max_batch": settings.ai_max_batch,
            "dup_related_threshold": settings.dup_related_threshold,
            "dup_likely_threshold": settings.dup_likely_threshold,
        },
    }


@router.post("/config/test-provider")
def test_provider() -> dict:
    import time

    provider = get_provider(get_settings())
    started = time.perf_counter()
    ok, message = provider.health_check()
    return {
        "ok": ok,
        "message": message,
        "model": provider.model,
        "latency_ms": int((time.perf_counter() - started) * 1000),
    }


@router.post("/demo/seed")
def demo_seed(session: Session = Depends(get_session)) -> dict:
    repo, count = seed_demo(session)
    return {"repository_id": repo.id, "issues": count}


@router.delete("/demo", status_code=204)
def demo_delete(session: Session = Depends(get_session)) -> Response:
    repo = session.exec(
        select(Repository).where(Repository.full_name_key == DEMO_FULL_NAME)
    ).first()
    if repo is not None:
        delete_repository_data(session, repo)
    return Response(status_code=204)


def _repo_names(session: Session) -> dict[int, str]:
    return {r.id: r.full_name for r in session.exec(select(Repository))}  # type: ignore[misc]


@router.get("/history/runs")
def history_runs(
    repository_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: Session = Depends(get_session),
) -> dict:
    stmt = select(AnalysisRun).order_by(AnalysisRun.id.desc())  # type: ignore[union-attr]
    if repository_id:
        stmt = stmt.where(AnalysisRun.repository_id == repository_id)
    rows = session.exec(stmt).all()
    names = _repo_names(session)
    items = rows[(page - 1) * page_size : page * page_size]
    return {"items": [run_out(r, names.get(r.repository_id)) for r in items], "total": len(rows)}


@router.get("/history/audit")
def history_audit(
    repository_id: int | None = None,
    event_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_session),
) -> dict:
    stmt = select(AuditEvent).order_by(AuditEvent.id.desc())  # type: ignore[union-attr]
    if repository_id:
        stmt = stmt.where(AuditEvent.repository_id == repository_id)
    if event_type:
        stmt = stmt.where(AuditEvent.event_type == event_type)
    rows = session.exec(stmt).all()
    names = _repo_names(session)
    items = rows[(page - 1) * page_size : page * page_size]
    return {
        "items": [audit_out(e, names.get(e.repository_id or -1)) for e in items],
        "total": len(rows),
    }


def _parse_range(start: str | None, end: str | None) -> tuple[datetime | None, datetime | None]:
    def p(v: str | None) -> datetime | None:
        if not v:
            return None
        return datetime.fromisoformat(v.replace("Z", "+00:00"))

    return p(start), p(end)


@router.get("/reports/summary")
def report_summary(
    repository_id: int,
    start: str | None = Query(None, alias="from"),
    end: str | None = Query(None, alias="to"),
    session: Session = Depends(get_session),
) -> dict:
    repo = get_repo_or_404(session, repository_id)
    return build_summary(session, repo, *_parse_range(start, end))


@router.get("/reports/export")
def report_export(
    repository_id: int,
    format: str = Query("md", pattern="^(md|json)$"),
    start: str | None = Query(None, alias="from"),
    end: str | None = Query(None, alias="to"),
    session: Session = Depends(get_session),
) -> Response:
    import json

    repo = get_repo_or_404(session, repository_id)
    summary = build_summary(session, repo, *_parse_range(start, end))
    slug = repo.full_name.replace("/", "-")
    if format == "json":
        return Response(
            json.dumps(summary, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="issuepilot-{slug}.json"'},
        )
    return Response(
        render_markdown(summary),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="issuepilot-{slug}.md"'},
    )
