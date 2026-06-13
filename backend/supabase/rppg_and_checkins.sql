-- ─────────────────────────────────────────────────────────────────────────────
-- NatalNanny: rPPG results + voice check-in tables
-- Run in Supabase SQL Editor (or psql) after checkup_sessions.sql
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Table 1: rppg_results ────────────────────────────────────────────────────
-- One row per rPPG recording session. All signal metrics as flat columns.

CREATE TABLE IF NOT EXISTS rppg_results (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id                  TEXT        NOT NULL UNIQUE,
    user_id                     UUID,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Session metadata
    duration_seconds            FLOAT,
    completed_reason            TEXT,       -- 'answered_all_questions' | 'time_limit_reached' | 'user_stopped'
    source_pipeline             TEXT,       -- e.g. 'rPPG-Toolbox + OpenAI voice check-in'
    source_mode                 TEXT,       -- e.g. 'voice_rppg_maternal_wellness_mvp'

    -- Pulse summary
    estimated_pulse_bpm         FLOAT,
    pulse_category              TEXT,       -- 'typical_resting_range' | 'elevated_for_resting_checkin' | 'below_typical_resting_range'
    pulse_label                 TEXT,
    confidence                  TEXT,       -- 'good' | 'medium' | 'low'
    retake_recommended          BOOLEAN,
    retake_reasons              TEXT[],

    -- Per-method heart rates
    pos_hr_bpm                  FLOAT,
    chrom_hr_bpm                FLOAT,
    green_hr_bpm                FLOAT,
    consensus_hr_bpm            FLOAT,

    -- Heart rate statistics (windowed)
    hr_trend                    TEXT,       -- 'stable' | 'variable' | 'increasing' | 'decreasing'
    mean_window_bpm             FLOAT,
    min_window_bpm              FLOAT,
    max_window_bpm              FLOAT,
    range_window_bpm            FLOAT,
    std_window_bpm              FLOAT,
    window_values_bpm           FLOAT[],   -- array of per-window HR values
    window_size_seconds         INT,

    -- Method agreement
    pos_chrom_diff_bpm          FLOAT,
    pos_green_diff_bpm          FLOAT,
    chrom_green_diff_bpm        FLOAT,
    agreement_quality           TEXT,       -- 'good' | 'medium' | 'low'
    outlier_methods             TEXT[],

    -- Signal quality
    signal_quality_overall      TEXT,       -- 'good' | 'medium' | 'low'
    method_agreement_quality    TEXT,
    hr_stability                TEXT,
    waveform_strength           TEXT,
    snr_like_score              FLOAT,
    dominant_frequency_hz       FLOAT,
    dominant_frequency_bpm      FLOAT,
    waveform_sample_count       INT,
    valid_window_count          INT,

    -- Recording quality
    face_detected               BOOLEAN,
    multiple_faces_detected     BOOLEAN,
    recording_duration_seconds  FLOAT,
    estimated_fps               FLOAT,
    frame_count                 INT,
    resolution                  TEXT,

    -- Wellness interpretation
    wellness_score              INT,
    wellness_message            TEXT,
    suggested_next_step         TEXT
);

CREATE INDEX IF NOT EXISTS idx_rppg_results_created_at   ON rppg_results (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rppg_results_user_id      ON rppg_results (user_id);
CREATE INDEX IF NOT EXISTS idx_rppg_results_session_id   ON rppg_results (session_id);
CREATE INDEX IF NOT EXISTS idx_rppg_results_pulse_cat    ON rppg_results (pulse_category);


-- ── Table 2: checkin_voice_notes ─────────────────────────────────────────────
-- One row per voice check-in session. AI-cleaned summary + symptom flags.

CREATE TABLE IF NOT EXISTS checkin_voice_notes (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id                  TEXT        NOT NULL UNIQUE,
    user_id                     UUID,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- AI-generated notes
    cleaned_note                TEXT,
    care_team_summary           TEXT,
    suggested_next_step         TEXT,
    possible_context            TEXT[],     -- context clues for metrics (e.g. "user was recently active")

    -- Urgent flags
    requires_urgent_notice      BOOLEAN     NOT NULL DEFAULT FALSE,
    urgent_notice_reason        TEXT,

    -- Symptom flags (reported by user during check-in)
    symptom_chest_pain          BOOLEAN     NOT NULL DEFAULT FALSE,
    symptom_shortness_of_breath BOOLEAN     NOT NULL DEFAULT FALSE,
    symptom_dizziness           BOOLEAN     NOT NULL DEFAULT FALSE,
    symptom_severe_headache     BOOLEAN     NOT NULL DEFAULT FALSE,
    symptom_vision_changes      BOOLEAN     NOT NULL DEFAULT FALSE,
    symptom_heavy_bleeding      BOOLEAN     NOT NULL DEFAULT FALSE,
    symptom_reduced_fetal_movement BOOLEAN  NOT NULL DEFAULT FALSE,
    symptom_fever_or_chills     BOOLEAN     NOT NULL DEFAULT FALSE,
    symptom_mood_concern        BOOLEAN     NOT NULL DEFAULT FALSE,

    -- AI processing metadata
    ai_cleanup_skipped          BOOLEAN     NOT NULL DEFAULT FALSE,
    ai_cleanup_reason           TEXT,

    -- FK to rppg_results (nullable — voice-only sessions have no rPPG)
    rppg_result_id              UUID        REFERENCES rppg_results (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_voice_notes_created_at    ON checkin_voice_notes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_notes_user_id       ON checkin_voice_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_session_id    ON checkin_voice_notes (session_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_urgent        ON checkin_voice_notes (requires_urgent_notice) WHERE requires_urgent_notice = TRUE;
-- Index for symptom history queries
CREATE INDEX IF NOT EXISTS idx_voice_notes_chest_pain    ON checkin_voice_notes (symptom_chest_pain) WHERE symptom_chest_pain = TRUE;


-- ── Table 3: checkin_answers ─────────────────────────────────────────────────
-- One row per question per session. Individual Q&A pairs.

CREATE TABLE IF NOT EXISTS checkin_answers (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          TEXT        NOT NULL,
    user_id             UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    question_index      INT         NOT NULL,  -- 1-based (1 = first question)
    question_id         TEXT        NOT NULL,  -- 'feeling_now' | 'activity_before' | etc.
    question_text       TEXT        NOT NULL,
    raw_transcript      TEXT,
    cleaned_answer      TEXT,

    FOREIGN KEY (session_id) REFERENCES checkin_voice_notes (session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checkin_answers_session_id ON checkin_answers (session_id);
CREATE INDEX IF NOT EXISTS idx_checkin_answers_user_id    ON checkin_answers (user_id);
CREATE INDEX IF NOT EXISTS idx_checkin_answers_q_id       ON checkin_answers (question_id);
