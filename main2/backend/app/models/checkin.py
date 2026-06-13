import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SessionStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class CheckupSession(Base):
    __tablename__ = "checkup_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, name="session_status"),
        nullable=False,
        default=SessionStatus.pending,
    )
    stats: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    rppg_raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Brownie points are set on session completion. Algorithm is a stub (TODO).
    brownie_points: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Materna: conversational check-in summary (from voice agent SUMMARY block) ──
    mood_label: Mapped[str | None] = mapped_column(String(50), nullable=True)
    mood_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    edinburgh_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    symptom_flags: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    urgency_level: Mapped[str | None] = mapped_column(
        String(20), nullable=True, default="normal"
    )
    plain_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    clinical_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    hospital_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    patient_quote: Mapped[str | None] = mapped_column(Text, nullable=True)
    full_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ── Materna: simulated Apple Watch biometrics (demo only) ──
    watch_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # ── Materna: notification + emergency bookkeeping ──
    email_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    emergency_call_placed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    emergency_call_sid: Mapped[str | None] = mapped_column(String(100), nullable=True)

    __table_args__ = (
        # Covers: 30-day brownie chart, streak calculation, calendar panel
        Index("ix_checkup_sessions_user_completed", "user_id", "completed_at"),
    )
