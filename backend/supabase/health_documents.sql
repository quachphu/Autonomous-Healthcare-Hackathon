-- NatalNanny: health_documents and health_document_chunks tables
-- Run this in the Supabase SQL editor (or via psql) to create the tables.

-- Enable pgvector extension if available (comment out if not supported):
-- CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS health_documents (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL,
    file_name              TEXT NOT NULL,
    file_path              TEXT NOT NULL,
    file_size_bytes        INTEGER,
    mime_type              TEXT DEFAULT 'application/pdf',
    document_type          TEXT,
    uploaded_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_status      TEXT NOT NULL DEFAULT 'uploaded',
    -- Values: uploaded | processing | indexed | partially_indexed | failed
    extracted_text_preview TEXT,
    page_count             INTEGER,
    error_message          TEXT,
    metadata               JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_health_documents_user_id
    ON health_documents (user_id);

CREATE INDEX IF NOT EXISTS idx_health_documents_uploaded_at
    ON health_documents (uploaded_at DESC);


-- Chunks for health documents
-- embedding is stored as JSONB (float array) for MVP portability.
-- If pgvector is enabled, replace with: embedding vector(1536)
CREATE TABLE IF NOT EXISTS health_document_chunks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    document_id  UUID NOT NULL REFERENCES health_documents(id) ON DELETE CASCADE,
    chunk_index  INTEGER NOT NULL,
    content      TEXT NOT NULL,
    token_count  INTEGER,
    page_number  INTEGER,
    embedding    JSONB,
    metadata     JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_document_chunks_document_id
    ON health_document_chunks (document_id);

CREATE INDEX IF NOT EXISTS idx_health_document_chunks_user_id
    ON health_document_chunks (user_id);
