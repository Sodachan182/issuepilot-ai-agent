"""T-APP-*, T-SEC-*, and the full mocked write flow (TEST_PLAN §8)."""

import pytest

from app.triage.providers.factory import set_provider_override
from tests.conftest import LABELS, gh_issue, gh_repo
from tests.integration.test_api_repos_analysis import FakeProvider

REPO = "sodachan182/sandbox"
OWNER, NAME = REPO.split("/")
ISSUE_BODY = "Steps to reproduce: export a name with accents. It crashes."
SENTINELS = ("SENTINEL_GH_TOKEN", "SENTINEL_GEMINI", "SENTINEL_COMPAT")


def ai_triage():
    return {
        "category": "bug",
        "severity": "high",
        "priority": "P1",
        "confidence": "high",
        "summary": "Export crashes.",
        "suggested_labels": [
            {"name": "bug", "reason": "crash"},
            {"name": "area:export", "reason": "export"},
        ],
        "duplicates": [],
        "next_steps": ["Reproduce"],
        "draft_response": "Thanks for the report. Could you share the version?",
        "evidence": [{"claim": "category: bug", "quote": "It crashes.", "source": "body"}],
        "warnings": [],
    }


@pytest.fixture
def write_env(configure, client, gh_mock):
    """A write-enabled, allow-listed repo with an analyzed issue #7."""
    configure(
        github_token="SENTINEL_GH_TOKEN",
        gemini_api_key="SENTINEL_GEMINI",
        openai_compat_api_key="SENTINEL_COMPAT",
        github_write_enabled=True,
        write_allowed_repos=REPO,
    )
    set_provider_override(FakeProvider(ai_triage()))
    issue = gh_issue(7, "Export crashes", ISSUE_BODY, labels=["bug"], repo=REPO)
    gh_mock.get(f"/repos/{OWNER}/{NAME}").respond(200, json=gh_repo(REPO, push=True))
    gh_mock.get(f"/repos/{OWNER}/{NAME}/labels").respond(200, json=LABELS)
    gh_mock.get(f"/repos/{OWNER}/{NAME}/issues").respond(200, json=[issue])
    gh_mock.get(f"/repos/{OWNER}/{NAME}/issues/7").respond(200, json=issue)
    gh_mock.get("/user").respond(200, json={"login": "sodachan182"})
    repo = client.post("/api/repos", json={"input": REPO}).json()
    client.post(f"/api/repos/{repo['id']}/sync")
    issue_id = client.get(f"/api/repos/{repo['id']}/issues").json()["items"][0]["id"]
    client.post(f"/api/issues/{issue_id}/analyze")
    proposals = {p["type"]: p for p in client.get(f"/api/issues/{issue_id}").json()["proposals"]}
    labels_post = gh_mock.post(f"/repos/{OWNER}/{NAME}/issues/7/labels").respond(200, json=[])
    comment_post = gh_mock.post(f"/repos/{OWNER}/{NAME}/issues/7/comments").respond(
        201, json={"html_url": f"https://github.com/{REPO}/issues/7#issuecomment-1"}
    )
    return {
        "repo": repo,
        "issue_id": issue_id,
        "proposals": proposals,
        "labels_post": labels_post,
        "comment_post": comment_post,
        "gh": gh_mock,
        "configure": configure,
    }


def apply(client, pid, confirm=f"{REPO}#7", dry_run=False):
    return client.post(f"/api/proposals/{pid}/apply", json={"confirm": confirm, "dry_run": dry_run})


def posts(env):
    return env["labels_post"].call_count + env["comment_post"].call_count


