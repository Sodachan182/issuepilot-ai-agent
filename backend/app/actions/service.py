"""Proposal lifecycle. This is the ONLY module allowed to call GitHub write methods."""

from __future__ import annotations

from collections.abc import Callable

from sqlmodel import Session, select

from app import audit
from app.actions.policy import PolicyDecision, evaluate_write_policy, reason
from app.config import Settings
from app.errors import AppError, invalid_state
from app.github.client import GitHubClient
from app.github.errors import GitHubError
from app.models import ActionProposal, IssueAnalysis, IssueSnapshot, Repository, utcnow

MAX_COMMENT_CHARS = 5000
OPEN_STATES = ("proposed", "approved", "failed")


class WriteBlocked(AppError):
    def __init__(self, decision: PolicyDecision) -> None:
        super().__init__(
            "WRITE_BLOCKED",
            "This change cannot be applied: " + "; ".join(r["message"] for r in decision.reasons),
            409,
            {"reasons": decision.reasons},
        )


def create_proposals(
    session: Session, analysis: IssueAnalysis, issue: IssueSnapshot, repo: Repository
) -> list[ActionProposal]:
    # Supersede still-open proposals from earlier analyses of this issue.
    previous = session.exec(
        select(ActionProposal).where(
            ActionProposal.issue_id == issue.id,
            ActionProposal.status.in_(OPEN_STATES),  # type: ignore[attr-defined]
        )
    ).all()
    for p in previous:
        p.status = "superseded"
        p.decided_at = utcnow()
        session.add(p)

    proposals: list[ActionProposal] = []
    existing = {lbl.lower() for lbl in issue.labels}
    labels = [s["name"] for s in analysis.suggested_labels if s["name"].lower() not in existing]
    if labels:
        proposals.append(
            ActionProposal(
                analysis_id=analysis.id,  # type: ignore[arg-type]
                issue_id=issue.id,  # type: ignore[arg-type]
                repository_id=repo.id,  # type: ignore[arg-type]
                type="add_labels",
                payload={"labels": labels},
                original_payload={"labels": labels},
            )
        )
    if analysis.draft_response:
        proposals.append(
            ActionProposal(
                analysis_id=analysis.id,  # type: ignore[arg-type]
                issue_id=issue.id,  # type: ignore[arg-type]
                repository_id=repo.id,  # type: ignore[arg-type]
                type="post_comment",
                payload={"body": analysis.draft_response},
                original_payload={"body": analysis.draft_response},
            )
        )
    for p in proposals:
        session.add(p)
    session.commit()
    for p in proposals:
        session.refresh(p)
    return proposals


def _context(session: Session, proposal: ActionProposal) -> tuple[Repository, IssueSnapshot]:
    repo = session.get(Repository, proposal.repository_id)
    issue = session.get(IssueSnapshot, proposal.issue_id)
    if repo is None or issue is None:
        raise AppError("NOT_FOUND", "Proposal context not found", 404)
    return repo, issue


def edit_proposal(
    session: Session,
    proposal: ActionProposal,
    *,
    labels: list[str] | None = None,
    body: str | None = None,
) -> ActionProposal:
    if proposal.status not in OPEN_STATES:
        raise invalid_state(f"Cannot edit a proposal that is {proposal.status}")
    repo, issue = _context(session, proposal)
    if proposal.type == "add_labels":
        if labels is None:
            raise AppError("VALIDATION_ERROR", "labels is required", 422)
        allowed = {name.lower(): name for name in repo.label_names}
        clean: list[str] = []
        for name in labels:
            canonical = allowed.get(name.strip().lower())
            if canonical is None:
                raise AppError(
                    "VALIDATION_ERROR", f"Label '{name}' does not exist in the repo", 422
                )
            if canonical not in clean:
                clean.append(canonical)
        proposal.payload = {"labels": clean}
    else:
        if body is None or not body.strip():
            raise AppError("VALIDATION_ERROR", "Comment body cannot be empty", 422)
        if len(body) > MAX_COMMENT_CHARS:
            raise AppError("VALIDATION_ERROR", "Comment is too long", 422)
        proposal.payload = {"body": body.strip()}
    proposal.edited = proposal.payload != proposal.original_payload
    proposal.status = "proposed"
    proposal.error = None
    session.add(proposal)
    session.commit()
    session.refresh(proposal)
    audit.record_event(
        session,
        "proposal_edited",
        repository_id=repo.id,
        issue_number=issue.number,
        proposal_id=proposal.id,
        details={"type": proposal.type},
    )
    return proposal


def approve(session: Session, proposal: ActionProposal) -> ActionProposal:
    if proposal.status not in ("proposed", "failed"):
        raise invalid_state(f"Cannot approve a proposal that is {proposal.status}")
    repo, issue = _context(session, proposal)
    if proposal.type == "add_labels" and not proposal.payload.get("labels"):
        raise AppError("VALIDATION_ERROR", "Select at least one label to approve", 422)
    proposal.status = "approved"
    proposal.decided_at = utcnow()
    session.add(proposal)
    session.commit()
    session.refresh(proposal)
    audit.record_event(
        session,
        "proposal_approved",
        repository_id=repo.id,
        issue_number=issue.number,
        proposal_id=proposal.id,
        details={"type": proposal.type, "edited": proposal.edited},
    )
    return proposal


def reject(session: Session, proposal: ActionProposal, reason_text: str | None) -> ActionProposal:
    if proposal.status not in OPEN_STATES:
        raise invalid_state(f"Cannot reject a proposal that is {proposal.status}")
    repo, issue = _context(session, proposal)
    proposal.status = "rejected"
    proposal.reject_reason = (reason_text or "").strip()[:500] or None
    proposal.decided_at = utcnow()
    session.add(proposal)
    session.commit()
    session.refresh(proposal)
    audit.record_event(
        session,
        "proposal_rejected",
        repository_id=repo.id,
        issue_number=issue.number,
        proposal_id=proposal.id,
        details={"type": proposal.type, "reason": proposal.reject_reason},
    )
    return proposal


