import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class UserRole(str, enum.Enum):
    patient = "patient"
    doctor = "doctor"


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        comment="Mirrors users.id",
    )
    role: Mapped[UserRole | None] = mapped_column(
        Enum(UserRole, name="user_role", create_constraint=False),
        nullable=True,
    )
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mascot_health: Mapped[int] = mapped_column(Integer, default=80, nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_checkin_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    timezone: Mapped[str] = mapped_column(
        String(50),
        default="America/Los_Angeles",  # PST/PDT default
        nullable=False
    )
    sms_reminders_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,  # Opt-out by default
        nullable=False
    )
    last_reminder_sent_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True
    )
    # Email notification preferences (all opt-in by default)
    email_daily_reminder_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    email_streak_alert_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    email_message_notification_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    last_email_reminder_sent_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_streak_email_sent_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_health_update: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class HealthRecord(Base):
    __tablename__ = "health_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), unique=True, nullable=False, index=True
    )
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
