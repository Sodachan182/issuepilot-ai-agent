"""Parse user input like ``owner/repo`` or a GitHub URL into (owner, repo)."""

from __future__ import annotations

import re

_OWNER = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
_REPO = re.compile(r"^[A-Za-z0-9._-]{1,100}$")


def parse_repo_input(value: str) -> tuple[str, str]:
    raw = (value or "").strip()
    if not raw or len(raw) > 200:
        raise ValueError("Enter a repository as owner/repo or a GitHub URL")

    text = re.sub(r"^https?://", "", raw, flags=re.IGNORECASE)
    text = re.sub(r"^www\.", "", text, flags=re.IGNORECASE)
    from_url = False
    if text.lower().startswith("github.com/"):
        text = text[len("github.com/") :]
        from_url = True
    elif re.match(r"^[^/]*\.[^/]*/", text) or "://" in raw:
        raise ValueError("Only github.com repositories are supported")

    text = text.split("?", 1)[0].split("#", 1)[0]
    parts = [p for p in text.split("/") if p]
    if len(parts) < 2 or (not from_url and len(parts) != 2):
        raise ValueError("Enter a repository as owner/repo or a GitHub URL")

    owner, repo = parts[0], parts[1]
    if repo.lower().endswith(".git"):
        repo = repo[:-4]
    if not _OWNER.match(owner) or not _REPO.match(repo) or repo in {".", ".."}:
        raise ValueError("That does not look like a valid GitHub repository name")
    return owner, repo


def repo_key(full_name: str) -> str:
    return full_name.strip().lower()
