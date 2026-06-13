"""
RAG chat endpoint for NatalNanny AI.

POST /api/chat/rag
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.dependencies import CurrentUser, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["rag-chat"])

Cfg = Annotated[Settings, Depends(get_settings)]
Auth = Annotated[CurrentUser, Depends(get_current_user)]


class ChatRequest(BaseModel):
    message: str


@router.post("/chat/rag")
async def rag_chat(body: ChatRequest, cfg: Cfg, current_user: Auth) -> dict:
    """
    Answer a user question using the RAG pipeline over their health records,
    checkup history, and uploaded documents.
    """
    from app.services.rag_service import answer_user_question

    question = (body.message or "").strip()
    if not question:
        return {
            "answer": "Please ask a question.",
            "sources": [],
            "safety_notice": "",
        }

    return await answer_user_question(
        user_id=current_user.id,
        question=question,
        settings=cfg,
    )
