"""Seed demo data for the Materna demo.

Creates (idempotently):
  * the demo patient (Sarah) with a health record at ~35 weeks,
  * a demo doctor (Dr. Emily Carter) + an accepted doctor<->patient connection,
  * 49 days (7 weeks) of completed check-in sessions with simulated watch data,
    conversation summaries, mood, and symptom flags that trend over time,
  * weekly rollups for each week in that window (best-effort).

Run from the backend directory:

    .venv/bin/python scripts/seed_demo_data.py

Everything here is demo-only simulated data.
"""

from __future__ import annotations

import random
import sys
import uuid
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

# Make `app` importable when run as a plain script.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bcrypt  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.demo_config import (  # noqa: E402
    DEMO_CURRENT_GESTATIONAL_WEEK,
    DEMO_DUE_DATE,
    DEMO_PATIENT_EMAIL,
    DEMO_PATIENT_NAME,
)
from app.models.checkin import CheckupSession, SessionStatus  # noqa: E402
from app.models.doctor_patient import ConnectionStatus, DoctorPatient  # noqa: E402
from app.models.materna import WeeklyRollup  # noqa: E402
from app.models.user import HealthRecord, User, UserProfile, UserRole  # noqa: E402
from app.services.watch_simulation import simulate_apple_watch_data  # noqa: E402
from app.services.weekly_rollup import generate_weekly_rollup, monday_of  # noqa: E402

DEMO_PATIENT_PASSWORD = "Materna123!"
DEMO_DOCTOR_EMAIL = "dr.carter@materna.demo"
DEMO_DOCTOR_PASSWORD = "Materna123!"

DAYS = 49  # 7 weeks of history

# Minor (non-critical) symptoms that grow more common later in pregnancy.
MINOR_SYMPTOMS = [
    "foot_swelling",
    "back_pain",
    "leg_cramps",
    "fatigue",
    "heartburn",
    "trouble_sleeping",
    "pelvic_pressure",
    "reduced_appetite",
    "shortness_of_breath",  # mild/exertional in this demo
]

MOODS = ["hopeful", "calm", "content", "tired", "anxious", "overwhelmed"]


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _get_or_create_user(db, email: str, password: str) -> User:
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None:
        user = User(id=uuid.uuid4(), email=email, password_hash=_hash(password))
        db.add(user)
        db.flush()
        print(f"  created user {email} (password: {password})")
    else:
        print(f"  using existing user {email}")
    return user


def _ensure_profile(db, user_id, role: UserRole, first: str, last: str, **extra) -> UserProfile:
    profile = db.get(UserProfile, user_id)
    if profile is None:
        profile = UserProfile(id=user_id)
        db.add(profile)
    profile.role = role
    profile.first_name = first
    profile.last_name = last
    for k, v in extra.items():
        setattr(profile, k, v)
    db.flush()
    return profile


