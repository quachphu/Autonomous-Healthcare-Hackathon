"""Tier 3 documentation: full doctor PDF report for Materna.

Uses reportlab (pure-Python, no native deps) instead of WeasyPrint, which can't
load its native pango/cairo libraries on this machine. GPT-4o generates the
clinical summary section (gated); everything else is rendered from DB data.
"""

import io
import logging
import uuid
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.demo_config import (
    DEMO_CURRENT_GESTATIONAL_WEEK,
    DEMO_DUE_DATE,
    DEMO_PATIENT_NAME,
)
from app.models.checkin import CheckupSession, SessionStatus
from app.models.materna import WeeklyRollup
from app.models.user import HealthRecord, UserProfile
from app.services.session_metrics import extract_hr, session_summary_dict

logger = logging.getLogger(__name__)

_NAVY = colors.HexColor("#1e2944")
_BLUE = colors.HexColor("#3a5299")
_LIGHT = colors.HexColor("#f3f4f6")

CLINICAL_SUMMARY_PROMPT = """
You are a clinical documentation assistant for a maternal health monitoring platform.

Given the following data about a pregnant patient - {patient_name}, {gestational_week} weeks,
due {due_date} - write a structured clinical summary for her OB/GYN physician.

DATA:
{all_sessions_summary}

{all_weekly_rollups_summary}

Write the following sections (use the exact headings, plain text, no markdown):
1. CARDIOVASCULAR
2. RESPIRATORY
3. EDEMA
4. PSYCHOLOGICAL
5. NUTRITION & HYDRATION
6. FETAL MOVEMENT
7. RECOMMENDED ASSESSMENT PRIORITIES

Be clinical but readable. This is strictly a summary of patient-reported symptoms and
camera-estimated vitals. Do NOT add disclaimers.
"""


def _styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle("MTitle", parent=base["Title"], textColor=_NAVY, fontSize=22))
    base.add(ParagraphStyle("MH2", parent=base["Heading2"], textColor=_BLUE, fontSize=13,
                            spaceBefore=14, spaceAfter=6))
    base.add(ParagraphStyle("MBody", parent=base["BodyText"], fontSize=10, leading=14,
                            textColor=_NAVY))
    base.add(ParagraphStyle("MSmall", parent=base["BodyText"], fontSize=8,
                            textColor=colors.HexColor("#6b7280")))
    return base


def _patient_facts(db: Session, pid: uuid.UUID) -> tuple[str, int, str]:
    profile = db.get(UserProfile, pid)
    record = db.query(HealthRecord).filter(HealthRecord.user_id == pid).first()
    data = (record.data if record else {}) or {}
    name = (profile.first_name if profile and profile.first_name else DEMO_PATIENT_NAME)
    if profile and profile.first_name and profile.last_name:
        name = f"{profile.first_name} {profile.last_name}"
    week = data.get("gestational_week", DEMO_CURRENT_GESTATIONAL_WEEK)
    due = data.get("due_date", DEMO_DUE_DATE)
    return name, week, due


def _clinical_summary(name, week, due, sessions, rollups) -> str:
    settings = get_settings()
    if not settings.openai_api_key:
        return ("Clinical summary generation is unavailable (AI not configured). "
                "Please review the vital and symptom tables above.")
    try:
        from openai import OpenAI

        sessions_text = "\n".join(
            f"- {d['date']}: HR {d['hr_bpm']}, sleep {d['sleep_hours']}h, mood {d['mood_label']}, "
            f"Edinburgh {d['edinburgh_score']}, symptoms {d['symptom_flags']}. {d['plain_summary']}"
            for d in (session_summary_dict(s) for s in sessions)
        )
        rollups_text = "\n".join(
            f"- Week of {r.week_start_date}: {r.week_summary} Concerns: {r.clinical_concerns}"
            for r in rollups
        )
        prompt = CLINICAL_SUMMARY_PROMPT.format(
            patient_name=name,
            gestational_week=week,
            due_date=due,
            all_sessions_summary="SESSIONS:\n" + (sessions_text or "none"),
            all_weekly_rollups_summary="WEEKLY ROLLUPS:\n" + (rollups_text or "none"),
        )
        client = OpenAI(api_key=settings.openai_api_key)
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1200,
        )
        return resp.choices[0].message.content or ""
    except Exception as exc:  # noqa: BLE001
        logger.error("Clinical summary generation failed: %s", exc)
        return "Clinical summary could not be generated at this time."


