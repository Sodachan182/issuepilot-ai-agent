from __future__ import annotations

from sqlmodel import Session

from app.errors import not_found
from app.models import ActionProposal, IssueSnapshot, Repository


def get_repo_or_404(session: Session, repo_id: int) -> Repository:
    repo = session.get(Repository, repo_id)
    if repo is None:
        raise not_found("Repository")
    return repo


def get_issue_or_404(session: Session, issue_id: int) -> IssueSnapshot:
    issue = session.get(IssueSnapshot, issue_id)
    if issue is None:
        raise not_found("Issue")
    return issue


def get_proposal_or_404(session: Session, proposal_id: int) -> ActionProposal:
    p = session.get(ActionProposal, proposal_id)
    if p is None:
        raise not_found("Proposal")
    return p
