"""Materna documentation endpoints: weekly rollup (Tier 2) + full PDF (Tier 3)."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models.user import UserProfile
from app.services.pdf_report import generate_full_pdf
from app.services.weekly_rollup import generate_weekly_rollup, monday_of

router = APIRouter(prefix="/reports", tags=["reports"])

Auth = Annotated[CurrentUser, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]


class WeeklyRollupRequest(BaseModel):
    week_start_date: date | None = None


class WeeklyRollupResponse(BaseModel):
    generated: bool
    week_start_date: date | None = None
    week_summary: str | None = None
    days_checked_in: int | None = None
    hr_avg: float | None = None
    detail: str | None = None


@router.post("/generate-weekly-rollup", response_model=WeeklyRollupResponse)
def generate_weekly(payload: WeeklyRollupRequest, user: Auth, db: DB) -> WeeklyRollupResponse:
    """Generate (or regenerate) the weekly rollup for the current patient."""
    week_start = payload.week_start_date or monday_of(date.today())
    rollup = generate_weekly_rollup(db, user.id, week_start)
    if rollup is None:
        return WeeklyRollupResponse(
            generated=False,
            week_start_date=week_start,
            detail="No completed check-ins found for that week.",
        )
    return WeeklyRollupResponse(
        generated=True,
        week_start_date=rollup.week_start_date,
        week_summary=rollup.week_summary,
        days_checked_in=rollup.days_checked_in,
        hr_avg=rollup.hr_avg,
    )


@router.post("/generate-full-pdf")
def generate_full_report(user: Auth, db: DB) -> Response:
    """Generate the full doctor PDF report for the current patient and return it."""
    profile = db.get(UserProfile, uuid.UUID(user.id))
    name = "patient"
    if profile and profile.first_name:
        name = profile.first_name.lower()
    try:
        pdf_bytes = generate_full_pdf(db, user.id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF generation failed: {exc}",
        ) from exc

    filename = f"materna_report_{name}_{date.today():%Y%m%d}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
