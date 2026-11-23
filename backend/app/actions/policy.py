"""The write policy: every check must pass before IssuePilot may write to GitHub."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.config import Settings
from app.models import ActionProposal, Repository

MESSAGES = {
    "DEMO_REPO": "Demo repository: writes are not possible.",
    "WRITE_DISABLED": "Writes are disabled. Set GITHUB_WRITE_ENABLED=true in .env.",
    "NO_TOKEN": "No GitHub token configured. Set GITHUB_TOKEN in .env.",
    "REPO_NOT_ALLOWLISTED": "{repo} is not listed in WRITE_ALLOWED_REPOS.",
    "NO_PUSH_PERMISSION": "The configured token does not have push access to {repo}.",
    "PROPOSAL_NOT_APPROVED": "Approve this proposal before applying it.",
    "ALREADY_APPLIED": "This proposal has already been applied.",
    "CONFIRMATION_MISMATCH": "Type {expected} exactly to confirm.",
    "ISSUE_CLOSED": "The issue is no longer open on GitHub.",
    "ISSUE_CHANGED_SINCE_ANALYSIS": "The issue changed since it was analyzed. Re-analyze first.",
    "NOTHING_TO_APPLY": "Nothing to apply: the labels are already present or no longer exist.",
}


@dataclass
class PolicyDecision:
    allowed: bool
    reasons: list[dict] = field(default_factory=list)

    @property
    def codes(self) -> list[str]:
        return [r["code"] for r in self.reasons]


def reason(code: str, **fmt: str) -> dict:
    return {"code": code, "message": MESSAGES[code].format(**fmt)}


def expected_confirmation(repo: Repository, issue_number: int) -> str:
    return f"{repo.full_name}#{issue_number}"


def evaluate_write_policy(
    settings: Settings,
    repo: Repository,
    proposal: ActionProposal,
    *,
    issue_number: int,
    confirm: str | None = None,
    check_confirmation: bool = False,
    push_permission: bool | None = None,
) -> PolicyDecision:
    if repo.is_demo:
        # Demo data never exists on GitHub; no other condition can make it writable.
        return PolicyDecision(allowed=False, reasons=[reason("DEMO_REPO")])
    reasons: list[dict] = []
    if not settings.github_write_enabled:
        reasons.append(reason("WRITE_DISABLED"))
    has_token = bool(settings.github_token_value)
    if not has_token:
        reasons.append(reason("NO_TOKEN"))
    if repo.full_name_key not in settings.allowed_repos:
        reasons.append(reason("REPO_NOT_ALLOWLISTED", repo=repo.full_name))
    push = repo.has_push_permission if push_permission is None else push_permission
    if has_token and not repo.is_demo and push is not True:
        reasons.append(reason("NO_PUSH_PERMISSION", repo=repo.full_name))
    if proposal.status == "applied":
        reasons.append(reason("ALREADY_APPLIED"))
    elif proposal.status != "approved":
        reasons.append(reason("PROPOSAL_NOT_APPROVED"))
    if check_confirmation:
        expected = expected_confirmation(repo, issue_number)
        if confirm != expected:
            reasons.append(reason("CONFIRMATION_MISMATCH", expected=expected))
    return PolicyDecision(allowed=not reasons, reasons=reasons)
