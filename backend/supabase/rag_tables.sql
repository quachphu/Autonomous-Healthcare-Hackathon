-- NatalNanny: user_knowledge_chunks table
-- Stores RAG chunks for checkup sessions, voice notes, and other user knowledge.
-- Run this in the Supabase SQL editor (or via psql).

-- embedding is JSONB for MVP portability.
-- If pgvector is enabled, replace with: embedding vector(1536)
CREATE TABLE IF NOT EXISTS user_knowledge_chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    source_type TEXT NOT NULL,
    -- Values: checkup_session | voice_note | health_document | profile
    source_id   TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content     TEXT NOT NULL,
    embedding   JSONB,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_knowledge_chunks_user_id
    ON user_knowledge_chunks (user_id);

CREATE INDEX IF NOT EXISTS idx_user_knowledge_chunks_source_type
    ON user_knowledge_chunks (user_id, source_type);

CREATE INDEX IF NOT EXISTS idx_user_knowledge_chunks_created_at
    ON user_knowledge_chunks (created_at DESC);
