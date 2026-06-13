"""Daily check-in HTML email report for Materna.

Sends a Gmail-friendly (inline-styled) report after each completed session.
This implements its own SMTP send because the repo's EmailService only sends
plain text and has its sendmail call commented out.
"""

import logging
import smtplib
import uuid
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings
from app.db.session import SessionLocal
from app.demo_config import (
    DEMO_CURRENT_GESTATIONAL_WEEK,
    DEMO_PATIENT_NAME,
    DEMO_REPORT_RECIPIENT_EMAIL,
)
from app.models.checkin import CheckupSession
from app.models.user import HealthRecord, UserProfile
from app.services.session_metrics import (
    extract_hr,
    hr_7day_avg,
    recent_completed_sessions,
    session_summary_dict,
)

logger = logging.getLogger(__name__)

# Canonical symptom chips shown in every report (label, flag key, is_urgent).
_SYMPTOM_CHIPS = [
    ("Chest pain", "chest_pain", True),
    ("Shortness of breath", "shortness_of_breath", True),
    ("Headache", "severe_headache", True),
    ("Vision changes", "vision_changes", True),
    ("Foot swelling", "foot_swelling", False),
    ("Reduced appetite", "reduced_appetite", False),
    ("Fetal movement concern", "reduced_fetal_movement", True),
    ("Mood concern", "mood_concern", False),
]

_URGENCY_BANNER = {
    "emergency": ("#fee2e2", "#b91c1c", "EMERGENCY — immediate attention recommended"),
    "urgent": ("#fee2e2", "#b91c1c", "URGENT — please review promptly"),
    "monitor": ("#fef3c7", "#92400e", "MONITOR — flagged symptoms to watch"),
}


def _esc(text) -> str:
    s = "" if text is None else str(text)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _patient_name(profile: UserProfile | None) -> str:
    if profile and profile.first_name:
        return profile.first_name
    return DEMO_PATIENT_NAME


def _gestational_week(record: HealthRecord | None) -> int:
    data = (record.data if record else {}) or {}
    return data.get("gestational_week", DEMO_CURRENT_GESTATIONAL_WEEK)


def _chip(label: str, state: str) -> str:
    colors = {
        "absent": ("#dcfce7", "#166534"),
        "present": ("#fef3c7", "#92400e"),
        "urgent": ("#fee2e2", "#b91c1c"),
    }
    bg, fg = colors[state]
    return (
        f'<span style="display:inline-block;margin:3px;padding:5px 10px;border-radius:14px;'
        f'background:{bg};color:{fg};font-size:12px;font-weight:600;">{_esc(label)}</span>'
    )


