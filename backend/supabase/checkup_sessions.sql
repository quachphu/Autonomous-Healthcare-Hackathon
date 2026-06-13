-- NatalNanny: checkup_sessions table
-- Run this in the Supabase SQL editor (or via psql) to create the storage table.

CREATE TABLE IF NOT EXISTS checkup_sessions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id            TEXT NOT NULL UNIQUE,
    user_id               UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_seconds      FLOAT,
    completed_reason      TEXT,
    estimated_pulse_bpm   FLOAT,
    pulse_category        TEXT,
    signal_quality        TEXT,
    rppg_data             JSONB,
    voice_checkin         JSONB,
    session_notes_for_user JSONB,
    user_context_used     JSONB,
    full_result           JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkup_sessions_created_at
    ON checkup_sessions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkup_sessions_user_id
    ON checkup_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_checkup_sessions_session_id
    ON checkup_sessions (session_id);

-- Allow the service role to insert/upsert
-- (RLS is disabled by default; enable and add policies if needed for multi-tenant use)
