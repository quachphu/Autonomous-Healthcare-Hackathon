"""
RAG retrieval and answering service for NatalNanny AI chatbot.

Main entry point: answer_user_question(user_id, question, settings)
"""

import logging
import sys
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

URGENT_SYMPTOMS = (
    "chest pain, trouble breathing, fainting, seizure, severe headache, "
    "vision changes, heavy bleeding, or reduced fetal movement"
)

URGENT_NOTICE = f"Seek urgent medical care for {URGENT_SYMPTOMS}."

SAFETY_NOTICE = (
    "NatalNanny answers from your uploaded documents and check-in history. "
    "Not a diagnosis. For medical decisions, contact your care team. "
    f"Urgent symptoms ({URGENT_SYMPTOMS}) — seek immediate care."
)

_URGENT_KEYWORDS = [
    "chest pain", "trouble breathing", "fainting", "seizure", "severe headache",
    "vision changes", "heavy bleeding", "fetal movement", "emergency", "urgent",
    "can't breathe", "cannot breathe",
]

RAG_SYSTEM_PROMPT = """\
You are NatalNanny AI, a maternal wellness assistant.

You answer questions using ONLY the user's retrieved context from:
- uploaded health documents
- prior checkup results and rPPG wellness summaries
- voice check-in notes
- user profile information

Rules:
- Do not diagnose.
- Do not claim to detect preeclampsia, hypertension, infection, fetal distress, or any disease.
- Do not invent facts that are not in the retrieved context.
- If the answer is not in the retrieved context, say: "I don't see that information in your uploaded documents or check-in history yet."
- If the user asks for medical advice, encourage them to contact their care team.
- If urgent symptoms are mentioned, include the urgent-care safety notice.
- Use simple, supportive language.
- Cite sources when possible.
- Distinguish between:
  1. user-reported symptoms
  2. uploaded document content
  3. camera-estimated wellness signals
  4. care-team summaries

Safe phrasing to use:
- "Based on your uploaded documents and check-in history..."
- "Estimated wellness signal"
- "This may be helpful to share with your care team"
- "Not diagnostic"
- "Ask your provider for medical decisions"

Avoid: diagnosis, disease detection, "Your blood pressure is...", "Your SpO2 is..." unless from a user-uploaded document.

Answer format:
1. Direct answer
2. What I found in your records
3. Suggested next step
"""


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = sum(x * x for x in a) ** 0.5
    mag_b = sum(x * x for x in b) ** 0.5
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _keyword_score(query_lower: str, content: str) -> float:
    words = [w for w in query_lower.split() if len(w) > 3]
    if not words:
        return 0.0
    content_lower = content.lower()
    return sum(1 for w in words if w in content_lower) / len(words)


async def _embed_query(query: str, api_key: str) -> Optional[list[float]]:
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)
        response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=[query],
        )
        return response.data[0].embedding
    except Exception as exc:
        logger.warning("Query embedding failed: %s", exc)
        return None


def _rank_chunks(
    chunks: list[dict],
    query_embedding: Optional[list[float]],
    query_lower: str,
    top_k: int = 6,
) -> list[dict]:
    scored = []
    for chunk in chunks:
        emb = chunk.get("embedding")
        if query_embedding and emb and isinstance(emb, list) and len(emb) == len(query_embedding):
            score = _cosine_similarity(query_embedding, emb)
        else:
            score = _keyword_score(query_lower, chunk.get("content", ""))
        scored.append((score, chunk))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:top_k]]


def _load_local_history_chunks() -> list[dict]:
    """Fallback: load recent checkup sessions from local JSON storage."""
    try:
        _backend = Path(__file__).parent.parent.parent
        sys.path.insert(0, str(_backend))
        from rppg import storage as _storage
        from app.services.rag_indexing import _build_checkup_rag_text
        recent = _storage.get_voice_history(limit=10)
        chunks = []
        for session in recent:
            text = _build_checkup_rag_text(session)
            if text.strip():
                chunks.append({
                    "source_type": "checkup_session",
                    "source_id": session.get("session_id", ""),
                    "chunk_index": 0,
                    "content": text,
                    "embedding": None,
                    "metadata": {"created_at": session.get("created_at", "")},
                })
        return chunks
    except Exception as exc:
        logger.warning("Local history fallback failed: %s", exc)
        return []


