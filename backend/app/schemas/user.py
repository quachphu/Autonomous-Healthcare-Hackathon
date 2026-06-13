from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.doctor_patient import ConnectionStatus
from app.models.user import UserRole


class SignupRequest(BaseModel):
    email: str = Field(..., max_length=320)
    password: str = Field(..., min_length=6)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone_number: str = Field(..., max_length=30, pattern=r'^\+?[1-9]\d{1,14}$')


class UserProfileRead(BaseModel):
    id: UUID
    role: UserRole | None
    mascot_health: int
    first_name: str | None = None
    last_name: str | None = None
    phone_number: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    mascot_health: int | None = Field(None, ge=0, le=100)
    role: UserRole | None = None
    first_name: str | None = Field(None, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    phone_number: str | None = Field(None, max_length=30, pattern=r'^\+?[1-9]\d{1,14}$')
    emergency_contact_name: str | None = Field(None, max_length=200)
    emergency_contact_phone: str | None = Field(None, max_length=30)


class HealthRecordRead(BaseModel):
    user_id: UUID
    data: dict[str, Any]
    updated_at: datetime

    model_config = {"from_attributes": True}


class HealthRecordUpdate(BaseModel):
    """Partial merge — only provided keys are written; existing keys are preserved."""

    data: dict[str, Any]


class DoctorPatientCreate(BaseModel):
    patient_id: UUID


class DoctorPatientRead(BaseModel):
    doctor_id: UUID
    patient_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class ContactRead(BaseModel):
    """Represents a messaging contact (doctor or patient)."""

    id: str
    role: UserRole | None
    display_name: str
    email: str | None = None


class UserSearchResult(BaseModel):
    """Result from user search endpoint."""

    id: UUID
    first_name: str | None
    last_name: str | None
    display_name: str
    role: UserRole


class ConnectionRequestCreate(BaseModel):
    """Request to establish a doctor-patient connection."""

    target_user_id: UUID


class ConnectionWithStatus(DoctorPatientRead):
    """Doctor-patient connection with status information."""

    status: ConnectionStatus
    initiator_id: UUID

    model_config = {"from_attributes": True}


class DoctorPatientWithNames(BaseModel):
    """Doctor-patient link enriched with resolved display names."""

    doctor_id: UUID
    patient_id: UUID
    created_at: datetime
    patient_display_name: str
    doctor_display_name: str


class ConnectionWithNames(BaseModel):
    """Connection request enriched with resolved display names."""

    doctor_id: UUID
    patient_id: UUID
    created_at: datetime
    status: ConnectionStatus
    initiator_id: UUID
    patient_display_name: str
    doctor_display_name: str