def test_full_write_flow(client, write_env):  # TEST_PLAN §8, T-APP-01/02/08/09/10
    env = write_env
    labels, comment = env["proposals"]["add_labels"], env["proposals"]["post_comment"]
    assert labels["payload"] == {"labels": ["area:export"]}  # "bug" already present on the issue

    edited = client.patch(
        f"/api/proposals/{comment['id']}", json={"body": "Thanks! Which version?"}
    ).json()
    assert edited["edited"] is True and edited["original_payload"]["body"].startswith(
        "Thanks for the report"
    )
    for p in (labels, comment):
        assert client.post(f"/api/proposals/{p['id']}/approve").json()["status"] == "approved"
    assert client.get(f"/api/proposals/{labels['id']}/policy").json() == {
        "allowed": True,
        "reasons": [],
    }

    dry = apply(client, labels["id"], dry_run=True).json()
    assert dry["planned_request"]["body"] == {"labels": ["area:export"]}
    assert dry["planned_request"]["url"].endswith(f"/repos/{OWNER}/{NAME}/issues/7/labels")
    assert posts(env) == 0

    r = apply(client, labels["id"])
    assert r.status_code == 200 and r.json()["status"] == "applied"
    assert env["labels_post"].calls.last.request.content == b'{"labels":["area:export"]}'
    r = apply(client, comment["id"])
    assert r.json()["github_ref"].endswith("#issuecomment-1")
    assert env["comment_post"].calls.last.request.content == b'{"body":"Thanks! Which version?"}'

    events = [e["event_type"] for e in reversed(client.get("/api/history/audit").json()["items"])]
    expected = [
        "repo_connected",
        "sync",
        "analysis_completed",
        "proposal_edited",
        "proposal_approved",
        "write_dry_run",
        "apply_succeeded",
    ]
    it = iter(events)
    assert all(e in it for e in expected), events

    r = apply(client, labels["id"])  # T-APP-14
    assert r.status_code == 409 and "ALREADY_APPLIED" in str(r.json())
    assert env["labels_post"].call_count == 1


def test_edit_after_approval_resets(client, write_env):  # T-APP-01
    p = write_env["proposals"]["add_labels"]
    client.post(f"/api/proposals/{p['id']}/approve")
    r = client.patch(
        f"/api/proposals/{p['id']}", json={"labels": ["area:export", "priority:high"]}
    ).json()
    assert r["status"] == "proposed" and r["edited"] is True
    bad = client.patch(f"/api/proposals/{p['id']}", json={"labels": ["not-a-label"]})
    assert bad.status_code == 422


def test_reject_and_invalid_transitions(client, write_env):  # T-APP-02
    p = write_env["proposals"]["post_comment"]
    r = client.post(f"/api/proposals/{p['id']}/reject", json={"reason": "not needed"}).json()
    assert r["status"] == "rejected" and r["reject_reason"] == "not needed"
    assert client.post(f"/api/proposals/{p['id']}/approve").status_code == 409
    assert apply(client, p["id"]).status_code == 409


def blocked_codes(r):
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "WRITE_BLOCKED"
    return {x["code"] for x in r.json()["error"]["details"]["reasons"]}


def test_demo_repo_never_written(client, gh_mock, configure):  # T-APP-03
    configure(github_token="t", github_write_enabled=True, write_allowed_repos="demo/acme-widgets")
    repo_id = client.post("/api/demo/seed").json()["repository_id"]
    issue = client.get(f"/api/repos/{repo_id}/issues?q=101").json()["items"][0]
    client.post(f"/api/issues/{issue['id']}/analyze")
    p = client.get(f"/api/issues/{issue['id']}").json()["proposals"][-1]
    client.post(f"/api/proposals/{p['id']}/approve")
    r = client.post(f"/api/proposals/{p['id']}/apply", json={"confirm": "demo/acme-widgets#101"})
    assert "DEMO_REPO" in blocked_codes(r)
    assert len(gh_mock.calls) == 0


def test_write_disabled_blocks(client, write_env):  # T-APP-04
    env = write_env
    env["configure"](github_token="t", github_write_enabled=False, write_allowed_repos=REPO)
    p = env["proposals"]["post_comment"]
    client.post(f"/api/proposals/{p['id']}/approve")
    assert "WRITE_DISABLED" in blocked_codes(apply(client, p["id"]))
    assert posts(env) == 0


def test_not_allowlisted_blocks_even_with_push(client, write_env):  # T-APP-05
    env = write_env
    env["configure"](
        github_token="t", github_write_enabled=True, write_allowed_repos="someone/else"
    )
    p = env["proposals"]["post_comment"]
    client.post(f"/api/proposals/{p['id']}/approve")
    assert "REPO_NOT_ALLOWLISTED" in blocked_codes(apply(client, p["id"]))
    assert posts(env) == 0


def test_unapproved_blocks(client, write_env):  # T-APP-06
    p = write_env["proposals"]["post_comment"]
    assert "PROPOSAL_NOT_APPROVED" in blocked_codes(apply(client, p["id"]))
    assert posts(write_env) == 0


def test_wrong_confirmation_blocks(client, write_env):  # T-APP-07
    p = write_env["proposals"]["post_comment"]
    client.post(f"/api/proposals/{p['id']}/approve")
    assert "CONFIRMATION_MISMATCH" in blocked_codes(apply(client, p["id"], confirm=f"{REPO}#70"))
    assert posts(write_env) == 0


