from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from app.models.checkin import SessionStatus


class SessionRead(BaseModel):
    id: UUID
    user_id: UUID
    status: SessionStatus
    stats: dict[str, Any] | None
    brownie_points: float | None
    started_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class SessionCreated(BaseModel):
    session_id: UUID
    status: SessionStatus
    started_at: datetime


class RealtimeTokenResponse(BaseModel):
    """Ephemeral OpenAI Realtime token the client uses to connect directly."""

    token: str
    expires_at: int
    model: str


class RppgDataPayload(BaseModel):
    """Raw rPPG signal data submitted from the frontend.
    Shape is intentionally flexible until the signal-processing pipeline is defined.
    TODO: replace Any with typed schema once rPPG pipeline is scoped.
    """

    data: dict[str, Any]


class CompleteSessionRequest(BaseModel):
    """Frontend submits extracted stats at the end of a checkup session."""

    stats: dict[str, Any] | None = None


class CompleteSessionResponse(BaseModel):
    session_id: UUID
    brownie_points: float
    mascot_health: int
    streak: int
    longest_streak: int
