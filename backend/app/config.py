from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_database_url(url: str) -> str:
    """Map Supabase-style URIs to the psycopg3 SQLAlchemy driver."""
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgres://")
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgresql://")
    elif url.startswith("postgresql+psycopg2://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgresql+psycopg2://")

    if "supabase.com" in url and "sslmode=" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}sslmode=require"

    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # JWT secret for signing/verifying auth tokens
    jwt_secret: str = "dev-secret-change-me"
    # OpenAI — transcription (Whisper) and note cleanup (GPT-4o-mini)
    openai_api_key: str = ""
    # xAI (Grok) — primary real-time voice agent (grok-voice-latest)
    xai_api_key: str = ""
    # Google Gemini — conversational voice agent fallback
    gemini_api_key: str = ""
    # Supabase — direct REST API for checkup session storage
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_checkup_table: str = "checkup_sessions"
    supabase_documents_table: str = "health_documents"
    supabase_health_docs_bucket: str = "health-documents"
    # SQLAlchemy / Alembic — Postgres connection URI (Supabase or local CLI)
    database_url: str = (
        "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
    )
    # Comma-separated list of allowed CORS origins.
    # For production add your Vercel URL: "http://localhost:5173,https://materna.vercel.app"
    cors_origins: str = "http://localhost:5173"
    # Twilio — SMS reminders for daily check-ins + emergency voice call
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""  # E.164 format: +14155551234
    # Emergency outbound voice call recipient (Materna demo). E.164 format.
    emergency_call_recipient: str = ""
    # SMTP — email notifications (credentials loaded from .env, never hardcoded)
    smtp_from_email: str = "natalnanny@gmail.com"
    smtp_from_password: str = ""
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587

    # ── Experimental vitals feature flags ─────────────────────────────────────
    # Respiratory rate estimate from BVP low-frequency modulation (on by default)
    enable_experimental_rr: bool = True
    # Uncalibrated BP demo estimate (off by default — requires cuff calibration or explicit opt-in)
    enable_experimental_uncalibrated_bp: bool = False
    # SpO2 RGB ratio-of-ratios demo (off by default — not a pulse oximeter)
    enable_experimental_spo2_demo: bool = False
    # Pulse timing surrogate between facial ROIs (on by default when multi-ROI available)
    enable_experimental_pulse_timing: bool = True

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        return normalize_database_url(value)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sqlalchemy_connect_args(self) -> dict:
        # Required for Supabase transaction pooler (PgBouncer).
        if "pooler.supabase.com" in self.database_url:
            return {"prepare_threshold": None}
        return {}


@lru_cache
def get_settings() -> Settings:
    return Settings()