def test_push_permission_lost_blocks(client, write_env):
    env = write_env
    env["gh"].get(f"/repos/{OWNER}/{NAME}").respond(200, json=gh_repo(REPO, push=False))
    p = env["proposals"]["post_comment"]
    client.post(f"/api/proposals/{p['id']}/approve")
    assert "NO_PUSH_PERMISSION" in blocked_codes(apply(client, p["id"]))
    assert posts(env) == 0


def test_issue_changed_blocks(client, write_env):  # T-APP-11
    env = write_env
    env["gh"].get(f"/repos/{OWNER}/{NAME}/issues/7").respond(
        200, json=gh_issue(7, "Export crashes", "Edited body", labels=["bug"], repo=REPO)
    )
    p = env["proposals"]["post_comment"]
    client.post(f"/api/proposals/{p['id']}/approve")
    assert "ISSUE_CHANGED_SINCE_ANALYSIS" in blocked_codes(apply(client, p["id"]))
    assert posts(env) == 0


def test_issue_closed_blocks(client, write_env):  # T-APP-12
    env = write_env
    env["gh"].get(f"/repos/{OWNER}/{NAME}/issues/7").respond(
        200,
        json=gh_issue(7, "Export crashes", ISSUE_BODY, labels=["bug"], state="closed", repo=REPO),
    )
    p = env["proposals"]["post_comment"]
    client.post(f"/api/proposals/{p['id']}/approve")
    assert "ISSUE_CLOSED" in blocked_codes(apply(client, p["id"]))
    assert posts(env) == 0


def test_label_deleted_meanwhile(client, write_env):  # T-APP-13
    env = write_env
    env["gh"].get(f"/repos/{OWNER}/{NAME}/labels").respond(200, json=[{"name": "bug"}])
    p = env["proposals"]["add_labels"]
    client.post(f"/api/proposals/{p['id']}/approve")
    assert "NOTHING_TO_APPLY" in blocked_codes(apply(client, p["id"]))
    assert posts(env) == 0


def test_github_write_failure(client, write_env):  # T-APP-15
    env = write_env
    env["gh"].post(f"/repos/{OWNER}/{NAME}/issues/7/comments").respond(403)
    p = env["proposals"]["post_comment"]
    client.post(f"/api/proposals/{p['id']}/approve")
    r = apply(client, p["id"])
    assert r.status_code == 502 and r.json()["error"]["code"] == "GITHUB_WRITE_FAILED"
    detail = client.get(f"/api/issues/{env['issue_id']}").json()
    failed = next(x for x in detail["proposals"] if x["id"] == p["id"])
    assert failed["status"] == "failed" and failed["error"]
    assert client.post(f"/api/proposals/{p['id']}/approve").json()["status"] == "approved"


def test_secrets_never_exposed(client, write_env):  # T-SEC-01..03
    env = write_env
    p = env["proposals"]["post_comment"]
    client.post(f"/api/proposals/{p['id']}/approve")
    apply(client, p["id"], confirm="wrong")
    responses = [
        client.get("/api/health"),
        client.get("/api/config/status"),
        client.post("/api/config/test-provider"),
        client.get("/api/repos"),
        client.get(f"/api/repos/{env['repo']['id']}/issues"),
        client.get(f"/api/issues/{env['issue_id']}"),
        client.get(f"/api/proposals/{p['id']}/policy"),
        client.get("/api/history/runs"),
        client.get("/api/history/audit"),
        client.get(f"/api/reports/summary?repository_id={env['repo']['id']}"),
        client.get(f"/api/reports/export?repository_id={env['repo']['id']}&format=json"),
        client.get("/api/issues/99999"),
        client.post("/api/repos", json={"input": "bad input"}),
    ]
    for r in responses:
        blob = r.text + str(dict(r.headers))
        for s in SENTINELS:
            assert s not in blob, r.request.url
    status = client.get("/api/config/status").json()
    assert status["github"]["token_configured"] is True
    assert status["github"]["authenticated_login"] == "sodachan182"
    assert set(status["github"]) == {
        "token_configured",
        "authenticated_login",
        "write_enabled",
        "write_allowed_repos",
        "rate_limit",
    }


def test_cors_only_allowed_origins(client):  # T-SEC-04
    ok = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