def generate_full_pdf(db: Session, patient_id: str) -> bytes:
    pid = patient_id if isinstance(patient_id, uuid.UUID) else uuid.UUID(str(patient_id))
    name, week, due = _patient_facts(db, pid)

    sessions = list(
        db.execute(
            select(CheckupSession)
            .where(CheckupSession.user_id == pid, CheckupSession.status == SessionStatus.completed)
            .order_by(CheckupSession.started_at.asc())
        ).scalars().all()
    )
    rollups = list(
        db.execute(
            select(WeeklyRollup)
            .where(WeeklyRollup.patient_id == pid)
            .order_by(WeeklyRollup.week_start_date.asc())
        ).scalars().all()
    )

    st = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter, topMargin=0.7 * inch, bottomMargin=0.7 * inch,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
        title=f"Materna Report — {name}",
    )
    flow = []

    # 1. Cover
    flow.append(Paragraph("Materna AI — Maternal Health Report", st["MTitle"]))
    flow.append(Spacer(1, 8))
    summaries = [session_summary_dict(s) for s in sessions]
    dates = [d["date_iso"] for d in summaries if d["date_iso"]]
    period = f"{dates[0]} → {dates[-1]}" if dates else "No sessions recorded"
    distinct_days = len({d for d in dates})
    cover = (
        f"<b>Patient:</b> {name}<br/><b>Gestational week:</b> {week}<br/>"
        f"<b>Due date:</b> {due}<br/><b>Report date:</b> {datetime.now():%B %d, %Y}<br/>"
        f"<b>Period covered:</b> {period}<br/>"
        f"<b>Check-ins recorded:</b> {len(sessions)} ({distinct_days} distinct days)"
    )
    flow.append(Paragraph(cover, st["MBody"]))

    # 2. Current alerts (last 7 sessions with urgency != normal)
    alerts = [s for s in sessions[-7:] if (s.urgency_level or "normal") != "normal"]
    if alerts:
        flow.append(Paragraph("Current Alerts", st["MH2"]))
        for s in alerts:
            d = session_summary_dict(s)
            flow.append(Paragraph(
                f"<b>{d['date']} — {d['urgency_level'].upper()}:</b> "
                f"{', '.join(d['symptom_flags']) or 'see summary'}. {d['plain_summary']}",
                st["MBody"]))

    # 3. Vital signs over time (per weekly rollup)
    flow.append(Paragraph("Vital Signs Over Time", st["MH2"]))
    if rollups:
        vital_rows = [["Week of", "HR avg", "Sleep avg", "HRV avg", "Status"]]
        for r in rollups:
            vital_rows.append([
                str(r.week_start_date), str(r.hr_avg or "—"),
                str(r.sleep_avg_hours or "—"), str(r.hrv_avg or "—"),
                (r.hr_trend or "stable"),
            ])
        flow.append(_table(vital_rows))
    else:
        flow.append(Paragraph("No weekly rollups generated yet.", st["MBody"]))

    # 4. Symptom log timeline
    flow.append(Paragraph("Symptom Log Timeline", st["MH2"]))
    symptom_first: dict[str, str] = {}
    symptom_total: dict[str, int] = {}
    recent_days = {d["date_iso"] for d in summaries[-7:]}
    symptom_recent: dict[str, int] = {}
    for d in summaries:
        for f in d["symptom_flags"]:
            symptom_first.setdefault(f, d["date_iso"] or "—")
            symptom_total[f] = symptom_total.get(f, 0) + 1
            if d["date_iso"] in recent_days:
                symptom_recent[f] = symptom_recent.get(f, 0) + 1
    if symptom_total:
        rows = [["Symptom", "First reported", "Last 7 days", "Total days"]]
        for f in sorted(symptom_total, key=lambda x: -symptom_total[x]):
            rows.append([f.replace("_", " "), symptom_first[f],
                         str(symptom_recent.get(f, 0)), str(symptom_total[f])])
        flow.append(_table(rows))
    else:
        flow.append(Paragraph("No symptoms reported in the monitoring period.", st["MBody"]))

    # 5. Psychological wellness (Edinburgh per week)
    flow.append(Paragraph("Psychological Wellness (Edinburgh PPD)", st["MH2"]))
    if rollups:
        rows = [["Week of", "PPD risk trend", "Mood trend"]]
        for r in rollups:
            rows.append([str(r.week_start_date), r.ppd_risk_trend or "—", r.mood_trend or "—"])
        flow.append(_table(rows))
    else:
        flow.append(Paragraph("Not enough data for psychological trend.", st["MBody"]))

    # 6. Notable patient quotes (one per week)
    quotes = [(session_summary_dict(s)["date"], s.patient_quote)
              for s in sessions if s.patient_quote]
    if quotes:
        flow.append(Paragraph("Notable Patient Quotes", st["MH2"]))
        for d, q in quotes[-8:]:
            flow.append(Paragraph(f'<i>"{q}"</i> — {d}', st["MBody"]))

    # 7. Weekly summaries
    if rollups:
        flow.append(Paragraph("Weekly Summaries", st["MH2"]))
        for r in rollups:
            flow.append(Paragraph(f"<b>Week of {r.week_start_date}:</b> {r.week_summary}", st["MBody"]))
            flow.append(Spacer(1, 4))

    # 8. Clinical summary for physician (GPT-4o)
    flow.append(Paragraph("Clinical Summary for Physician", st["MH2"]))
    clinical = _clinical_summary(name, week, due, sessions, rollups)
    for block in clinical.split("\n"):
        if block.strip():
            flow.append(Paragraph(block.replace("&", "&amp;"), st["MBody"]))

    # 9. Footer
    flow.append(Spacer(1, 16))
    flow.append(Paragraph(
        "Materna AI · camera-based wellness signals · not a medical diagnosis.",
        st["MSmall"]))

    doc.build(flow)
    return buf.getvalue()


def _table(rows: list[list[str]]) -> Table:
    t = Table(rows, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t
