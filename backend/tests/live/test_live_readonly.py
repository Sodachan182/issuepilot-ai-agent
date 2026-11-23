"""T-LIVE-*: opt-in, read-only checks against real GitHub (and Gemini if configured).

Run with:  $env:LIVE_GITHUB_TESTS="1"; pytest -m live tests/live -s
Never writes to GitHub.
"""

import os

import pytest

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(os.environ.get("LIVE_GITHUB_TESTS") != "1", reason="LIVE_GITHUB_TESTS != 1"),
]

LIVE_REPO = os.environ.get("LIVE_REPO", "pallets/flask")


def test_live_readonly(tmp_path):
    from fastapi.testclient import TestClient

    from app.config import Settings, override_settings
    from app.db import reset_engine
    from app.main import create_app

    env = Settings()  # reads .env for optional keys
    settings = env.model_copy(
        update={
            "database_url": f"sqlite:///{(tmp_path / 'live.db').as_posix()}",
            "max_sync_issues": 20,
            "github_write_enabled": False,
        }
    )
    override_settings(settings)
    reset_engine()
    try:
        with TestClient(create_app()) as client:
            repo = client.post("/api/repos", json={"input": LIVE_REPO})
            assert repo.status_code in (200, 201), repo.text
            repo = repo.json()
            assert repo["write_status"]["allowed"] is False
            sync = client.post(f"/api/repos/{repo['id']}/sync").json()
            print("sync:", sync)
            items = client.get(f"/api/repos/{repo['id']}/issues").json()["items"]
            assert items
            for item in items[:5]:
                a = client.post(f"/api/issues/{item['id']}/analyze").json()
                print(
                    item["number"],
                    a.get("mode"),
                    a.get("model"),
                    a.get("status"),
                    a.get("category"),
                    a.get("severity"),
                    a.get("latency_ms"),
                    a.get("warnings"),
                    a.get("error"),
                )
                assert a["status"] in ("succeeded", "failed")
            # Proposals for a third-party repo must be blocked by policy.
            detail = client.get(f"/api/issues/{items[0]['id']}").json()
            if detail["proposals"]:
                pid = detail["proposals"][0]["id"]
                assert client.get(f"/api/proposals/{pid}/policy").json()["allowed"] is False
    finally:
        override_settings(None)
        reset_engine()
