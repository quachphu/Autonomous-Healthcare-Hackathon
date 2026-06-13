import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models.doctor_patient import ConnectionStatus, DoctorPatient
from app.models.user import HealthRecord, UserProfile, UserRole
from app.schemas.user import (
    HealthRecordRead,
    HealthRecordUpdate,
    UserProfileRead,
    UserProfileUpdate,
    UserSearchResult,
)

router = APIRouter(prefix="/users", tags=["users"])

Auth = Annotated[CurrentUser, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]


def _get_or_create_profile(db: Session, user_id: str) -> UserProfile:
    profile = db.get(UserProfile, user_id)
    if profile is None:
        profile = UserProfile(id=uuid.UUID(user_id), mascot_health=80)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def _get_or_create_health_record(db: Session, user_id: str) -> HealthRecord:
    record = db.query(HealthRecord).filter(HealthRecord.user_id == user_id).first()
    if record is None:
        record = HealthRecord(user_id=uuid.UUID(user_id), data={})
        db.add(record)
        db.commit()
        db.refresh(record)
    return record


def _format_display_name(profile: UserProfile) -> str:
    """Generate a user-friendly display name from a profile."""
    if profile.first_name and profile.last_name:
        return f"{profile.first_name} {profile.last_name}"
    if profile.first_name:
        return profile.first_name
    if profile.last_name:
        return profile.last_name
    # Fallback to role + partial UUID
    role_label = "Patient" if profile.role == UserRole.patient else "Doctor"
    return f"{role_label} {str(profile.id)[:8]}"


# ── Profile ──────────────────────────────────────────────────────────────────


@router.get("/me/profile", response_model=UserProfileRead)
def get_profile(user: Auth, db: DB) -> UserProfile:
    return _get_or_create_profile(db, user.id)


@router.patch("/me/profile", response_model=UserProfileRead)
def update_profile(payload: UserProfileUpdate, user: Auth, db: DB) -> UserProfile:
    profile = _get_or_create_profile(db, user.id)
    if payload.mascot_health is not None:
        profile.mascot_health = payload.mascot_health
    if payload.role is not None:
        # Role can only be set once (first-time setup)
        if profile.role is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Role has already been set and cannot be changed.",
            )
        profile.role = payload.role
    if payload.first_name is not None:
        profile.first_name = payload.first_name
    if payload.last_name is not None:
        profile.last_name = payload.last_name
    if payload.emergency_contact_name is not None:
        profile.emergency_contact_name = payload.emergency_contact_name
    if payload.emergency_contact_phone is not None:
        profile.emergency_contact_phone = payload.emergency_contact_phone
    db.commit()
    db.refresh(profile)
    return profile


# ── Notification preferences ──────────────────────────────────────────────────


from pydantic import BaseModel as _BaseModel


class NotificationPreferences(_BaseModel):
    daily_reminder: bool
    streak_alerts: bool
    message_notifications: bool


@router.get("/me/notification-preferences", response_model=NotificationPreferences)
def get_notification_preferences(user: Auth, db: DB) -> NotificationPreferences:
    profile = _get_or_create_profile(db, user.id)
    return NotificationPreferences(
        daily_reminder=profile.email_daily_reminder_enabled,
        streak_alerts=profile.email_streak_alert_enabled,
        message_notifications=profile.email_message_notification_enabled,
    )


@router.patch("/me/notification-preferences", response_model=NotificationPreferences)
def update_notification_preferences(
    payload: NotificationPreferences, user: Auth, db: DB
) -> NotificationPreferences:
    profile = _get_or_create_profile(db, user.id)
    profile.email_daily_reminder_enabled = payload.daily_reminder
    profile.email_streak_alert_enabled = payload.streak_alerts
    profile.email_message_notification_enabled = payload.message_notifications
    db.commit()
    db.refresh(profile)
    return NotificationPreferences(
        daily_reminder=profile.email_daily_reminder_enabled,
        streak_alerts=profile.email_streak_alert_enabled,
        message_notifications=profile.email_message_notification_enabled,
    )


# ── Health record ─────────────────────────────────────────────────────────────


@router.get("/me/health-record", response_model=HealthRecordRead)
def get_health_record(user: Auth, db: DB) -> HealthRecord:
    return _get_or_create_health_record(db, user.id)


