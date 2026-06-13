"""Twilio SMS service for sending daily check-in reminders."""
import logging
from typing import Optional

from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

from app.config import Settings

logger = logging.getLogger(__name__)


class TwilioService:
    """
    Wrapper for Twilio SDK to send SMS reminders.

    Features:
    - Graceful degradation when Twilio not configured
    - Personalized messages using user's first name
    - Phone number masking in logs for privacy
    - Comprehensive error handling
    """

    def __init__(self, settings: Settings):
        """
        Initialize Twilio client with credentials from settings.

        Args:
            settings: Application settings containing Twilio credentials
        """
        self.settings = settings
        self.client: Optional[Client] = None

        if self.is_configured():
            try:
                self.client = Client(
                    settings.twilio_account_sid,
                    settings.twilio_auth_token
                )
                logger.info("Twilio client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Twilio client: {e}")
                self.client = None
        else:
            logger.warning(
                "Twilio not configured - SMS reminders disabled. "
                "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER "
                "in environment variables to enable."
            )

    def is_configured(self) -> bool:
        """
        Check if Twilio credentials are properly configured.

        Returns:
            True if all required Twilio settings are present
        """
        return bool(
            self.settings.twilio_account_sid
            and self.settings.twilio_auth_token
            and self.settings.twilio_phone_number
        )

    def send_reminder_sms(
        self,
        to_phone: str,
        user_first_name: Optional[str] = None
    ) -> tuple[bool, Optional[str]]:
        """
        Send a daily check-in reminder SMS to a user.

        Args:
            to_phone: Recipient phone number in E.164 format (e.g., +14155551234)
            user_first_name: User's first name for personalization (optional)

        Returns:
            Tuple of (success: bool, error_msg: Optional[str])
            - (True, None) if SMS sent successfully
            - (False, "error message") if failed
        """
        if not self.client:
            return False, "Twilio client not initialized"

        # Personalize message with first name if available
        greeting = f"Hi {user_first_name}! 👋" if user_first_name else "Hi! 👋"

        message_body = f"""{greeting}

Don't forget your daily check-in with NatalNanny today.
Your wellness buddy is waiting! 🦘

Log in to complete your check-in: https://natalnanny.app"""

        try:
            message = self.client.messages.create(
                body=message_body,
                from_=self.settings.twilio_phone_number,
                to=to_phone
            )

            # Mask phone number for privacy in logs
            masked_phone = self._mask_phone_number(to_phone)
            logger.info(
                f"SMS sent successfully to {masked_phone} "
                f"(SID: {message.sid}, Status: {message.status})"
            )

            return True, None

        except TwilioRestException as e:
            masked_phone = self._mask_phone_number(to_phone)
            error_msg = f"Twilio API error for {masked_phone}: {e.msg} (Code: {e.code})"
            logger.error(error_msg)
            return False, error_msg

        except Exception as e:
            masked_phone = self._mask_phone_number(to_phone)
            error_msg = f"Unexpected error sending SMS to {masked_phone}: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    @staticmethod
    def _mask_phone_number(phone: str) -> str:
        """
        Mask phone number for privacy in logs.

        Example: +14155551234 → +1415***1234

        Args:
            phone: Phone number to mask

        Returns:
            Masked phone number string
        """
        if len(phone) < 8:
            return "***"

        # Show first 5 chars (+1415) and last 4 chars (1234)
        return f"{phone[:5]}***{phone[-4:]}"
