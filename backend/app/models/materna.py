"""Materna-specific models: appointment requests and weekly rollups.

All user references use UUID to match the existing users/user_profiles schema.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AppointmentRequest(Base):
    __tablename__ = "appointment_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    doctor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    preferred_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    preferred_time_slot: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class WeeklyRollup(Base):
    __tablename__ = "weekly_rollups"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    week_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    gestational_week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    days_checked_in: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hr_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    hr_trend: Mapped[str | None] = mapped_column(String(20), nullable=True)
    hr_change_from_prior_week: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_avg_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_trend: Mapped[str | None] = mapped_column(String(20), nullable=True)
    hrv_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    symptom_frequency: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)
    mood_trend: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ppd_risk_trend: Mapped[str | None] = mapped_column(String(100), nullable=True)
    week_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    clinical_concerns: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    positive_notes: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    recommendation_for_doctor: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