def _build_html(
    session: CheckupSession,
    profile: UserProfile | None,
    record: HealthRecord | None,
    recent: list[CheckupSession],
    hr_avg: float | None,
) -> str:
    name = _patient_name(profile)
    week = _gestational_week(record)
    today = datetime.now().strftime("%A, %B %-d, %Y")
    summary = session_summary_dict(session)
    watch = session.watch_data or {}
    hr = extract_hr(session)
    urgency = (session.urgency_level or "normal").lower()
    flags = set(session.symptom_flags or [])

    # 1. Header
    html = f"""<div style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#1e2944;">
  <div style="background:#3a5299;color:#ffffff;padding:20px 24px;border-radius:10px 10px 0 0;">
    <div style="font-size:20px;font-weight:700;">Materna AI · Daily Health Report</div>
    <div style="font-size:14px;opacity:0.9;margin-top:4px;">{_esc(name)} · {week} weeks · {today}</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 10px 10px;">"""

    # 2. Alert banner
    if urgency in _URGENCY_BANNER:
        bg, fg, label = _URGENCY_BANNER[urgency]
        flag_text = ", ".join(sorted(f.replace("_", " ") for f in flags)) or "see summary"
        html += f"""
    <div style="background:{bg};color:{fg};padding:12px 16px;border-radius:8px;margin-bottom:20px;font-weight:600;">
      ⚠ {label}<div style="font-weight:400;font-size:13px;margin-top:4px;">Flags: {_esc(flag_text)}</div>
    </div>"""

    # 3. Vitals table (rPPG + Watch simulation)
    stats = session.stats or {}
    signal_quality = stats.get("signal_quality") or stats.get("signal_quality_overall") or "—"
    wellness = stats.get("wellness_score") or stats.get("wellness") or "—"
    html += f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border-collapse:collapse;">
      <tr>
        <td width="50%" valign="top" style="padding-right:8px;">
          <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
            <div style="font-size:12px;font-weight:700;color:#3a5299;margin-bottom:8px;">rPPG VITALS (camera)</div>
            <div style="font-size:13px;line-height:1.8;">
              Heart rate: <b>{_esc(round(hr) if hr else '—')} bpm</b><br>
              Signal quality: <b>{_esc(signal_quality)}</b><br>
              Wellness score: <b>{_esc(wellness)}</b>
            </div>
          </div>
        </td>
        <td width="50%" valign="top" style="padding-left:8px;">
          <div style="border:1px solid #fcd34d;border-radius:8px;padding:14px;background:#fffbeb;">
            <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:8px;">WATCH · Simulated · Demo Only</div>
            <div style="font-size:13px;line-height:1.8;">
              HRV (SDNN): <b>{_esc(watch.get('hrv_sdnn_ms', '—'))} ms</b><br>
              SpO₂: <b>{_esc(watch.get('spo2_pct', '—'))}%</b><br>
              Sleep: <b>{_esc(watch.get('sleep_hours_last_night', '—'))} h</b><br>
              Respiratory rate: <b>{_esc(watch.get('respiratory_rate_bpm', '—'))} /min</b>
            </div>
          </div>
        </td>
      </tr>
    </table>"""

    # 4. Conversation summary
    html += f"""
    <div style="font-size:13px;font-weight:700;color:#3a5299;margin-bottom:6px;">CONVERSATION SUMMARY</div>
    <div style="background:#f3f4f6;border-radius:8px;padding:14px;font-size:13px;line-height:1.6;margin-bottom:20px;">
      {_esc(summary['plain_summary'] or 'No summary recorded for this session.')}
    </div>"""

    # 5. Symptom flags chips
    chips = ""
    for label, key, is_urgent in _SYMPTOM_CHIPS:
        if key in flags:
            chips += _chip(label, "urgent" if is_urgent else "present")
        else:
            chips += _chip(label, "absent")
    html += f"""
    <div style="font-size:13px;font-weight:700;color:#3a5299;margin-bottom:8px;">SYMPTOM FLAGS</div>
    <div style="margin-bottom:20px;">{chips}</div>"""

    # 6. Hospital-ready clinical note
    if summary["hospital_note"]:
        html += f"""
    <div style="font-size:13px;font-weight:700;color:#3a5299;margin-bottom:6px;">HOSPITAL-READY NOTE</div>
    <div style="border:2px solid #3a5299;border-radius:8px;padding:14px;font-size:13px;line-height:1.6;margin-bottom:8px;">
      {_esc(summary['hospital_note'])}
    </div>
    <div style="font-size:11px;color:#6b7280;margin-bottom:20px;">Bring this to your next appointment.</div>"""

    # 7. 7-day trend table
    rows = ""
    for s in reversed(recent):  # oldest first
        d = session_summary_dict(s)
        top_symptom = (d["symptom_flags"][0].replace("_", " ") if d["symptom_flags"] else "—")
        rows += f"""
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">{_esc(d['date'])}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">{_esc(round(d['hr_bpm']) if d['hr_bpm'] else '—')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">{_esc(d['sleep_hours'] if d['sleep_hours'] is not None else '—')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">{_esc(d['mood_label'] or '—')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">{_esc(top_symptom)}</td>
      </tr>"""
    if rows:
        html += f"""
    <div style="font-size:13px;font-weight:700;color:#3a5299;margin-bottom:6px;">7-DAY TREND</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;margin-bottom:20px;">
      <tr style="background:#f3f4f6;text-align:left;">
        <th style="padding:6px 10px;">Date</th><th style="padding:6px 10px;">HR</th>
        <th style="padding:6px 10px;">Sleep</th><th style="padding:6px 10px;">Mood</th>
        <th style="padding:6px 10px;">Top symptom</th>
      </tr>{rows}
    </table>"""

    # 8. Footer
    html += """
    <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:11px;color:#6b7280;line-height:1.5;">
      Generated by Materna AI · Not a medical diagnosis · Camera-based wellness signals.<br>
      If this is an emergency, call 911.
    </div>
  </div>
</div>"""
    return html


def _send_html_email(to_email: str, subject: str, html: str) -> tuple[bool, str | None]:
    settings = get_settings()
    if not (settings.smtp_from_email and settings.smtp_from_password):
        logger.warning("SMTP not configured — skipping report email to %s", to_email)
        return False, "SMTP not configured"
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from_email
        msg["To"] = to_email
        msg.attach(MIMEText("Your Materna daily report is attached as HTML.", "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_from_email, settings.smtp_from_password)
            server.sendmail(settings.smtp_from_email, [to_email], msg.as_string())
        logger.info("Materna report email sent to %s", to_email)
        return True, None
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to send Materna report email to %s: %s", to_email, exc)
        return False, str(exc)


def send_html_email(to_email: str, subject: str, html: str) -> tuple[bool, str | None]:
    """Public HTML email sender (credential-gated). Used for appointment notices."""
    return _send_html_email(to_email, subject, html)


def send_daily_report_email(
    session_id: str, recipient_email: str | None = None
) -> tuple[bool, str | None]:
    """Background-task entry point. Loads everything fresh and sends the report.

    Safe to call even if SMTP is unconfigured (logs + no-op). Sets session.email_sent
    on success.
    """
    recipient = recipient_email or DEMO_REPORT_RECIPIENT_EMAIL
    db = SessionLocal()
    try:
        session = db.get(CheckupSession, uuid.UUID(str(session_id)))
        if session is None:
            return False, "session not found"
        profile = db.get(UserProfile, session.user_id)
        record = (
            db.query(HealthRecord)
            .filter(HealthRecord.user_id == session.user_id)
            .first()
        )
        recent = recent_completed_sessions(db, session.user_id, n=7)
        hr_avg = hr_7day_avg(db, session.user_id)

        name = _patient_name(profile)
        subject = f"🤱 {name}'s Daily Check-In Report — {datetime.now():%b %-d} | Materna AI"
        html = _build_html(session, profile, record, recent, hr_avg)

        ok, err = _send_html_email(recipient, subject, html)
        if ok:
            session.email_sent = True
            db.commit()
        return ok, err
    except Exception as exc:  # noqa: BLE001
        logger.error("send_daily_report_email failed: %s", exc)
        return False, str(exc)
    finally:
        db.close()


