"""Simulated Apple Watch biometrics for the Materna demo.

IMPORTANT: Everything produced here is demo simulation only. It must never be
presented as real device data. The UI and emails label it "Simulated · Demo Only".
"""

import random
from datetime import datetime


def _sleep_quality_label(avg_hours: float) -> str:
    if avg_hours >= 7:
        return "good"
    elif avg_hours >= 5.5:
        return "fair"
    return "poor"


def simulate_apple_watch_data(
    patient_gestational_week: int = 35,
    day_seed: int | None = None,
) -> dict:
    """Generate plausible simulated Apple Watch biometrics for a late-term patient.

    Values are deterministic per (day, gestational_week) so the same day yields the
    same numbers within a session, but vary realistically across days.

    Args:
        patient_gestational_week: drives baseline HR / HRV / sleep.
        day_seed: optional integer (e.g. 20260613) to pin a specific day. When
            omitted, today's date is used. The seed script passes per-day values
            so historical sessions get varied-but-stable readings.
    """
    if day_seed is None:
        day_seed = int(datetime.now().strftime("%Y%m%d"))
    rng = random.Random(day_seed + patient_gestational_week)

    # Late pregnancy: elevated resting HR, lower HRV, mild sleep disruption.
    base_hr = 78 + (patient_gestational_week - 28) * 0.8
    base_hrv = 52 - (patient_gestational_week - 28) * 1.2
    base_sleep = 7.5 - (patient_gestational_week - 28) * 0.08

    return {
        "source": "Apple Watch (simulated)",
        "is_simulated": True,
        "heart_rate_avg_bpm": round(rng.gauss(base_hr, 4)),
        "hrv_sdnn_ms": max(15, round(rng.gauss(base_hrv, 6))),
        "spo2_pct": round(rng.gauss(97.8, 0.6), 1),
        "respiratory_rate_bpm": round(rng.gauss(16, 1.5)),
        "sleep_hours_last_night": round(max(3.0, rng.gauss(base_sleep, 0.9)), 1),
        "sleep_quality": _sleep_quality_label(base_sleep),
        "resting_hr_bpm": round(rng.gauss(base_hr - 4, 3)),
        "steps_today": rng.randint(400, 2800),  # morning, so low
        "note": "Simulated Apple Watch data — not from a real device. For demo purposes only.",
    }
