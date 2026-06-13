"""Tier 2 documentation: weekly rollup generation for Materna.

Computes numeric trends mathematically and uses GPT-4o (gated) only for the
narrative fields. Safe to run without an OpenAI key (falls back to plain text).
"""

import json
import logging
import uuid
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.demo_config import DEMO_CURRENT_GESTATIONAL_WEEK
from app.models.checkin import CheckupSession, SessionStatus
from app.models.materna import WeeklyRollup
from app.models.user import HealthRecord
from app.services.session_metrics import extract_hr, session_summary_dict

logger = logging.getLogger(__name__)


def _avg(values: list[float]) -> float | None:
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def _trend(current: float | None, prior: float | None, higher_is_worse: bool = False) -> str:
    if current is None or prior is None:
        return "stable"
    delta = current - prior
    if abs(delta) < 0.5:
        return "stable"
    rising = delta > 0
    if higher_is_worse:
        return "worsening" if rising else "improving"
    return "rising" if rising else "falling"


def _sessions_in_range(db: Session, patient_id: uuid.UUID, start: date, end: date) -> list[CheckupSession]:
    start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(end, time.min, tzinfo=timezone.utc)
    return list(
        db.execute(
            select(CheckupSession)
            .where(
                CheckupSession.user_id == patient_id,
                CheckupSession.status == SessionStatus.completed,
                CheckupSession.started_at >= start_dt,
                CheckupSession.started_at < end_dt,
            )
            .order_by(CheckupSession.started_at.asc())
        ).scalars().all()
    )


def _gestational_week(db: Session, patient_id: uuid.UUID) -> int:
    record = db.query(HealthRecord).filter(HealthRecord.user_id == patient_id).first()
    data = (record.data if record else {}) or {}
    return data.get("gestational_week", DEMO_CURRENT_GESTATIONAL_WEEK)


def _generate_narrative(week_summaries: list[dict]) -> dict:
    """GPT-4o narrative. Returns dict with the 4 narrative fields (gated)."""
    settings = get_settings()
    fallback = {
        "week_summary": "Automated weekly summary unavailable (AI not configured). "
        f"{len(week_summaries)} check-ins recorded this week.",
        "clinical_concerns": [],
        "positive_notes": [],
        "recommendation_for_doctor": "Review the weekly vital and symptom trends below.",
    }
    if not settings.openai_api_key or not week_summaries:
        return fallback
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        prompt = (
            "You are a maternal-health documentation assistant. Given these daily "
            "check-in summaries for one pregnant patient over one week, produce a JSON "
            "object with keys: week_summary (string, 2-4 sentences), clinical_concerns "
            "(array of short strings), positive_notes (array of short strings), "
            "recommendation_for_doctor (string). Base everything ONLY on the data.\n\n"
            f"DAILY SUMMARIES:\n{json.dumps(week_summaries, indent=2, default=str)}"
        )
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            response_format={"type": "json_object"},
            max_tokens=800,
        )
        data = json.loads(resp.choices[0].message.content)
        return {
            "week_summary": data.get("week_summary", fallback["week_summary"]),
            "clinical_concerns": data.get("clinical_concerns", []) or [],
            "positive_notes": data.get("positive_notes", []) or [],
            "recommendation_for_doctor": data.get(
                "recommendation_for_doctor", fallback["recommendation_for_doctor"]
            ),
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("Weekly narrative generation failed: %s", exc)
        return fallback


def generate_weekly_rollup(
    db: Session, patient_id: str, week_start_date: date
) -> WeeklyRollup | None:
    """Compute and persist a weekly rollup. Returns None if no sessions that week."""
    pid = patient_id if isinstance(patient_id, uuid.UUID) else uuid.UUID(str(patient_id))
    week_end = week_start_date + timedelta(days=7)
    sessions = _sessions_in_range(db, pid, week_start_date, week_end)
    if not sessions:
        return None

    prior = _sessions_in_range(db, pid, week_start_date - timedelta(days=7), week_start_date)

    summaries = [session_summary_dict(s) for s in sessions]
    hr_avg = _avg([extract_hr(s) for s in sessions])
    prior_hr_avg = _avg([extract_hr(s) for s in prior])
    sleep_avg = _avg([(s.watch_data or {}).get("sleep_hours_last_night") for s in sessions])
    prior_sleep_avg = _avg([(s.watch_data or {}).get("sleep_hours_last_night") for s in prior])
    hrv_avg = _avg([(s.watch_data or {}).get("hrv_sdnn_ms") for s in sessions])

    days_checked_in = len({(s.completed_at or s.started_at).date() for s in sessions})

    symptom_counter: Counter = Counter()
    for s in sessions:
        for flag in (s.symptom_flags or []):
            symptom_counter[flag] += 1

    mood_labels = [s.mood_label for s in sessions if s.mood_label]
    mood_trend = Counter(mood_labels).most_common(1)[0][0] if mood_labels else "unknown"

    edinburgh = [s.edinburgh_score for s in sessions if s.edinburgh_score is not None]
    prior_edinburgh = [s.edinburgh_score for s in prior if s.edinburgh_score is not None]
    ppd_now = _avg([float(e) for e in edinburgh])
    ppd_prior = _avg([float(e) for e in prior_edinburgh])
    ppd_risk_trend = _trend(ppd_now, ppd_prior, higher_is_worse=True)
    if ppd_now is not None:
        ppd_risk_trend = f"{ppd_risk_trend} (avg Edinburgh {ppd_now}/30)"

    narrative = _generate_narrative(summaries)

    # Upsert: replace any existing rollup for this patient+week.
    existing = db.execute(
        select(WeeklyRollup).where(
            WeeklyRollup.patient_id == pid,
            WeeklyRollup.week_start_date == week_start_date,
        )
    ).scalar_one_or_none()
    if existing:
        db.delete(existing)
        db.flush()

    rollup = WeeklyRollup(
        patient_id=pid,
        week_start_date=week_start_date,
        gestational_week=_gestational_week(db, pid),
        days_checked_in=days_checked_in,
        hr_avg=hr_avg,
        hr_trend=_trend(hr_avg, prior_hr_avg, higher_is_worse=True),
        hr_change_from_prior_week=(
            round(hr_avg - prior_hr_avg, 1) if hr_avg and prior_hr_avg else None
        ),
        sleep_avg_hours=sleep_avg,
        sleep_trend=_trend(sleep_avg, prior_sleep_avg),
        hrv_avg=hrv_avg,
        symptom_frequency=dict(symptom_counter),
        mood_trend=mood_trend,
        ppd_risk_trend=ppd_risk_trend,
        week_summary=narrative["week_summary"],
        clinical_concerns=narrative["clinical_concerns"],
        positive_notes=narrative["positive_notes"],
        recommendation_for_doctor=narrative["recommendation_for_doctor"],
    )
    db.add(rollup)
    db.commit()
    db.refresh(rollup)
    return rollup


def monday_of(d: date) -> date:
    """Return the Monday on or before the given date (week start)."""
    return d - timedelta(days=d.weekday())
