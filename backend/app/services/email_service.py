"""SMTP email service for NatalNanny notifications."""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import Settings

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def is_configured(self) -> bool:
        return bool(self.settings.smtp_from_email and self.settings.smtp_from_password)

    def send_email(self, to_email: str, subject: str, body: str) -> tuple[bool, str | None]:
        print(f"[SMTP DEBUG] send_email called → to={to_email!r}, subject={subject!r}")
        print(f"[SMTP DEBUG] smtp_host={self.settings.smtp_host!r}, smtp_port={self.settings.smtp_port}, from={self.settings.smtp_from_email!r}")
        if not self.is_configured():
            print(f"[SMTP DEBUG] Not configured — smtp_from_email={self.settings.smtp_from_email!r}, password_set={bool(self.settings.smtp_from_password)}")
            logger.warning("SMTP not configured — skipping email to %s", to_email)
            return False, "SMTP not configured"
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self.settings.smtp_from_email
            msg["To"] = to_email
            msg.attach(MIMEText(body, "plain"))

            print(f"[SMTP DEBUG] Connecting to {self.settings.smtp_host}:{self.settings.smtp_port} …")
            with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port) as server:
                server.ehlo()
                server.starttls()
                print(f"[SMTP DEBUG] TLS ok, logging in as {self.settings.smtp_from_email!r} …")
                server.login(self.settings.smtp_from_email, self.settings.smtp_from_password)
                # server.sendmail(self.settings.smtp_from_email, to_email, msg.as_string())

            print(f"[SMTP DEBUG] ✓ Email delivered to {to_email!r}")
            logger.info("Email sent to %s — %s", to_email, subject)
            return True, None
        except Exception as exc:
            print(f"[SMTP DEBUG] ✗ FAILED sending to {to_email!r}: {exc!r}")
            logger.error("Failed to send email to %s: %s", to_email, exc)
            return False, str(exc)

    def send_daily_reminder(self, to_email: str, first_name: str | None) -> tuple[bool, str | None]:
        greeting = first_name or "there"
        return self.send_email(
            to_email=to_email,
            subject="Your daily checkup reminder — Natal Nanny",
            body=f"Hey {greeting}, please do your daily checkup today From Natal Nanny",
        )

    def send_streak_alert(self, to_email: str, first_name: str | None) -> tuple[bool, str | None]:
        return self.send_email(
            to_email=to_email,
            subject="Complete your streak today — Natal Nanny",
            body="Hey, complete your streak today!",
        )

    def send_message_notification(
        self,
        to_email: str,
        first_name: str | None,
        sender_name: str,
        message_content: str = "",
    ) -> tuple[bool, str | None]:
        greeting = first_name or "there"
        body = (
            f"Hey {greeting}, you have a new message from {sender_name} on Natal Nanny.\n\n"
            f'"{message_content}"\n\n'
            f"Log in to reply."
        )
        return self.send_email(
            to_email=to_email,
            subject=f"New message from {sender_name} — Natal Nanny",
            body=body,
        )
