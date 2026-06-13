"""Single source of truth for hardcoded Materna demo values.

Everything here is demo-only. Change these to retarget the demo (recipient email,
emergency phone, the demo patient identity used by the seed script).
"""

# Everyone who receives the daily check-in health report after every session.
# Add family members / demo viewers here — they all get the same formatted report.
DEMO_REPORT_RECIPIENTS = [
    "quachphuwork@gmail.com",
    "thienphu.quach01@student.csulb.edu",
]

# Legacy single-value alias (used by email_report.py default fallback).
DEMO_REPORT_RECIPIENT_EMAIL = DEMO_REPORT_RECIPIENTS[0]

# The demo patient's display name used in narration/summaries when the profile
# has no name set. Real profile name takes precedence when available.
DEMO_PATIENT_NAME = "Sarah"

# Demo patient identity used by the seed script and login.
DEMO_PATIENT_EMAIL = "quachphuwork@gmail.com"

# Late-pregnancy gestational week for the "current" demo state.
DEMO_CURRENT_GESTATIONAL_WEEK = 35
DEMO_DUE_DATE = "2026-07-25"

# Session length (seconds) for the demo rPPG + voice check-in.
DEMO_SESSION_SECONDS = 45
