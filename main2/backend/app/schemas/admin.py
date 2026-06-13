from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.admin import ActionStatus, ActionType
from app.models.user import UserRole


class AdminUserSummary(BaseModel):
    """Consolidated user data for admin list view."""

    id: UUID
    email: str
    role: UserRole | None
    is_admin: bool
    mascot_health: int
    current_streak: int
    longest_streak: int
    total_sessions: int
    last_checkin_date: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RecentSession(BaseModel):
    """Recent session data for admin user detail view."""

    id: UUID
    start_time: datetime
    end_time: datetime | None
    status: str
    brownie_points: float

    model_config = {"from_attributes": True}


class AdminUserDetail(BaseModel):
    """Detailed user view for admin."""

    id: UUID
    email: str
    role: UserRole | None
    is_admin: bool
    first_name: str | None
    last_name: str | None
    phone_number: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    mascot_health: int
    current_streak: int
    longest_streak: int
    last_checkin_date: datetime | None
    created_at: datetime
    updated_at: datetime
    health_record: dict[str, Any] | None
    recent_sessions: list[RecentSession]
    pending_actions: list["PendingActionRead"]

    model_config = {"from_attributes": True}


class AdminUpdateUser(BaseModel):
    """Request payload for immediate user updates."""

    mascot_health: int | None = Field(None, ge=0, le=100)
    brownie_points: float | None = None


class ScheduleActionRequest(BaseModel):
    """Request payload for scheduling deferred actions."""

    user_id: UUID
    action_type: ActionType
    action_data: dict[str, Any] = Field(default_factory=dict)
    message: str | None = None
    scheduled_for: datetime | None = None


class PendingActionRead(BaseModel):
    """Response schema for pending actions."""

    id: UUID
    user_id: UUID
    action_type: ActionType
    action_data: dict[str, Any]
    message: str | None
    scheduled_for: datetime | None
    status: ActionStatus
    created_by: UUID
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class AdminAuditLogRead(BaseModel):
    """Response schema for audit logs."""

    id: UUID
    admin_id: UUID
    action: str
    target_user_id: UUID | None
    old_values: dict[str, Any] | None
    new_values: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminStatsResponse(BaseModel):
    """Platform-level statistics for admin dashboard."""

    total_users: int
    total_patients: int
    total_doctors: int
    total_admins: int
    active_sessions_today: int
    total_sessions_all_time: int
    pending_actions_count: int
