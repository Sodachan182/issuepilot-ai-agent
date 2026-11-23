"""Thin synchronous GitHub REST client.

Read methods are used across the app. The two write methods (``add_labels`` and
``create_comment``) must only be called from ``app/actions/service.py``, after the
write policy has passed. There are intentionally no methods to close, edit, lock
or remove labels from issues.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

from app.config import Settings
from app.github.errors import GitHubAuthError, GitHubError, GitHubNotFound, GitHubRateLimited
from app.models import iso_utc


@dataclass
class RateLimitState:
    remaining: int | None = None
    limit: int | None = None
    reset_at: datetime | None = None

    def as_dict(self) -> dict[str, Any] | None:
        if self.limit is None:
            return None
        return {
            "remaining": self.remaining,
            "limit": self.limit,
            "reset_at": iso_utc(self.reset_at),
        }


RATE_LIMIT = RateLimitState()


def _reset_from_headers(headers: httpx.Headers) -> datetime | None:
    reset = headers.get("x-ratelimit-reset")
    if reset and reset.isdigit():
        return datetime.fromtimestamp(int(reset), UTC)
    retry_after = headers.get("retry-after")
    if retry_after and retry_after.isdigit():
        return datetime.now(UTC) + _seconds(int(retry_after))
    return None


def _seconds(n: int):
    from datetime import timedelta

    return timedelta(seconds=n)


class GitHubClient:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None) -> None:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "IssuePilot",
        }
        token = settings.github_token_value
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self.has_token = bool(token)
        self._client = httpx.Client(
            base_url=settings.github_api_base.rstrip("/"),
            headers=headers,
            timeout=httpx.Timeout(20.0, connect=5.0),
            transport=transport,
        )

    def __repr__(self) -> str:  # never expose headers
        return f"<GitHubClient authenticated={self.has_token}>"

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> GitHubClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ------------------------------------------------------------------ core
    def _track(self, response: httpx.Response) -> None:
        h = response.headers
        if "x-ratelimit-limit" in h:
            try:
                RATE_LIMIT.limit = int(h["x-ratelimit-limit"])
                RATE_LIMIT.remaining = int(h.get("x-ratelimit-remaining", "0"))
                RATE_LIMIT.reset_at = _reset_from_headers(h)
            except ValueError:
                pass

    def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        response: httpx.Response | None = None
        for attempt in range(2):
            try:
                response = self._client.request(method, path, **kwargs)
            except httpx.TimeoutException as exc:
                if attempt == 0 and method == "GET":
                    continue
                raise GitHubError("GitHub request timed out") from exc
            except httpx.HTTPError as exc:
                raise GitHubError(f"Could not reach GitHub ({type(exc).__name__})") from exc
            self._track(response)
            if response.status_code >= 500 and attempt == 0:
                continue
            break
        assert response is not None  # noqa: S101
        self._raise_for(response)
        return response

    @staticmethod
    def _raise_for(response: httpx.Response) -> None:
        if response.is_success:
            return
        status = response.status_code
        if status == 404:
            raise GitHubNotFound("Repository or issue not found or not accessible")
        if status == 429 or (
            status == 403
            and (
                response.headers.get("x-ratelimit-remaining") == "0"
                or "retry-after" in response.headers
            )
        ):
            raise GitHubRateLimited(_reset_from_headers(response.headers))
        if status in (401, 403):
            raise GitHubAuthError(
                "GitHub rejected the request (check token permissions)"
                if status == 403
                else "GitHub authentication failed (check GITHUB_TOKEN)"
            )
        raise GitHubError(f"GitHub API error (HTTP {status})")

    # ------------------------------------------------------------------ reads
    def get_repo(self, owner: str, repo: str) -> dict[str, Any]:
        return self._request("GET", f"/repos/{owner}/{repo}").json()

    def list_labels(self, owner: str, repo: str, max_labels: int = 300) -> list[str]:
        names: list[str] = []
        page = 1
        while len(names) < max_labels:
            batch = self._request(
                "GET", f"/repos/{owner}/{repo}/labels", params={"per_page": 100, "page": page}
            ).json()
            names.extend(item["name"] for item in batch)
            if len(batch) < 100:
                break
            page += 1
        return names[:max_labels]

    def list_open_issues(
        self, owner: str, repo: str, max_issues: int
    ) -> tuple[list[dict[str, Any]], int]:
        """Return (issues, skipped_pull_requests). Pull requests are filtered out."""
        issues: list[dict[str, Any]] = []
        skipped = 0
        per_page = 100
        page = 1
        while len(issues) < max_issues:
            batch = self._request(
                "GET",
                f"/repos/{owner}/{repo}/issues",
                params={
                    "state": "open",
                    "per_page": per_page,
                    "page": page,
                    "sort": "updated",
                    "direction": "desc",
                },
            ).json()
            for item in batch:
                if "pull_request" in item:
                    skipped += 1
                    continue
                issues.append(item)
                if len(issues) >= max_issues:
                    break
            if len(batch) < per_page:
                break
            page += 1
        return issues, skipped

    def get_issue(self, owner: str, repo: str, number: int) -> dict[str, Any]:
        return self._request("GET", f"/repos/{owner}/{repo}/issues/{number}").json()

    def get_authenticated_user(self) -> dict[str, Any]:
        return self._request("GET", "/user").json()

    def get_rate_limit(self) -> dict[str, Any]:
        return self._request("GET", "/rate_limit").json()

    # ----------------------------------------------------------------- writes
    # Only app/actions/service.py may call these (enforced by a static test).
    def add_labels(self, owner: str, repo: str, number: int, labels: list[str]) -> Any:
        return self._request(
            "POST", f"/repos/{owner}/{repo}/issues/{number}/labels", json={"labels": labels}
        ).json()

    def create_comment(self, owner: str, repo: str, number: int, body: str) -> dict[str, Any]:
        return self._request(
            "POST", f"/repos/{owner}/{repo}/issues/{number}/comments", json={"body": body}
        ).json()
