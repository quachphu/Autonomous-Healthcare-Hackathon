"""Timezone-aware email reminder service: 8 AM daily checkin + 12 PM streak alert."""
import logging
from datetime import date, datetime, time

import pytz
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.user import User, UserProfile, UserRole
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)

DAILY_REMINDER_TIME = time(hour=8, minute=0)
DAILY_REMINDER_WINDOW_END = time(hour=8, minute=15)

STREAK_ALERT_TIME = time(hour=12, minute=0)
STREAK_ALERT_WINDOW_END = time(hour=12, minute=15)


class EmailReminderService:
    def __init__(self, db: Session, settings: Settings, email_service: EmailService) -> None:
        self.db = db
        self.settings = settings
        self.email = email_service

    def check_and_send(self) -> dict:
        if not self.email.is_configured():
            logger.warning("Email not configured — skipping email reminder check")
            return {"sent": 0, "skipped": 0, "failed": 0}

        profiles = self._get_eligible_profiles()
        logger.info("Email reminder check: %d eligible patients", len(profiles))

        sent = skipped = failed = 0
        for profile, user_email in profiles:
            daily = self._maybe_send_daily(profile, user_email)
            streak = self._maybe_send_streak(profile, user_email)
            for result in (daily, streak):
                if result == "sent":
                    sent += 1
                elif result == "failed":
                    failed += 1
                else:
                    skipped += 1

        logger.info("Email reminder check done — sent=%d skipped=%d failed=%d", sent, skipped, failed)
        return {"sent": sent, "skipped": skipped, "failed": failed}

    def _get_eligible_profiles(self) -> list[tuple[UserProfile, str]]:
        rows = self.db.execute(
            select(UserProfile, User.email)
            .join(User, User.id == UserProfile.id)
            .where(UserProfile.role == UserRole.patient)
        ).all()
        return [(profile, email) for profile, email in rows]

    def _maybe_send_daily(self, profile: UserProfile, user_email: str) -> str:
        if not profile.email_daily_reminder_enabled:
            return "skipped"
        today = date.today()
        if profile.last_email_reminder_sent_date == today:
            return "skipped"
        if profile.last_checkin_date == today:
            return "skipped"
        if not self._in_window(profile.timezone, DAILY_REMINDER_TIME, DAILY_REMINDER_WINDOW_END):
            return "skipped"

        ok, err = self.email.send_daily_reminder(user_email, profile.first_name)
        if ok:
            profile.last_email_reminder_sent_date = today
            self.db.commit()
            return "sent"
        logger.error("Daily reminder email failed for user %s: %s", str(profile.id)[:8], err)
        return "failed"

    def _maybe_send_streak(self, profile: UserProfile, user_email: str) -> str:
        if not profile.email_streak_alert_enabled:
            return "skipped"
        today = date.today()
        if profile.last_streak_email_sent_date == today:
            return "skipped"
        if profile.last_checkin_date == today:
            return "skipped"
        if not self._in_window(profile.timezone, STREAK_ALERT_TIME, STREAK_ALERT_WINDOW_END):
            return "skipped"

        ok, err = self.email.send_streak_alert(user_email, profile.first_name)
        if ok:
            profile.last_streak_email_sent_date = today
            self.db.commit()
            return "sent"
        logger.error("Streak alert email failed for user %s: %s", str(profile.id)[:8], err)
        return "failed"

    def _in_window(self, user_timezone: str, start: time, end: time) -> bool:
        try:
            tz = pytz.timezone(user_timezone)
        except pytz.UnknownTimeZoneError:
            tz = pytz.UTC
        now_local = datetime.now(pytz.UTC).astimezone(tz)
        return start <= now_local.time() < end
