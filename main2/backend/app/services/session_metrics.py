"""Shared helpers for reading metrics out of checkup sessions.

These centralize the (slightly messy) reality that rPPG heart rate can live under
several keys inside the ``stats`` JSONB, and that watch metrics live in ``watch_data``.
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.checkin import CheckupSession, SessionStatus

_HR_KEYS = (
    "hr_bpm",
    "heart_rate",
    "estimated_pulse_bpm",
    "consensus_hr_bpm",
    "estimated_pulse",
    "bpm",
)


def extract_hr(session: CheckupSession) -> float | None:
    """Best-effort extraction of a heart-rate value from a session's stats JSONB."""
    stats = session.stats or {}
    for key in _HR_KEYS:
        val = stats.get(key)
        if isinstance(val, (int, float)) and val > 0:
            return float(val)
    # Some rPPG payloads nest stats under a sub-object.
    nested = stats.get("heart_rate_statistics") or {}
    for key in _HR_KEYS + ("consensus_hr_bpm", "mean_window_bpm"):
        val = nested.get(key)
        if isinstance(val, (int, float)) and val > 0:
            return float(val)
    return None


def _to_uuid(value) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def recent_completed_sessions(
    db: Session, patient_id, n: int = 7
) -> list[CheckupSession]:
    """Last ``n`` completed sessions for a patient, newest first."""
    return list(
        db.execute(
            select(CheckupSession)
            .where(
                CheckupSession.user_id == _to_uuid(patient_id),
                CheckupSession.status == SessionStatus.completed,
            )
            .order_by(CheckupSession.completed_at.desc().nullslast(),
                      CheckupSession.started_at.desc())
            .limit(n)
        ).scalars().all()
    )


def hr_7day_avg(db: Session, patient_id) -> float | None:
    """Average HR across the patient's last 7 completed sessions (excludes today's)."""
    sessions = recent_completed_sessions(db, patient_id, n=8)
    hrs = [extract_hr(s) for s in sessions[1:]]  # skip most recent (today)
    hrs = [h for h in hrs if h is not None]
    if not hrs:
        # fall back to all available including most recent
        hrs = [h for h in (extract_hr(s) for s in sessions) if h is not None]
    if not hrs:
        return None
    return round(sum(hrs) / len(hrs), 1)


def _session_date(session: CheckupSession) -> date | None:
    ts = session.completed_at or session.started_at
    return ts.date() if ts else None


def session_summary_dict(session: CheckupSession) -> dict:
    """Lightweight dict used for agent context, emails, and reports."""
    watch = session.watch_data or {}
    d = _session_date(session)
    return {
        "date": d.strftime("%A %b %d") if d else "Unknown date",
        "date_iso": d.isoformat() if d else None,
        "hr_bpm": extract_hr(session),
        "sleep_hours": watch.get("sleep_hours_last_night"),
        "hrv_ms": watch.get("hrv_sdnn_ms"),
        "spo2_pct": watch.get("spo2_pct"),
        "respiratory_rate_bpm": watch.get("respiratory_rate_bpm"),
        "mood_label": session.mood_label,
        "mood_score": session.mood_score,
        "edinburgh_score": session.edinburgh_score,
        "symptom_flags": session.symptom_flags or [],
        "urgency_level": session.urgency_level or "normal",
        "plain_summary": session.plain_summary or "",
        "clinical_note": session.clinical_note or "",
        "hospital_note": session.hospital_note or "",
        "patient_quote": session.patient_quote or "",
        "watch_data": watch,
    }
