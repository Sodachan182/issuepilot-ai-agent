from __future__ import annotations

from collections.abc import Callable, Iterator

import pytest
import respx
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.config import Settings, override_settings
from app.db import get_engine, init_db, reset_engine
from app.github.client import RATE_LIMIT
from app.triage.providers.factory import set_provider_override

GH = "https://api.github.test"


def make_settings(tmp_path, **overrides) -> Settings:
    values = {
        "database_url": f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        "github_api_base": GH,
        "ai_provider": "heuristic",
        "github_token": None,
        "gemini_api_key": None,
        "openai_compat_api_key": None,
        "github_write_enabled": False,
        "write_allowed_repos": "",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture
def configure(tmp_path) -> Iterator[Callable[..., Settings]]:
    """Call configure(**settings) to (re)configure the app for a test."""

    def _configure(**overrides) -> Settings:
        settings = make_settings(tmp_path, **overrides)
        override_settings(settings)
        reset_engine()
        init_db()
        return settings

    _configure()
    yield _configure
    set_provider_override(None)
    override_settings(None)
    reset_engine()
    RATE_LIMIT.limit = RATE_LIMIT.remaining = RATE_LIMIT.reset_at = None


@pytest.fixture
def settings(configure) -> Settings:
    from app.config import get_settings

    return get_settings()


@pytest.fixture
def session(configure) -> Iterator[Session]:
    with Session(get_engine()) as s:
        yield s


@pytest.fixture
def client(configure) -> Iterator[TestClient]:
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c


@pytest.fixture
def gh_mock() -> Iterator[respx.MockRouter]:
    with respx.mock(base_url=GH, assert_all_called=False) as router:
        yield router


# ----------------------------------------------------------------- GitHub fixtures
def gh_repo(full_name: str = "octo/widgets", push: bool | None = None) -> dict:
    owner, name = full_name.split("/")
    data = {
        "id": 1,
        "name": name,
        "full_name": full_name,
        "owner": {"login": owner},
        "html_url": f"https://github.com/{full_name}",
        "description": "Test repository",
        "private": False,
    }
    if push is not None:
        data["permissions"] = {"admin": False, "push": push, "pull": True}
    return data


def gh_issue(
    number: int,
    title: str,
    body: str = "",
    *,
    labels: list[str] | None = None,
    state: str = "open",
    pr: bool = False,
    author: str = "reporter",
    repo: str = "octo/widgets",
) -> dict:
    item = {
        "number": number,
        "title": title,
        "body": body,
        "state": state,
        "user": {"login": author},
        "author_association": "NONE",
        "labels": [{"name": n} for n in (labels or [])],
        "comments": 0,
        "html_url": f"https://github.com/{repo}/issues/{number}",
        "created_at": "2026-11-01T10:00:00Z",
        "updated_at": "2026-11-02T10:00:00Z",
    }
    if pr:
        item["pull_request"] = {"url": "x"}
    return item


LABELS = [
    {"name": n}
    for n in [
        "bug",
        "enhancement",
        "documentation",
        "question",
        "maintenance",
        "area:export",
        "priority:high",
    ]
]

RATE_HEADERS = {
    "x-ratelimit-limit": "60",
    "x-ratelimit-remaining": "59",
    "x-ratelimit-reset": "1893456000",
}
