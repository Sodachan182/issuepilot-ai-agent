from __future__ import annotations

from datetime import datetime


class GitHubError(Exception):
    """Generic GitHub API failure. Messages never include credentials."""


class GitHubNotFound(GitHubError):
    pass


class GitHubAuthError(GitHubError):
    pass


class GitHubRateLimited(GitHubError):
    def __init__(self, reset_at: datetime | None) -> None:
        super().__init__("GitHub rate limit reached")
        self.reset_at = reset_at