def _day_content(days_ago: int, gest_week: int, watch: dict, rng: random.Random) -> dict:
    """Build a plausible daily summary that trends with gestational week."""
    # More symptoms as pregnancy progresses.
    severity = min(3, max(0, (gest_week - 28) // 2))
    n_symptoms = rng.randint(0, severity + 1)
    flags = rng.sample(MINOR_SYMPTOMS, k=min(n_symptoms, len(MINOR_SYMPTOMS)))

    sleep = watch["sleep_hours_last_night"]
    hr = watch["heart_rate_avg_bpm"]

    # Mood skews calmer with better sleep, more anxious with symptoms.
    if sleep >= 7 and len(flags) <= 1:
        mood = rng.choice(["hopeful", "calm", "content"])
        mood_score = rng.randint(62, 82)
        edinburgh = rng.randint(2, 7)
        urgency = "normal"
    elif len(flags) >= 3 or sleep < 5.5:
        mood = rng.choice(["anxious", "overwhelmed", "tired"])
        mood_score = rng.randint(28, 48)
        edinburgh = rng.randint(9, 13)
        urgency = "monitor" if rng.random() < 0.4 else "normal"
    else:
        mood = rng.choice(MOODS)
        mood_score = rng.randint(45, 65)
        edinburgh = rng.randint(5, 10)
        urgency = "normal"

    flag_text = ", ".join(f.replace("_", " ") for f in flags) or "no notable symptoms"
    plain = (
        f"{DEMO_PATIENT_NAME} slept about {sleep}h and is feeling {mood}. "
        f"Reported: {flag_text}. Resting heart rate around {hr} bpm. Baby active."
    )
    clinical = (
        f"GA {gest_week}w. Sleep {sleep}h. HR avg {hr} bpm. Mood: {mood} "
        f"(Edinburgh {edinburgh}/30). Symptoms: {flag_text}. No red-flag findings."
    )
    hospital = f"GA {gest_week}w. {flag_text.capitalize()}. Edinburgh {edinburgh}/30. HR {hr} bpm."
    quote_pool = [
        "I'm tired but okay this morning.",
        "Baby's been kicking a lot, which is reassuring.",
        "My feet are a bit puffy but nothing too bad.",
        "I slept better last night.",
        "I feel a little anxious about the delivery.",
    ]
    return {
        "symptom_flags": flags,
        "mood_label": mood,
        "mood_score": mood_score,
        "edinburgh_score": edinburgh,
        "urgency_level": urgency,
        "plain_summary": plain,
        "clinical_note": clinical,
        "hospital_note": hospital,
        "patient_quote": rng.choice(quote_pool),
    }


def seed() -> None:
    db = SessionLocal()
    try:
        print("Seeding Materna demo data...")

        # ── Patient ───────────────────────────────────────────────────────────
        patient = _get_or_create_user(db, DEMO_PATIENT_EMAIL, DEMO_PATIENT_PASSWORD)
        # Always reset to the known demo password so the printed login works.
        patient.password_hash = _hash(DEMO_PATIENT_PASSWORD)
        _ensure_profile(
            db,
            patient.id,
            UserRole.patient,
            DEMO_PATIENT_NAME,
            "Chen",
            phone_number="+15555550123",
            emergency_contact_name="James Chen",
            emergency_contact_phone="+15555550199",
            mascot_health=85,
            longest_streak=DAYS,
            last_checkin_date=date.today() - timedelta(days=1),  # yesterday — today stays open
        )

        record = (
            db.query(HealthRecord).filter(HealthRecord.user_id == patient.id).first()
        )
        if record is None:
            record = HealthRecord(user_id=patient.id, data={})
            db.add(record)
        record.data = {
            "first_name": DEMO_PATIENT_NAME,
            "gestational_week": DEMO_CURRENT_GESTATIONAL_WEEK,
            "due_date": DEMO_DUE_DATE,
            "risk_factors": "mild gestational hypertension; first pregnancy",
        }
        db.flush()

        # ── Doctor + connection ───────────────────────────────────────────────
        doctor = _get_or_create_user(db, DEMO_DOCTOR_EMAIL, DEMO_DOCTOR_PASSWORD)
        _ensure_profile(db, doctor.id, UserRole.doctor, "Emily", "Carter")

        link = db.execute(
            select(DoctorPatient).where(
                DoctorPatient.doctor_id == doctor.id,
                DoctorPatient.patient_id == patient.id,
            )
        ).scalar_one_or_none()
        if link is None:
            db.add(
                DoctorPatient(
                    doctor_id=doctor.id,
                    patient_id=patient.id,
                    status=ConnectionStatus.accepted,
                    initiator_id=doctor.id,
                )
            )
        else:
            link.status = ConnectionStatus.accepted
        db.flush()

        # ── Wipe + recreate this patient's sessions/rollups ───────────────────
        db.execute(delete(CheckupSession).where(CheckupSession.user_id == patient.id))
        db.execute(delete(WeeklyRollup).where(WeeklyRollup.patient_id == patient.id))
        db.flush()

        today = date.today()
        for days_ago in range(DAYS, 0, -1):  # seed up to yesterday only — today stays open
            day = today - timedelta(days=days_ago)
            gest_week = max(20, DEMO_CURRENT_GESTATIONAL_WEEK - (days_ago // 7))
            day_seed = int(day.strftime("%Y%m%d"))
            rng = random.Random(day_seed)
            watch = simulate_apple_watch_data(gest_week, day_seed=day_seed)
            content = _day_content(days_ago, gest_week, watch, rng)

            ts = datetime.combine(day, time(hour=8, minute=15), tzinfo=timezone.utc)
            hr = watch["heart_rate_avg_bpm"]
            session = CheckupSession(
                user_id=patient.id,
                status=SessionStatus.completed,
                started_at=ts,
                completed_at=ts + timedelta(seconds=30),
                brownie_points=10.0,
                stats={"hr_bpm": hr, "signal_quality": "good", "source": "seed"},
                watch_data=watch,
                email_sent=True,
                **content,
            )
            db.add(session)
        db.commit()
        print(f"  created {DAYS} completed check-in sessions")

        # ── Weekly rollups (best-effort; falls back to text without OpenAI) ────
        weeks = set()
        for days_ago in range(DAYS):
            weeks.add(monday_of(today - timedelta(days=days_ago)))
        made = 0
        for wk in sorted(weeks):
            try:
                if generate_weekly_rollup(db, str(patient.id), wk):
                    made += 1
            except Exception as exc:  # noqa: BLE001
                print(f"  ! rollup for {wk} failed: {exc}")
        print(f"  created {made} weekly rollups")

        print("\nDone. Demo login:")
        print(f"  patient: {DEMO_PATIENT_EMAIL} / {DEMO_PATIENT_PASSWORD}")
        print(f"  doctor:  {DEMO_DOCTOR_EMAIL} / {DEMO_DOCTOR_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
