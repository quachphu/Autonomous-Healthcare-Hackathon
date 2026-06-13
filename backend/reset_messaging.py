"""Run from backend/ to truncate all messaging tables and start fresh.

Usage:
    cd backend
    source .venv/bin/activate
    python reset_messaging.py
"""
import sys
from sqlalchemy import text
from app.config import get_settings
from app.db.session import engine

settings = get_settings()

with engine.connect() as conn:
    conn.execute(text(
        "TRUNCATE messages, thread_participants, message_threads RESTART IDENTITY CASCADE"
    ))
    conn.commit()
    print("✓ messages, thread_participants, message_threads — all rows deleted.")