@router.patch("/me/health-record", response_model=HealthRecordRead)
def update_health_record(
    payload: HealthRecordUpdate, user: Auth, db: DB
) -> HealthRecord:
    """Partial merge — incoming keys overwrite existing keys, others are preserved.
    Called by the frontend when executing voice agent tool results.
    """
    record = _get_or_create_health_record(db, user.id)
    record.data = {**record.data, **payload.data}
    db.commit()
    db.refresh(record)
    return record


# ── User Search ───────────────────────────────────────────────────────────────


@router.get("/search", response_model=list[UserSearchResult])
def search_users(q: str, user: Auth, db: DB, limit: int = 20) -> list[UserSearchResult]:
    """Search for users by name. Returns opposite role only (doctors see patients, patients see doctors)."""
    current_profile = _get_or_create_profile(db, user.id)

    if not current_profile.role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must select a role before searching for users.",
        )

    # Determine opposite role
    target_role = UserRole.patient if current_profile.role == UserRole.doctor else UserRole.doctor

    # Search by first name, last name, or full name (case-insensitive)
    search_term = f"%{q.lower()}%"
    results = (
        db.query(UserProfile)
        .filter(
            UserProfile.role == target_role,
            UserProfile.id != uuid.UUID(user.id),  # Exclude self
            (
                UserProfile.first_name.ilike(search_term)
                | UserProfile.last_name.ilike(search_term)
                | (
                    (UserProfile.first_name + " " + UserProfile.last_name).ilike(
                        search_term
                    )
                )
            ),
        )
        .limit(limit)
        .all()
    )

    return [
        UserSearchResult(
            id=p.id,
            first_name=p.first_name,
            last_name=p.last_name,
            display_name=_format_display_name(p),
            role=p.role,
        )
        for p in results
    ]


# ── Doctor Access to Patient Data ────────────────────────────────────────────


@router.get("/{user_id}/health-record", response_model=HealthRecordRead)
def get_user_health_record(user_id: str, user: Auth, db: DB) -> HealthRecord:
    """Doctors can access health records of connected patients."""
    current_profile = _get_or_create_profile(db, user.id)

    if current_profile.role != UserRole.doctor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only doctors can access patient health records.",
        )

    # Verify accepted connection exists
    connection = (
        db.query(DoctorPatient)
        .filter(
            DoctorPatient.doctor_id == uuid.UUID(user.id),
            DoctorPatient.patient_id == uuid.UUID(user_id),
            DoctorPatient.status == ConnectionStatus.accepted,
        )
        .first()
    )

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must have an accepted connection to access this patient's health record.",
        )

    return _get_or_create_health_record(db, user_id)


@router.patch("/{user_id}/health-record", response_model=HealthRecordRead)
def update_user_health_record(
    user_id: str, payload: HealthRecordUpdate, user: Auth, db: DB
) -> HealthRecord:
    """Doctors can update health records of connected patients (partial merge)."""
    current_profile = _get_or_create_profile(db, user.id)

    if current_profile.role != UserRole.doctor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only doctors can update patient health records.",
        )

    # Verify accepted connection exists
    connection = (
        db.query(DoctorPatient)
        .filter(
            DoctorPatient.doctor_id == uuid.UUID(user.id),
            DoctorPatient.patient_id == uuid.UUID(user_id),
            DoctorPatient.status == ConnectionStatus.accepted,
        )
        .first()
    )

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must have an accepted connection to update this patient's health record.",
        )

    # Apply partial merge
    record = _get_or_create_health_record(db, user_id)
    record.data = {**record.data, **payload.data}
    db.commit()
    db.refresh(record)
    return record


@router.get("/{user_id}/profile", response_model=UserProfileRead)
def get_user_profile(user_id: str, user: Auth, db: DB) -> UserProfile:
    """Access connected user's profile (bidirectional for doctors and patients)."""
    current_profile = _get_or_create_profile(db, user.id)

    if not current_profile.role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must select a role before accessing user profiles.",
        )

    # Check for accepted connection (bidirectional)
    connection = (
        db.query(DoctorPatient)
        .filter(
            (
                (
                    (DoctorPatient.doctor_id == uuid.UUID(user.id))
                    & (DoctorPatient.patient_id == uuid.UUID(user_id))
                )
                | (
                    (DoctorPatient.patient_id == uuid.UUID(user.id))
                    & (DoctorPatient.doctor_id == uuid.UUID(user_id))
                )
            ),
            DoctorPatient.status == ConnectionStatus.accepted,
        )
        .first()
    )

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must have an accepted connection to access this user's profile.",
        )

    target_profile = db.get(UserProfile, uuid.UUID(user_id))
    if not target_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    return target_profile
