"""Admin endpoints for user management and simulation features."""

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import CurrentUser, get_admin_user
from app.models.admin import ActionStatus, ActionType, AdminAuditLog, PendingAction
from app.models.checkin import CheckupSession, SessionStatus
from app.models.user import HealthRecord, UserProfile, UserRole
from app.routers.dashboard import _compute_streak
from app.schemas.admin import (
    AdminAuditLogRead,
    AdminStatsResponse,
    AdminUpdateUser,
    AdminUserDetail,
    AdminUserSummary,
    PendingActionRead,
    RecentSession,
    ScheduleActionRequest,
)

router = APIRouter(prefix="/admin", tags=["admin"])

Auth = Annotated[CurrentUser, Depends(get_admin_user)]
DB = Annotated[Session, Depends(get_db)]


def _log_audit(
    db: Session,
    admin_id: str,
    action: str,
    target_user_id: str | None = None,
    old_values: dict | None = None,
    new_values: dict | None = None,
) -> None:
    """Create an audit log entry."""
    log = AdminAuditLog(
        admin_id=uuid.UUID(admin_id),
        action=action,
        target_user_id=uuid.UUID(target_user_id) if target_user_id else None,
        old_values=old_values,
        new_values=new_values,
    )
    db.add(log)


# ── User Management Endpoints ────────────────────────────────────────────────


