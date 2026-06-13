"""Appointment request endpoints for Materna.

Patients request an appointment with one of their connected doctors. Confirmation
and notification emails are sent via SMTP (credential-gated, background tasks).
"""

import uuid
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models.doctor_patient import ConnectionStatus, DoctorPatient
from app.models.materna import AppointmentRequest
from app.models.user import User, UserProfile, UserRole
from app.services.email_report import send_html_email

router = APIRouter(prefix="/appointments", tags=["appointments"])

Auth = Annotated[CurrentUser, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]


def _display_name(profile: UserProfile | None) -> str:
    if profile is None:
        return "Unknown"
    if profile.first_name and profile.last_name:
        return f"{profile.first_name} {profile.last_name}"
    return profile.first_name or profile.last_name or "Unknown"


class DoctorOption(BaseModel):
    id: uuid.UUID
    display_name: str
    initials: str


class AppointmentCreate(BaseModel):
    doctor_id: uuid.UUID
    preferred_date: date | None = None
    preferred_time_slot: str | None = None
    reason: str | None = None


class AppointmentRead(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    doctor_id: uuid.UUID
    doctor_display_name: str
    preferred_date: date | None
    preferred_time_slot: str | None
    reason: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


def _initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    return "".join(p[0].upper() for p in parts[:2]) or "?"


@router.get("/doctors", response_model=list[DoctorOption])
def list_connected_doctors(user: Auth, db: DB) -> list[DoctorOption]:
    """Connected (accepted) doctors the current patient can book with."""
    links = db.execute(
        select(DoctorPatient).where(
            DoctorPatient.patient_id == uuid.UUID(user.id),
            DoctorPatient.status == ConnectionStatus.accepted,
        )
    ).scalars().all()

    options: list[DoctorOption] = []
    for link in links:
        profile = db.get(UserProfile, link.doctor_id)
        name = _display_name(profile)
        options.append(DoctorOption(id=link.doctor_id, display_name=name, initials=_initials(name)))
    return options


@router.post("", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    background_tasks: BackgroundTasks,
    user: Auth,
    db: DB,
) -> AppointmentRead:
    """Create an appointment request with a connected doctor."""
    # Verify accepted connection.
    connection = db.execute(
        select(DoctorPatient).where(
            DoctorPatient.patient_id == uuid.UUID(user.id),
            DoctorPatient.doctor_id == payload.doctor_id,
            DoctorPatient.status == ConnectionStatus.accepted,
        )
    ).scalar_one_or_none()
    if connection is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only request appointments with a connected doctor.",
        )

    appt = AppointmentRequest(
        patient_id=uuid.UUID(user.id),
        doctor_id=payload.doctor_id,
        preferred_date=payload.preferred_date,
        preferred_time_slot=payload.preferred_time_slot,
        reason=payload.reason,
        status="pending",
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)

    patient_profile = db.get(UserProfile, uuid.UUID(user.id))
    doctor_profile = db.get(UserProfile, payload.doctor_id)
    patient_name = _display_name(patient_profile)
    doctor_name = _display_name(doctor_profile)

    when = payload.preferred_date.isoformat() if payload.preferred_date else "an unspecified date"
    slot = payload.preferred_time_slot or "any time"

    # Confirmation to patient + notification to doctor (gated).
    patient_user = db.get(User, uuid.UUID(user.id))
    doctor_user = db.get(User, payload.doctor_id)
    if patient_user and patient_user.email:
        background_tasks.add_task(
            send_html_email,
            patient_user.email,
            f"Appointment request sent — Materna",
            f"<p>Your appointment request has been sent to Dr. {doctor_name} "
            f"for {when} ({slot}).</p><p>You'll be notified when they respond.</p>",
        )
    if doctor_user and doctor_user.email:
        background_tasks.add_task(
            send_html_email,
            doctor_user.email,
            f"New appointment request from {patient_name} — Materna",
            f"<p>{patient_name} has requested an appointment on {when} ({slot}).</p>"
            f"<p>Reason: {payload.reason or 'not specified'}</p>",
        )

    return AppointmentRead(
        id=appt.id,
        patient_id=appt.patient_id,
        doctor_id=appt.doctor_id,
        doctor_display_name=doctor_name,
        preferred_date=appt.preferred_date,
        preferred_time_slot=appt.preferred_time_slot,
        reason=appt.reason,
        status=appt.status,
        created_at=appt.created_at,
    )


@router.get("", response_model=list[AppointmentRead])
def list_my_appointments(user: Auth, db: DB) -> list[AppointmentRead]:
    """List the current user's appointment requests (as patient or doctor)."""
    profile = db.get(UserProfile, uuid.UUID(user.id))
    is_doctor = profile and profile.role == UserRole.doctor
    column = AppointmentRequest.doctor_id if is_doctor else AppointmentRequest.patient_id
    appts = db.execute(
        select(AppointmentRequest)
        .where(column == uuid.UUID(user.id))
        .order_by(AppointmentRequest.created_at.desc())
    ).scalars().all()

    out: list[AppointmentRead] = []
    for a in appts:
        doctor_profile = db.get(UserProfile, a.doctor_id)
        out.append(AppointmentRead(
            id=a.id,
            patient_id=a.patient_id,
            doctor_id=a.doctor_id,
            doctor_display_name=_display_name(doctor_profile),
            preferred_date=a.preferred_date,
            preferred_time_slot=a.preferred_time_slot,
            reason=a.reason,
            status=a.status,
            created_at=a.created_at,
        ))
    return out