async def answer_user_question(
    user_id: str,
    question: str,
    settings,
) -> dict:
    """
    Full RAG pipeline: embed question → retrieve chunks → rank → answer.

    Returns:
        {"answer": str, "sources": list[dict], "safety_notice": str}
    """
    if not settings.supabase_url or not settings.supabase_service_role_key:
        logger.warning("Supabase not configured — using local history only")

    from supabase import create_client

    query_lower = question.lower()
    needs_urgent = any(kw in query_lower for kw in _URGENT_KEYWORDS)

    # Embed the question
    query_embedding = None
    if settings.openai_api_key:
        query_embedding = await _embed_query(question, settings.openai_api_key)

    doc_chunks: list[dict] = []
    knowledge_chunks: list[dict] = []

    if settings.supabase_url and settings.supabase_service_role_key:
        sb = create_client(settings.supabase_url, settings.supabase_service_role_key)

        try:
            result = (
                sb.table("health_document_chunks")
                .select("id, document_id, chunk_index, content, page_number, embedding, metadata")
                .eq("user_id", user_id)
                .limit(60)
                .execute()
            )
            doc_chunks = result.data or []
        except Exception as exc:
            logger.warning("health_document_chunks fetch failed: %s", exc)

        try:
            result = (
                sb.table("user_knowledge_chunks")
                .select("id, source_type, source_id, chunk_index, content, embedding, metadata")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(60)
                .execute()
            )
            knowledge_chunks = result.data or []
        except Exception as exc:
            logger.warning("user_knowledge_chunks fetch failed: %s", exc)

    # Fall back to local history when Supabase has no data
    if not knowledge_chunks:
        knowledge_chunks = _load_local_history_chunks()

    top_doc_chunks = _rank_chunks(doc_chunks, query_embedding, query_lower, top_k=5)
    top_knowledge_chunks = _rank_chunks(knowledge_chunks, query_embedding, query_lower, top_k=5)
    all_top = top_doc_chunks + top_knowledge_chunks

    if not all_top:
        return {
            "answer": (
                "I don't see that information in your uploaded documents or check-in history yet. "
                "Try uploading a health document from Settings → Profile, or complete a check-in."
            ),
            "sources": [],
            "safety_notice": URGENT_NOTICE + " " + SAFETY_NOTICE if needs_urgent else SAFETY_NOTICE,
        }

    # Build context block
    context_parts = []
    for chunk in all_top:
        source_type = chunk.get("source_type", "document")
        meta = chunk.get("metadata") or {}
        if source_type == "health_document":
            doc_id = chunk.get("document_id") or meta.get("document_id", "")
            page = chunk.get("page_number")
            label = f"[Health Document {doc_id[:8]}{'  page ' + str(page) if page else ''}]"
        else:
            sid = chunk.get("source_id", "")
            created = meta.get("created_at", "")[:10]
            label = f"[Checkup session {sid[:8]} on {created}]"
        context_parts.append(f"{label}\n{chunk['content']}")

    context_block = "\n\n---\n\n".join(context_parts)
    user_prompt = (
        f"User question: {question}\n\n"
        f"Retrieved context from the user's records:\n\n{context_block}"
    )

    answer_text = "I don't see that information in your uploaded documents or check-in history yet."

    if not settings.openai_api_key:
        answer_text = (
            "Based on your uploaded documents and check-in history, I found some relevant records. "
            "However, AI answer generation is not configured (OPENAI_API_KEY missing). "
            "Please contact your care team for medical decisions."
        )
    else:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": RAG_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_tokens=1000,
            )
            answer_text = response.choices[0].message.content or answer_text
        except Exception as exc:
            logger.error("RAG answer generation failed: %s", exc)
            answer_text = (
                "I found relevant records in your history but was unable to generate an answer right now. "
                "Please try again or contact your care team directly."
            )

    # Build sources
    sources: list[dict] = []
    for chunk in top_doc_chunks:
        meta = chunk.get("metadata") or {}
        sources.append({
            "source_type": "health_document",
            "document_id": chunk.get("document_id") or meta.get("document_id"),
            "page_number": chunk.get("page_number"),
            "snippet": chunk["content"][:200] + ("..." if len(chunk["content"]) > 200 else ""),
        })
    for chunk in top_knowledge_chunks:
        meta = chunk.get("metadata") or {}
        sources.append({
            "source_type": chunk.get("source_type", "checkup_session"),
            "session_id": chunk.get("source_id"),
            "created_at": meta.get("created_at", ""),
            "snippet": chunk["content"][:200] + ("..." if len(chunk["content"]) > 200 else ""),
        })

    safety = URGENT_NOTICE + " " + SAFETY_NOTICE if needs_urgent else SAFETY_NOTICE

    return {"answer": answer_text, "sources": sources, "safety_notice": safety}