@router.get("/users", response_model=list[AdminUserSummary])
def list_users(
    admin: Auth,
    db: DB,
    q: str | None = Query(None, description="Search by email or name"),
    role: UserRole | None = Query(None, description="Filter by role"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[AdminUserSummary]:
    """List all users with search, filter, and pagination."""
    # Base query with profile and auth email
    stmt = select(UserProfile)

    # Search by email or name
    if q:
        search = f"%{q.lower()}%"
        stmt = stmt.where(
            func.lower(UserProfile.first_name).like(search)
            | func.lower(UserProfile.last_name).like(search)
        )

    # Filter by role
    if role:
        stmt = stmt.where(UserProfile.role == role)

    stmt = stmt.order_by(UserProfile.created_at.desc()).limit(limit).offset(offset)

    profiles = db.execute(stmt).scalars().all()

    # Build response with aggregated data
    results = []
    for profile in profiles:
        # Get session counts
        total_sessions = db.execute(
            select(func.count())
            .select_from(CheckupSession)
            .where(
                CheckupSession.user_id == profile.id,
                CheckupSession.status == SessionStatus.completed,
            )
        ).scalar()

        # Compute current streak
        current_streak = _compute_streak(db, str(profile.id))

        # Get email from Supabase auth (we'll need to extend this if we want to fetch from Supabase)
        # For now, we'll use a placeholder since we don't have direct auth table access
        email = f"user_{profile.id}@example.com"  # TODO: Fetch from auth table or Supabase

        results.append(
            AdminUserSummary(
                id=profile.id,
                email=email,
                role=profile.role,
                is_admin=profile.is_admin,
                mascot_health=profile.mascot_health,
                current_streak=current_streak,
                longest_streak=profile.longest_streak,
                total_sessions=total_sessions or 0,
                last_checkin_date=profile.last_checkin_date,
                created_at=profile.created_at,
            )
        )

    return results


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def get_user_detail(user_id: uuid.UUID, admin: Auth, db: DB) -> AdminUserDetail:
    """Get detailed user information."""
    profile = db.get(UserProfile, user_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Get health record
    health_record = db.execute(
        select(HealthRecord).where(HealthRecord.user_id == user_id)
    ).scalar_one_or_none()

    # Get recent sessions
    recent_sessions_raw = db.execute(
        select(CheckupSession)
        .where(CheckupSession.user_id == user_id)
        .order_by(CheckupSession.started_at.desc())
        .limit(10)
    ).scalars().all()

    recent_sessions = [
        RecentSession(
            id=s.id,
            start_time=s.started_at,
            end_time=s.completed_at,
            status=s.status.value,
            brownie_points=s.brownie_points,
        )
        for s in recent_sessions_raw
    ]

    # Get pending actions
    pending_actions_raw = db.execute(
        select(PendingAction)
        .where(
            PendingAction.user_id == user_id,
            PendingAction.status == ActionStatus.pending,
        )
        .order_by(PendingAction.created_at.desc())
    ).scalars().all()

    pending_actions = [
        PendingActionRead(
            id=a.id,
            user_id=a.user_id,
            action_type=a.action_type,
            action_data=a.action_data,
            message=a.message,
            scheduled_for=a.scheduled_for,
            status=a.status,
            created_by=a.created_by,
            created_at=a.created_at,
            completed_at=a.completed_at,
        )
        for a in pending_actions_raw
    ]

    # Compute current streak
    current_streak = _compute_streak(db, str(user_id))

    # Get email (placeholder)
    email = f"user_{user_id}@example.com"  # TODO: Fetch from auth

    return AdminUserDetail(
        id=profile.id,
        email=email,
        role=profile.role,
        is_admin=profile.is_admin,
        first_name=profile.first_name,
        last_name=profile.last_name,
        phone_number=profile.phone_number,
        emergency_contact_name=profile.emergency_contact_name,
        emergency_contact_phone=profile.emergency_contact_phone,
        mascot_health=profile.mascot_health,
        current_streak=current_streak,
        longest_streak=profile.longest_streak,
        last_checkin_date=profile.last_checkin_date,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
        health_record=health_record.data if health_record else None,
        recent_sessions=recent_sessions,
        pending_actions=pending_actions,
    )


@router.patch("/users/{user_id}", response_model=dict)
def update_user(
    user_id: uuid.UUID,
    admin: Auth,
    db: DB,
    payload: AdminUpdateUser,
) -> dict:
    """Immediate user updates (mascot health, brownie points)."""
    profile = db.get(UserProfile, user_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent admins from modifying other admins
    if profile.is_admin and str(profile.id) != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify other admin accounts",
        )

    old_values = {}
    new_values = {}

    # Update mascot health
    if payload.mascot_health is not None:
        old_values["mascot_health"] = profile.mascot_health
        profile.mascot_health = max(0, min(100, payload.mascot_health))
        new_values["mascot_health"] = profile.mascot_health

    # Update brownie points (implementation depends on how brownie points are stored)
    # For now, we'll assume it's just logged as an adjustment
    if payload.brownie_points is not None:
        old_values["brownie_points_adjustment"] = 0
        new_values["brownie_points_adjustment"] = payload.brownie_points

    db.commit()
    db.refresh(profile)

    # Log audit
    _log_audit(
        db,
        admin.id,
        "update_user",
        str(user_id),
        old_values,
        new_values,
    )
    db.commit()

    return {"message": "User updated successfully", "updated_fields": list(new_values.keys())}


@router.post("/users/{user_id}/sessions/{session_id}/cancel", response_model=dict)
def cancel_session(
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    admin: Auth,
    db: DB,
) -> dict:
    """Cancel a checkup session."""
    session = db.get(CheckupSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if session.status == SessionStatus.cancelled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session already cancelled",
        )

    old_status = session.status
    session.status = SessionStatus.cancelled
    db.commit()

    # Log audit
    _log_audit(
        db,
        admin.id,
        "cancel_session",
        str(user_id),
        {"session_id": str(session_id), "old_status": old_status.value},
        {"status": SessionStatus.cancelled.value},
    )
    db.commit()

    return {"message": "Session cancelled successfully"}


# ── Deferred Actions Endpoints ───────────────────────────────────────────────


@router.post("/actions", response_model=PendingActionRead, status_code=status.HTTP_201_CREATED)
def schedule_action(admin: Auth, db: DB, payload: ScheduleActionRequest) -> PendingActionRead:
    """Schedule a deferred action for a user."""
    # Verify target user exists
    target_profile = db.get(UserProfile, payload.user_id)
    if not target_profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found")

    action = PendingAction(
        user_id=payload.user_id,
        action_type=payload.action_type,
        action_data=payload.action_data,
        message=payload.message,
        scheduled_for=payload.scheduled_for,
        status=ActionStatus.pending,
        created_by=uuid.UUID(admin.id),
    )
    db.add(action)
    db.commit()
    db.refresh(action)

    # Log audit
    _log_audit(
        db,
        admin.id,
        "schedule_action",
        str(payload.user_id),
        None,
        {
            "action_id": str(action.id),
            "action_type": payload.action_type.value,
            "scheduled_for": payload.scheduled_for.isoformat() if payload.scheduled_for else None,
        },
    )
    db.commit()

    return PendingActionRead(
        id=action.id,
        user_id=action.user_id,
        action_type=action.action_type,
        action_data=action.action_data,
        message=action.message,
        scheduled_for=action.scheduled_for,
        status=action.status,
        created_by=action.created_by,
        created_at=action.created_at,
        completed_at=action.completed_at,
    )


@router.get("/actions", response_model=list[PendingActionRead])
def list_actions(
    admin: Auth,
    db: DB,
    status_filter: ActionStatus | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[PendingActionRead]:
    """List pending/completed actions."""
    stmt = select(PendingAction).order_by(PendingAction.created_at.desc())

    if status_filter:
        stmt = stmt.where(PendingAction.status == status_filter)

    stmt = stmt.limit(limit).offset(offset)

    actions = db.execute(stmt).scalars().all()

    return [
        PendingActionRead(
            id=a.id,
            user_id=a.user_id,
            action_type=a.action_type,
            action_data=a.action_data,
            message=a.message,
            scheduled_for=a.scheduled_for,
            status=a.status,
            created_by=a.created_by,
            created_at=a.created_at,
            completed_at=a.completed_at,
        )
        for a in actions
    ]


@router.delete("/actions/{action_id}", response_model=dict)
def cancel_action(action_id: uuid.UUID, admin: Auth, db: DB) -> dict:
    """Cancel a pending action."""
    action = db.get(PendingAction, action_id)
    if not action:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")

    if action.status != ActionStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only cancel pending actions",
        )

    action.status = ActionStatus.cancelled
    db.commit()

    # Log audit
    _log_audit(
        db,
        admin.id,
        "cancel_action",
        str(action.user_id),
        {"action_id": str(action_id), "old_status": "pending"},
        {"status": "cancelled"},
    )
    db.commit()

    return {"message": "Action cancelled successfully"}


# ── Statistics Endpoints ──────────────────────────────────────────────────────


@router.get("/stats", response_model=AdminStatsResponse)
def get_stats(admin: Auth, db: DB) -> AdminStatsResponse:
    """Get platform-level statistics."""
    total_users = db.execute(select(func.count()).select_from(UserProfile)).scalar()

    total_patients = db.execute(
        select(func.count()).select_from(UserProfile).where(UserProfile.role == UserRole.patient)
    ).scalar()

    total_doctors = db.execute(
        select(func.count()).select_from(UserProfile).where(UserProfile.role == UserRole.doctor)
    ).scalar()

    total_admins = db.execute(
        select(func.count()).select_from(UserProfile).where(UserProfile.is_admin == True)
    ).scalar()

    total_sessions = db.execute(
        select(func.count())
        .select_from(CheckupSession)
        .where(CheckupSession.status == SessionStatus.completed)
    ).scalar()

    # Active sessions today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    active_today = db.execute(
        select(func.count())
        .select_from(CheckupSession)
        .where(
            CheckupSession.status == SessionStatus.completed,
            CheckupSession.completed_at >= today_start,
        )
    ).scalar()

    pending_actions_count = db.execute(
        select(func.count())
        .select_from(PendingAction)
        .where(PendingAction.status == ActionStatus.pending)
    ).scalar()

    return AdminStatsResponse(
        total_users=total_users or 0,
        total_patients=total_patients or 0,
        total_doctors=total_doctors or 0,
        total_admins=total_admins or 0,
        active_sessions_today=active_today or 0,
        total_sessions_all_time=total_sessions or 0,
        pending_actions_count=pending_actions_count or 0,
    )


# ── Audit Log Endpoints ───────────────────────────────────────────────────────


@router.get("/audit-logs", response_model=list[AdminAuditLogRead])
def get_audit_logs(
    admin: Auth,
    db: DB,
    admin_id: uuid.UUID | None = Query(None, description="Filter by admin user ID"),
    target_user_id: uuid.UUID | None = Query(None, description="Filter by target user ID"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[AdminAuditLogRead]:
    """View audit logs with optional filters."""
    stmt = select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc())

    if admin_id:
        stmt = stmt.where(AdminAuditLog.admin_id == admin_id)

    if target_user_id:
        stmt = stmt.where(AdminAuditLog.target_user_id == target_user_id)

    stmt = stmt.limit(limit).offset(offset)

    logs = db.execute(stmt).scalars().all()

    return [
        AdminAuditLogRead(
            id=log.id,
            admin_id=log.admin_id,
            action=log.action,
            target_user_id=log.target_user_id,
            old_values=log.old_values,
            new_values=log.new_values,
            created_at=log.created_at,
        )
        for log in logs
    ]
