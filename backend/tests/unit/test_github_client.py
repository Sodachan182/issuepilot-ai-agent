"""T-GH-*: GitHub client against respx mocks."""

import httpx
import pytest
import respx

from app.config import Settings
from app.github.client import RATE_LIMIT, GitHubClient
from app.github.errors import GitHubAuthError, GitHubError, GitHubNotFound, GitHubRateLimited
from tests.conftest import GH, RATE_HEADERS, gh_issue, gh_repo


def client(token: str | None = None) -> GitHubClient:
    return GitHubClient(Settings(_env_file=None, github_api_base=GH, github_token=token))


def test_headers_without_and_with_token(gh_mock):  # T-GH-01
    route = gh_mock.get("/repos/o/r").respond(200, json=gh_repo("o/r"))
    client().get_repo("o", "r")
    req = route.calls.last.request
    assert "authorization" not in req.headers
    assert req.headers["x-github-api-version"] == "2022-11-28"
    assert req.headers["user-agent"] == "IssuePilot"
    client("tok_123").get_repo("o", "r")
    assert route.calls.last.request.headers["authorization"] == "Bearer tok_123"


def test_list_open_issues_paginates_caps_and_drops_prs(gh_mock):  # T-GH-02
    page1 = [gh_issue(i, f"Issue {i}", pr=(i % 30 == 0)) for i in range(1, 101)]
    page2 = [gh_issue(i, f"Issue {i}") for i in range(101, 121)]
    gh_mock.get("/repos/o/r/issues", params={"page": "1"}).respond(200, json=page1)
    gh_mock.get("/repos/o/r/issues", params={"page": "2"}).respond(200, json=page2)
    issues, skipped = client().list_open_issues("o", "r", max_issues=500)
    assert len(issues) == 117 and skipped == 3
    assert all("pull_request" not in i for i in issues)
    capped, _ = client().list_open_issues("o", "r", max_issues=10)
    assert len(capped) == 10


def test_404_not_found(gh_mock):  # T-GH-03
    gh_mock.get("/repos/o/missing").respond(404, json={"message": "Not Found"})
    with pytest.raises(GitHubNotFound):
        client().get_repo("o", "missing")


def test_rate_limited(gh_mock):  # T-GH-04
    gh_mock.get("/repos/o/r").respond(
        403,
        headers={
            "x-ratelimit-remaining": "0",
            "x-ratelimit-limit": "60",
            "x-ratelimit-reset": "1893456000",
        },
    )
    with pytest.raises(GitHubRateLimited) as exc:
        client().get_repo("o", "r")
    assert exc.value.reset_at is not None
    gh_mock.get("/repos/o/r2").respond(429, headers={"retry-after": "30"})
    with pytest.raises(GitHubRateLimited):
        client().get_repo("o", "r2")


def test_401_auth_error(gh_mock):  # T-GH-05
    gh_mock.get("/repos/o/r").respond(401)
    with pytest.raises(GitHubAuthError):
        client("bad").get_repo("o", "r")


def test_rate_limit_headers_tracked(gh_mock):  # T-GH-06
    gh_mock.get("/repos/o/r").respond(200, json=gh_repo("o/r"), headers=RATE_HEADERS)
    client().get_repo("o", "r")
    assert RATE_LIMIT.as_dict()["remaining"] == 59
    assert RATE_LIMIT.as_dict()["reset_at"].endswith("Z")


def test_5xx_retried_once(gh_mock):  # T-GH-07
    route = gh_mock.get("/repos/o/r").mock(
        side_effect=[httpx.Response(502), httpx.Response(200, json={"ok": 1})]
    )
    assert client().get_repo("o", "r") == {"ok": 1}
    assert route.call_count == 2
    gh_mock.get("/repos/o/down").respond(503)
    with pytest.raises(GitHubError):
        client().get_repo("o", "down")


def test_write_endpoints_shape(gh_mock):  # T-GH-08
    labels = gh_mock.post("/repos/o/r/issues/5/labels").respond(200, json=[])
    comment = gh_mock.post("/repos/o/r/issues/5/comments").respond(201, json={"html_url": "u"})
    c = client("t")
    c.add_labels("o", "r", 5, ["bug"])
    c.create_comment("o", "r", 5, "hello")
    assert labels.calls.last.request.method == "POST"
    assert labels.calls.last.request.content == b'{"labels":["bug"]}'
    assert comment.calls.last.request.content == b'{"body":"hello"}'


def test_token_never_in_errors_or_repr():  # T-GH-09
    c = client("SENTINEL_TOKEN_VALUE")
    assert "SENTINEL" not in repr(c)
    with respx.mock(base_url=GH) as router:
        router.get("/repos/o/r").respond(500)
        with pytest.raises(GitHubError) as exc:
            c.get_repo("o", "r")
    assert "SENTINEL" not in str(exc.value)
