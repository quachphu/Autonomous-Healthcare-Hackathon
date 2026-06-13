"""Daily check-in reminder service with timezone-aware scheduling."""
import logging
from datetime import date, datetime, time
from typing import Optional

import pytz
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.user import UserProfile, UserRole
from app.services.twilio_service import TwilioService

logger = logging.getLogger(__name__)

# Reminder sent at 6:00 PM local time
REMINDER_TIME = time(hour=18, minute=0)
# Check window: 6:00 PM - 6:14 PM (15-minute scheduler interval)
REMINDER_WINDOW_END = time(hour=18, minute=15)


class ReminderService:
    """
    Service for checking and sending daily check-in reminders.

    Features:
    - Timezone-aware time checking (user's local time)
    - Duplicate prevention via last_reminder_sent_date
    - Eligibility filtering (patients with phone + SMS enabled)
    - Atomic updates (commit only after successful SMS)
    """

    def __init__(
        self,
        db: Session,
        settings: Settings,
        twilio_service: TwilioService
    ):
        """
        Initialize reminder service.

        Args:
            db: SQLAlchemy database session
            settings: Application settings
            twilio_service: Twilio service for sending SMS
        """
        self.db = db
        self.settings = settings
        self.twilio = twilio_service

    def check_and_send_reminders(self) -> dict:
        """
        Main entry point: check all eligible users and send reminders if needed.

        Called by APScheduler every 15 minutes.

        Returns:
            Summary statistics: {"sent": int, "skipped": int, "failed": int}
        """
        logger.info("Starting reminder check cycle")

        if not self.twilio.is_configured():
            logger.warning("Twilio not configured - skipping reminder check")
            return {"sent": 0, "skipped": 0, "failed": 0}

        # Query eligible users (patients with phone + SMS enabled)
        eligible_users = self._get_eligible_users()
        logger.info(f"Found {len(eligible_users)} eligible users for reminder check")

        sent_count = 0
        skipped_count = 0
        failed_count = 0

        for profile in eligible_users:
            result = self._check_and_send_for_user(profile)

            if result == "sent":
                sent_count += 1
            elif result == "failed":
                failed_count += 1
            else:
                skipped_count += 1

        logger.info(
            f"Reminder check complete - "
            f"Sent: {sent_count}, Skipped: {skipped_count}, Failed: {failed_count}"
        )

        return {
            "sent": sent_count,
            "skipped": skipped_count,
            "failed": failed_count
        }

    def _get_eligible_users(self) -> list[UserProfile]:
        """
        Get all users eligible for reminder checks.

        Eligibility criteria:
        1. User is a patient (not doctor)
        2. User has phone number
        3. SMS reminders enabled

        Returns:
            List of UserProfile objects
        """
        stmt = (
            select(UserProfile)
            .where(UserProfile.role == UserRole.patient)
            .where(UserProfile.phone_number.isnot(None))
            .where(UserProfile.sms_reminders_enabled == True)  # noqa: E712
        )

        result = self.db.execute(stmt)
        return list(result.scalars().all())

    def _check_and_send_for_user(self, profile: UserProfile) -> str:
        """
        Check if user needs reminder and send if eligible.

        Args:
            profile: User profile to check

        Returns:
            "sent" if reminder sent successfully
            "skipped" if reminder not needed
            "failed" if sending failed
        """
        today = date.today()
        user_id_short = str(profile.id)[:8]

        # Skip if reminder already sent today
        if profile.last_reminder_sent_date == today:
            logger.debug(f"User {user_id_short}... - reminder already sent today")
            return "skipped"

        # Skip if check-in already completed today
        if profile.last_checkin_date == today:
            logger.debug(f"User {user_id_short}... - check-in already completed today")
            return "skipped"

        # Skip if not within reminder time window (6:00-6:14 PM local time)
        if not self._is_reminder_time(profile.timezone):
            logger.debug(
                f"User {user_id_short}... - not in reminder time window "
                f"(timezone: {profile.timezone})"
            )
            return "skipped"

        # All checks passed - send reminder
        success, error_msg = self.twilio.send_reminder_sms(
            to_phone=profile.phone_number,
            user_first_name=profile.first_name
        )

        if success:
            # Update last_reminder_sent_date and commit
            profile.last_reminder_sent_date = today
            self.db.commit()
            logger.info(f"User {user_id_short}... - reminder sent successfully")
            return "sent"
        else:
            logger.error(
                f"User {user_id_short}... - failed to send reminder: {error_msg}"
            )
            return "failed"

    def _is_reminder_time(self, user_timezone: str) -> bool:
        """
        Check if current time is within reminder window for user's timezone.

        Reminder window: 6:00 PM - 6:14 PM local time

        Args:
            user_timezone: User's timezone (e.g., "America/Los_Angeles")

        Returns:
            True if current local time is between 6:00 PM and 6:14 PM
        """
        try:
            tz = pytz.timezone(user_timezone)
        except pytz.UnknownTimeZoneError:
            logger.warning(
                f"Invalid timezone '{user_timezone}' - falling back to UTC"
            )
            tz = pytz.UTC

        # Get current time in user's timezone
        now_utc = datetime.now(pytz.UTC)
        now_local = now_utc.astimezone(tz)

        # Check if between 6:00 PM and 6:14 PM
        return REMINDER_TIME <= now_local.time() < REMINDER_WINDOW_END