def policy_for(session: Session, proposal: ActionProposal, settings: Settings) -> PolicyDecision:
    repo, issue = _context(session, proposal)
    return evaluate_write_policy(settings, repo, proposal, issue_number=issue.number)


def apply_proposal(
    session: Session,
    proposal: ActionProposal,
    *,
    confirm: str | None,
    dry_run: bool,
    settings: Settings,
    client_factory: Callable[[Settings], GitHubClient] = GitHubClient,
) -> dict:
    repo, issue = _context(session, proposal)
    analysis = session.get(IssueAnalysis, proposal.analysis_id)

    def block(decision: PolicyDecision) -> None:
        audit.record_event(
            session,
            "apply_blocked",
            repository_id=repo.id,
            issue_number=issue.number,
            proposal_id=proposal.id,
            details={"reasons": decision.codes, "dry_run": dry_run},
        )
        raise WriteBlocked(decision)

    # 1) Static policy (no network) — fail fast without touching GitHub.
    decision = evaluate_write_policy(
        settings,
        repo,
        proposal,
        issue_number=issue.number,
        confirm=confirm,
        check_confirmation=True,
        push_permission=True,  # verified live below
    )
    if not decision.allowed:
        block(decision)

    with client_factory(settings) as gh:
        # 2) Live permission check.
        try:
            repo_data = gh.get_repo(repo.owner, repo.name)
        except GitHubError as exc:
            raise AppError("GITHUB_ERROR", str(exc), 502) from exc
        push = bool((repo_data.get("permissions") or {}).get("push"))
        repo.has_push_permission = push
        session.add(repo)
        session.commit()
        decision = evaluate_write_policy(
            settings,
            repo,
            proposal,
            issue_number=issue.number,
            confirm=confirm,
            check_confirmation=True,
            push_permission=push,
        )
        if not decision.allowed:
            block(decision)

        # 3) Re-fetch the issue: it must still be open and unchanged since analysis.
        live = gh.get_issue(repo.owner, repo.name, issue.number)
        from app.triage.service import body_hash

        reasons: list[dict] = []
        if live.get("state") != "open":
            reasons.append(reason("ISSUE_CLOSED"))
        live_hash = body_hash(live.get("title") or "", live.get("body") or "")
        if analysis is None or live_hash != analysis.issue_body_hash:
            reasons.append(reason("ISSUE_CHANGED_SINCE_ANALYSIS"))

        base = f"{settings.github_api_base.rstrip('/')}/repos/{repo.owner}/{repo.name}"
        if proposal.type == "add_labels":
            repo_labels = {n.lower() for n in gh.list_labels(repo.owner, repo.name)}
            present = {(lbl.get("name") or "").lower() for lbl in live.get("labels") or []}
            to_add = [
                name
                for name in proposal.payload.get("labels", [])
                if name.lower() in repo_labels and name.lower() not in present
            ]
            if not to_add:
                reasons.append(reason("NOTHING_TO_APPLY"))
            planned = {
                "method": "POST",
                "url": f"{base}/issues/{issue.number}/labels",
                "body": {"labels": to_add},
            }
        else:
            body = (proposal.payload.get("body") or "").strip()
            if not body:
                reasons.append(reason("NOTHING_TO_APPLY"))
            planned = {
                "method": "POST",
                "url": f"{base}/issues/{issue.number}/comments",
                "body": {"body": body},
            }
        if reasons:
            block(PolicyDecision(allowed=False, reasons=reasons))

        if dry_run:
            audit.record_event(
                session,
                "write_dry_run",
                repository_id=repo.id,
                issue_number=issue.number,
                proposal_id=proposal.id,
                details={"type": proposal.type, "planned": planned},
            )
            return {"status": proposal.status, "dry_run": True, "planned_request": planned}

        # 4) Perform the write (the only place in the codebase that does).
        session.refresh(proposal)
        if proposal.status != "approved":
            block(PolicyDecision(False, [reason("PROPOSAL_NOT_APPROVED")]))
        try:
            if proposal.type == "add_labels":
                gh.add_labels(repo.owner, repo.name, issue.number, planned["body"]["labels"])
                proposal.github_ref = issue.html_url or None
            else:
                result = gh.create_comment(
                    repo.owner, repo.name, issue.number, planned["body"]["body"]
                )
                proposal.github_ref = result.get("html_url")
        except GitHubError as exc:
            proposal.status = "failed"
            proposal.error = str(exc)
            session.add(proposal)
            session.commit()
            audit.record_event(
                session,
                "apply_failed",
                repository_id=repo.id,
                issue_number=issue.number,
                proposal_id=proposal.id,
                details={"type": proposal.type, "error": str(exc)},
            )
            raise AppError("GITHUB_WRITE_FAILED", str(exc), 502) from exc

    proposal.status = "applied"
    proposal.applied_at = utcnow()
    proposal.error = None
    session.add(proposal)
    if proposal.type == "add_labels":
        issue.labels = list(dict.fromkeys([*issue.labels, *planned["body"]["labels"]]))
        session.add(issue)
    session.commit()
    session.refresh(proposal)
    audit.record_event(
        session,
        "apply_succeeded",
        repository_id=repo.id,
        issue_number=issue.number,
        proposal_id=proposal.id,
        details={"type": proposal.type, "github_ref": proposal.github_ref},
    )
    return {"status": "applied", "dry_run": False, "github_ref": proposal.github_ref}
