"""
Chunking and embedding pipeline for NatalNanny RAG.

Public functions:
- chunk_text(text, metadata) → list of chunk dicts
- chunk_pages(pages, metadata) → list of chunk dicts with page_number
- embed_texts(texts, api_key) → list of float[] embeddings (async)
- index_health_document(user_id, document_id, extracted_pages, ...) → int (async)
- index_checkup_session(user_id, session_result, ...) → int (async)
"""

import logging
import uuid as _uuid
from typing import Optional

logger = logging.getLogger(__name__)

CHUNK_SIZE = 3000    # characters (~750 tokens)
CHUNK_OVERLAP = 500  # characters


def chunk_text(
    text: str,
    metadata: dict,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[dict]:
    """Split text into overlapping fixed-size character chunks."""
    text = text.strip()
    chunks: list[dict] = []
    start = 0
    chunk_index = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))
        content = text[start:end].strip()
        if content:
            chunks.append({
                "chunk_index": chunk_index,
                "content": content,
                "token_count": len(content) // 4,
                "metadata": metadata,
            })
            chunk_index += 1
        start += chunk_size - overlap

    return chunks


def chunk_pages(pages: list[dict], metadata: dict) -> list[dict]:
    """Chunk page-by-page, tagging each chunk with its page number."""
    all_chunks: list[dict] = []
    chunk_index = 0

    for page in pages:
        page_text = page.get("text", "").strip()
        page_num = page.get("page_number", 1)
        if not page_text:
            continue
        page_chunks = chunk_text(page_text, {**metadata, "page_number": page_num})
        for c in page_chunks:
            c["chunk_index"] = chunk_index
            c["page_number"] = page_num
            chunk_index += 1
            all_chunks.append(c)

    return all_chunks


async def embed_texts(texts: list[str], api_key: str) -> list[Optional[list[float]]]:
    """
    Call OpenAI text-embedding-3-small for a batch of texts.
    Returns a parallel list of embeddings (None for failed items).
    """
    if not texts or not api_key:
        return [None] * len(texts)

    try:
        from openai import AsyncOpenAI
    except ImportError as exc:
        raise RuntimeError("openai package required for embeddings") from exc

    try:
        client = AsyncOpenAI(api_key=api_key)
        response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]
    except Exception as exc:
        logger.error("Embedding API call failed: %s", exc)
        return [None] * len(texts)


async def index_health_document(
    user_id: str,
    document_id: str,
    extracted_pages: list[dict],
    supabase_url: str,
    service_key: str,
    openai_api_key: str,
) -> int:
    """
    Chunk + embed + store a health document's pages in health_document_chunks.
    Returns number of chunks stored.
    """
    from supabase import create_client

    if not extracted_pages:
        return 0

    base_meta = {"document_id": document_id, "source_type": "health_document"}
    chunks = chunk_pages(extracted_pages, base_meta)
    if not chunks:
        return 0

    texts = [c["content"] for c in chunks]
    embeddings = await embed_texts(texts, openai_api_key)

    sb = create_client(supabase_url, service_key)
    rows = []
    for i, chunk in enumerate(chunks):
        rows.append({
            "id": str(_uuid.uuid4()),
            "user_id": user_id,
            "document_id": document_id,
            "chunk_index": chunk["chunk_index"],
            "content": chunk["content"],
            "token_count": chunk.get("token_count"),
            "page_number": chunk.get("page_number"),
            "embedding": embeddings[i] if i < len(embeddings) else None,
            "metadata": chunk.get("metadata", {}),
        })

    sb.table("health_document_chunks").insert(rows).execute()
    return len(rows)


def _build_checkup_rag_text(session: dict) -> str:
    """Build a concise plain-text summary of a checkup session for RAG."""
    created_at = (session.get("created_at") or "")[:10]

    cs = session.get("checkup_summary") or {}
    rppg_consensus = (session.get("rppg_analysis") or {}).get("consensus") or {}

    pulse = cs.get("estimated_pulse_bpm") or rppg_consensus.get("estimated_pulse_bpm") or "unknown"
    pulse_cat = cs.get("pulse_category") or rppg_consensus.get("pulse_category") or "unknown"
    sig_q = ((session.get("signal_quality") or {}).get("overall")
             or (session.get("rppg_analysis") or {}).get("signal_quality", {}).get("label")
             or "unknown")

    vc = session.get("voice_checkin") or {}
    cleaned_note = vc.get("cleaned_note", "")
    care_summary = vc.get("care_team_summary", "")
    suggested_step = vc.get("suggested_next_step", "")
    symptoms = vc.get("symptoms_reported") or {}
    flagged = [k.replace("_", " ") for k, v in symptoms.items() if v]

    qa_lines = []
    for qa in vc.get("questions_asked") or []:
        q = qa.get("question") or qa.get("id", "")
        a = qa.get("raw_transcript") or qa.get("cleaned_answer", "")
        if q and a:
            qa_lines.append(f"Q: {q}\nA: {a}")

    parts = [
        f"Checkup session on {created_at}.",
        f"Estimated pulse was {pulse} bpm, categorized as {pulse_cat}." if pulse != "unknown" else "",
        f"Signal quality was {sig_q}.",
        f"Symptoms flagged: {', '.join(flagged)}." if flagged else "No acute symptoms reported.",
        "Voice check-in Q&A:\n" + "\n\n".join(qa_lines) if qa_lines else "",
        f"Cleaned note: {cleaned_note}" if cleaned_note else "",
        f"Care team summary: {care_summary}" if care_summary else "",
        f"Suggested next step: {suggested_step}" if suggested_step else "",
        (
            "Seek urgent medical care for chest pain, trouble breathing, fainting, "
            "seizure, severe headache, vision changes, heavy bleeding, or reduced fetal movement."
        ),
    ]
    return "\n\n".join(p for p in parts if p)


async def index_checkup_session(
    user_id: str,
    session_result: dict,
    supabase_url: str,
    service_key: str,
    openai_api_key: str,
) -> int:
    """
    Chunk + embed + store a checkup session in user_knowledge_chunks.
    Returns number of chunks stored.
    """
    from supabase import create_client

    session_id = session_result.get("session_id", "unknown")
    rag_text = _build_checkup_rag_text(session_result)
    if not rag_text.strip():
        return 0

    base_meta = {
        "source_type": "checkup_session",
        "session_id": session_id,
        "created_at": session_result.get("created_at", ""),
    }
    chunks = chunk_text(rag_text, base_meta)
    texts = [c["content"] for c in chunks]
    embeddings = await embed_texts(texts, openai_api_key)

    sb = create_client(supabase_url, service_key)
    rows = []
    for i, chunk in enumerate(chunks):
        rows.append({
            "id": str(_uuid.uuid4()),
            "user_id": user_id,
            "source_type": "checkup_session",
            "source_id": session_id,
            "chunk_index": chunk["chunk_index"],
            "content": chunk["content"],
            "embedding": embeddings[i] if i < len(embeddings) else None,
            "metadata": {**chunk.get("metadata", {}), "created_at": session_result.get("created_at", "")},
        })

    sb.table("user_knowledge_chunks").insert(rows).execute()
    return len(rows)
