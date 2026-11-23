"""Seed the synthetic demo workspace (demo/acme-widgets). Never touches GitHub."""

from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path

from sqlmodel import Session, select

from app import audit
from app.models import (
    ActionProposal,
    AnalysisRun,
    AuditEvent,
    IssueAnalysis,
    IssueSnapshot,
    Repository,
    utcnow,
)

DATA_PATH = Path(__file__).resolve().parent / "data" / "acme_widgets.json"
DEMO_FULL_NAME = "demo/acme-widgets"


def load_demo_data() -> dict:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def seed_demo(session: Session) -> tuple[Repository, int]:
    from app.github.sync import upsert_issue

    data = load_demo_data()
    meta = data["repository"]
    repo = session.exec(
        select(Repository).where(Repository.full_name_key == DEMO_FULL_NAME)
    ).first()
    if repo is None:
        repo = Repository(
            owner=meta["owner"],
            name=meta["name"],
            full_name=DEMO_FULL_NAME,
            full_name_key=DEMO_FULL_NAME,
            html_url="https://github.com/demo/acme-widgets",
            description=meta["description"],
            is_demo=True,
            label_names=list(meta["labels"]),
        )
        session.add(repo)
        session.commit()
        session.refresh(repo)
    now = utcnow().replace(microsecond=0)
    for issue in data["issues"]:
        created = now - timedelta(days=issue["days_ago"], hours=issue["number"] % 7)
        item = {
            "number": issue["number"],
            "title": issue["title"],
            "body": issue["body"],
            "state": "open",
            "user": {"login": issue["author"]},
            "author_association": issue["association"],
            "labels": issue["labels"],
            "comments": issue["comments"],
            "html_url": f"https://github.com/demo/acme-widgets/issues/{issue['number']}",
            "created_at": created.isoformat(),
            "updated_at": (created + timedelta(hours=issue["comments"] * 5)).isoformat(),
        }
        existing = session.exec(
            select(IssueSnapshot).where(
                IssueSnapshot.repository_id == repo.id, IssueSnapshot.number == issue["number"]
            )
        ).first()
        if existing is None:
            upsert_issue(session, repo, item)
    repo.last_synced_at = utcnow()
    session.add(repo)
    session.commit()
    count = len(
        session.exec(select(IssueSnapshot).where(IssueSnapshot.repository_id == repo.id)).all()
    )
    audit.record_event(session, "demo_seeded", repository_id=repo.id, details={"issues": count})
    return repo, count


def delete_repository_data(session: Session, repo: Repository) -> None:
    """Remove a repository's LOCAL cache only. Never calls GitHub."""
    for model in (ActionProposal,):
        for row in session.exec(select(model).where(model.repository_id == repo.id)).all():
            session.delete(row)
    issue_ids = [
        i.id
        for i in session.exec(select(IssueSnapshot).where(IssueSnapshot.repository_id == repo.id))
    ]
    if issue_ids:
        for a in session.exec(
            select(IssueAnalysis).where(IssueAnalysis.issue_id.in_(issue_ids))  # type: ignore[attr-defined]
        ).all():
            session.delete(a)
    session.commit()
    for model in (AnalysisRun, IssueSnapshot, AuditEvent):
        for row in session.exec(select(model).where(model.repository_id == repo.id)).all():
            session.delete(row)
    session.commit()
    session.delete(repo)
    session.commit()
