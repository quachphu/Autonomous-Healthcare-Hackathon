"""Check-up session management and OpenAI Realtime token issuance.

Flow:
  1. POST /checkup/sessions           → create session
  2. POST /checkup/sessions/{id}/realtime-token → get ephemeral OpenAI token
  3. Client connects directly to wss://api.openai.com/v1/realtime
  4. POST /checkup/sessions/{id}/rppg-data      → submit rPPG payload (stub)
  5. POST /checkup/sessions/{id}/complete       → finalize, compute side-effects
"""

import uuid
from datetime import date, datetime, timezone
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.session import get_db
from app.dependencies import CurrentUser, get_current_user, require_patient_role
from app.models.checkin import CheckupSession, SessionStatus
from app.models.doctor_patient import ConnectionStatus, DoctorPatient
from app.models.user import UserProfile, UserRole
from app.routers.dashboard import _apply_health_decay, _compute_streak, _get_profile
from app.schemas.checkup import (
    CompleteSessionRequest,
    CompleteSessionResponse,
    RealtimeTokenResponse,
    RppgDataPayload,
    SessionCreated,
    SessionRead,
)

router = APIRouter(prefix="/checkup", tags=["checkup"])

Auth = Annotated[CurrentUser, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]
Cfg = Annotated[Settings, Depends(get_settings)]

_OPENAI_REALTIME_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions"
_REALTIME_MODEL = "gpt-4o-realtime-preview"


def _get_session_or_404(db: Session, session_id: uuid.UUID, user_id: str) -> CheckupSession:
    session = db.get(CheckupSession, session_id)
    if session is None or str(session.user_id) != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/sessions", response_model=SessionCreated, status_code=status.HTTP_201_CREATED)
def create_session(user: Auth, db: DB) -> SessionCreated:
    """Start a new checkup session."""
    require_patient_role(db, user.id)
    session = CheckupSession(
        user_id=uuid.UUID(user.id),
        status=SessionStatus.in_progress,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return SessionCreated(
        session_id=session.id,
        status=session.status,
        started_at=session.started_at,
    )


@router.get("/sessions", response_model=list[SessionRead])
def list_sessions(user: Auth, db: DB) -> list[CheckupSession]:
    """List all checkup sessions for the current user, newest first."""
    require_patient_role(db, user.id)
    return db.execute(
        select(CheckupSession)
        .where(CheckupSession.user_id == user.id)
        .order_by(CheckupSession.started_at.desc())
    ).scalars().all()


@router.get("/sessions/{session_id}", response_model=SessionRead)
def get_session(session_id: uuid.UUID, user: Auth, db: DB) -> CheckupSession:
    require_patient_role(db, user.id)
    return _get_session_or_404(db, session_id, user.id)


@router.post("/sessions/{session_id}/realtime-token", response_model=RealtimeTokenResponse)
def get_realtime_token(session_id: uuid.UUID, user: Auth, db: DB, cfg: Cfg) -> RealtimeTokenResponse:
    """Create an ephemeral OpenAI Realtime token.
    The client uses this token to connect directly to wss://api.openai.com/v1/realtime.
    """
    require_patient_role(db, user.id)
    _get_session_or_404(db, session_id, user.id)

    if not cfg.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OPENAI_API_KEY is not configured on the server.",
        )

    try:
        resp = httpx.post(
            _OPENAI_REALTIME_SESSIONS_URL,
            headers={
                "Authorization": f"Bearer {cfg.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={"model": _REALTIME_MODEL, "voice": "alloy"},
            timeout=10.0,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI token creation failed: {exc.response.text}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI unreachable: {exc}",
        ) from exc

    body = resp.json()
    secret = body.get("client_secret", {})
    return RealtimeTokenResponse(
        token=secret.get("value", ""),
        expires_at=secret.get("expires_at", 0),
        model=body.get("model", _REALTIME_MODEL),
    )


@router.post("/sessions/{session_id}/rppg-data", status_code=status.HTTP_202_ACCEPTED)
def submit_rppg_data(
    session_id: uuid.UUID, payload: RppgDataPayload, user: Auth, db: DB
) -> dict:
    """Accept rPPG signal data from the frontend.
    TODO: wire to signal-processing service once rPPG pipeline is scoped.
    """
    require_patient_role(db, user.id)
    session = _get_session_or_404(db, session_id, user.id)
    session.rppg_raw = payload.data
    db.commit()
    return {"accepted": True}


@router.post("/sessions/{session_id}/complete", response_model=CompleteSessionResponse)
def complete_session(
    session_id: uuid.UUID, payload: CompleteSessionRequest, user: Auth, db: DB
) -> CompleteSessionResponse:
    """Finalize the session and run side-effects:
      1. Persist stats + brownie_points (stub algorithm)
      2. Apply health decay + gain
      3. Update streak tracking
      4. Return updated summary fields for optimistic dashboard refresh
    """
    require_patient_role(db, user.id)
    session = _get_session_or_404(db, session_id, user.id)

    if session.status == SessionStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Session already completed"
        )

    # TODO: replace stub with real brownie-points algorithm once clinical rules are defined
    stub_points = 0.0

    session.stats = payload.stats
    session.brownie_points = stub_points
    session.status = SessionStatus.completed
    session.completed_at = datetime.now(timezone.utc)
    db.flush()

    profile = _get_profile(db, user.id)
    today_date = date.today()

    # Apply decay before adding gain
    decayed_health = _apply_health_decay(profile)

    # Add +10 health, cap at 100
    new_health = min(100, decayed_health + 10)

    profile.mascot_health = new_health
    profile.last_checkin_date = today_date
    profile.last_health_update = datetime.now(timezone.utc)

    # Update longest streak if current exceeds it
    current_streak = _compute_streak(db, user.id)
    if current_streak > profile.longest_streak:
        profile.longest_streak = current_streak

    db.commit()

    return CompleteSessionResponse(
        session_id=session.id,
        brownie_points=stub_points,
        mascot_health=profile.mascot_health,
        streak=current_streak,
        longest_streak=profile.longest_streak,
    )


@router.get("/sessions/patient/{patient_id}", response_model=list[SessionRead])
def get_patient_sessions(patient_id: uuid.UUID, user: Auth, db: DB) -> list[CheckupSession]:
    """List all checkup sessions for a connected patient (doctor access only)."""
    # Verify current user is a doctor
    doctor_profile = db.get(UserProfile, uuid.UUID(user.id))
    if doctor_profile is None or doctor_profile.role != UserRole.doctor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action is only available to doctors.",
        )

    # Verify accepted connection exists
    connection = db.execute(
        select(DoctorPatient).where(
            DoctorPatient.doctor_id == uuid.UUID(user.id),
            DoctorPatient.patient_id == patient_id,
            DoctorPatient.status == ConnectionStatus.accepted,
        )
    ).scalar_one_or_none()

    if connection is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No accepted connection with this patient.",
        )

    # Return patient's sessions, newest first
    return db.execute(
        select(CheckupSession)
        .where(CheckupSession.user_id == patient_id)
        .order_by(CheckupSession.started_at.desc())
    ).scalars().all()
