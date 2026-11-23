"""Connect repositories and sync open issues into the local cache."""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from app import audit
from app.config import Settings
from app.github.client import RATE_LIMIT, GitHubClient
from app.github.parsing import parse_repo_input, repo_key
from app.models import IssueSnapshot, Repository, utcnow
from app.triage.guards import detect_injection


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def connect_repository(
    session: Session, value: str, settings: Settings, client: GitHubClient | None = None
) -> tuple[Repository, bool]:
    owner, name = parse_repo_input(value)
    existing = session.exec(
        select(Repository).where(Repository.full_name_key == repo_key(f"{owner}/{name}"))
    ).first()
    if existing:
        return existing, False

    gh = client or GitHubClient(settings)
    try:
        data = gh.get_repo(owner, name)
        labels = gh.list_labels(data["owner"]["login"], data["name"])
    finally:
        if client is None:
            gh.close()
    full_name = data.get("full_name") or f"{owner}/{name}"
    existing = session.exec(
        select(Repository).where(Repository.full_name_key == repo_key(full_name))
    ).first()
    if existing:
        return existing, False
    permissions = data.get("permissions")
    repo = Repository(
        owner=data["owner"]["login"],
        name=data["name"],
        full_name=full_name,
        full_name_key=repo_key(full_name),
        html_url=data.get("html_url", f"https://github.com/{full_name}"),
        description=data.get("description"),
        is_private=bool(data.get("private")),
        label_names=labels,
        has_push_permission=(permissions or {}).get("push") if permissions else None,
    )
    session.add(repo)
    session.commit()
    session.refresh(repo)
    audit.record_event(
        session, "repo_connected", repository_id=repo.id, details={"full_name": full_name}
    )
    return repo, True


def upsert_issue(session: Session, repo: Repository, item: dict) -> tuple[IssueSnapshot, bool]:
    from app.triage.service import body_hash

    number = int(item["number"])
    title = item.get("title") or ""
    body = item.get("body") or ""
    snapshot = session.exec(
        select(IssueSnapshot).where(
            IssueSnapshot.repository_id == repo.id, IssueSnapshot.number == number
        )
    ).first()
    created = snapshot is None
    if snapshot is None:
        snapshot = IssueSnapshot(repository_id=repo.id, number=number, title=title)  # type: ignore[arg-type]
    snapshot.title = title
    snapshot.body = body
    snapshot.state = item.get("state", "open")
    snapshot.author_login = (item.get("user") or {}).get("login", "")
    snapshot.author_association = item.get("author_association", "NONE")
    snapshot.labels = [
        lbl["name"] if isinstance(lbl, dict) else lbl for lbl in item.get("labels", [])
    ]
    snapshot.comments_count = int(item.get("comments", 0) or 0)
    snapshot.html_url = item.get("html_url", "")
    snapshot.gh_created_at = _parse_dt(item.get("created_at"))
    snapshot.gh_updated_at = _parse_dt(item.get("updated_at"))
    snapshot.body_hash = body_hash(title, body)
    snapshot.injection_flags = detect_injection(title, body)
    snapshot.fetched_at = utcnow()
    session.add(snapshot)
    return snapshot, created


def sync_repository(
    session: Session, repo: Repository, settings: Settings, client: GitHubClient | None = None
) -> dict:
    gh = client or GitHubClient(settings)
    try:
        data = gh.get_repo(repo.owner, repo.name)
        permissions = data.get("permissions")
        repo.has_push_permission = (permissions or {}).get("push") if permissions else None
        repo.label_names = gh.list_labels(repo.owner, repo.name)
        items, skipped = gh.list_open_issues(repo.owner, repo.name, settings.max_sync_issues)
    finally:
        if client is None:
            gh.close()
    created = updated = 0
    for item in items:
        _, is_new = upsert_issue(session, repo, item)
        created += int(is_new)
        updated += int(not is_new)
    repo.last_synced_at = utcnow()
    session.add(repo)
    session.commit()
    result = {
        "synced": len(items),
        "created": created,
        "updated": updated,
        "skipped_pull_requests": skipped,
        "rate_limit": RATE_LIMIT.as_dict(),
    }
    audit.record_event(
        session,
        "sync",
        repository_id=repo.id,
        details={k: v for k, v in result.items() if k != "rate_limit"},
    )
    return result
