"""Proposal edit / approve / reject / policy / apply."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.actions import service as actions
from app.api.deps import get_proposal_or_404
from app.config import get_settings
from app.db import get_session
from app.serializers import proposal_out

router = APIRouter()


class EditIn(BaseModel):
    labels: list[str] | None = None
    body: str | None = Field(default=None, max_length=10000)


class RejectIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class ApplyIn(BaseModel):
    confirm: str = Field(default="", max_length=300)
    dry_run: bool = False


@router.patch("/proposals/{proposal_id}")
def edit(proposal_id: int, body: EditIn, session: Session = Depends(get_session)) -> dict:
    p = get_proposal_or_404(session, proposal_id)
    return proposal_out(actions.edit_proposal(session, p, labels=body.labels, body=body.body))


@router.post("/proposals/{proposal_id}/approve")
def approve(proposal_id: int, session: Session = Depends(get_session)) -> dict:
    return proposal_out(actions.approve(session, get_proposal_or_404(session, proposal_id)))


@router.post("/proposals/{proposal_id}/reject")
def reject(
    proposal_id: int, body: RejectIn | None = None, session: Session = Depends(get_session)
) -> dict:
    p = get_proposal_or_404(session, proposal_id)
    return proposal_out(actions.reject(session, p, body.reason if body else None))


@router.get("/proposals/{proposal_id}/policy")
def policy(proposal_id: int, session: Session = Depends(get_session)) -> dict:
    p = get_proposal_or_404(session, proposal_id)
    decision = actions.policy_for(session, p, get_settings())
    return {"allowed": decision.allowed, "reasons": decision.reasons}


@router.post("/proposals/{proposal_id}/apply")
def apply(proposal_id: int, body: ApplyIn, session: Session = Depends(get_session)) -> dict:
    p = get_proposal_or_404(session, proposal_id)
    result = actions.apply_proposal(
        session, p, confirm=body.confirm, dry_run=body.dry_run, settings=get_settings()
    )
    session.refresh(p)
    return {**result, "proposal": proposal_out(p)}
