from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

from app.models.messaging import SenderType, ThreadStatus, ThreadType


class ThreadRead(BaseModel):
    id: UUID
    type: ThreadType
    last_message_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ThreadCreate(BaseModel):
    """Create a user-to-user thread. Supply both participant user IDs."""

    participant_ids: list[UUID]


class ThreadWithStatus(ThreadRead):
    """Thread with status information for request management."""

    status: ThreadStatus
    initiator_id: UUID | None

    model_config = {"from_attributes": True}


class MessageRequestCreate(BaseModel):
    """Send a message request to another user."""

    recipient_id: UUID
    initial_message: str


class MessageRead(BaseModel):
    id: UUID
    thread_id: UUID
    sender_id: UUID | None
    sender_type: SenderType
    content: str
    created_at: datetime
    read_at: datetime | None

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    content: str


class MessagesPage(BaseModel):
    items: list[MessageRead]
    next_cursor: str | None


# ── WebSocket event envelopes ────────────────────────────────────────────────


class WsMessageEvent(BaseModel):
    type: Literal["message"]
    data: MessageRead


class WsTypingEvent(BaseModel):
    type: Literal["typing"]
    user_id: str
    is_typing: bool


class WsReadReceiptEvent(BaseModel):
    type: Literal["read_receipt"]
    message_id: str
    user_id: str


# Inbound events from the client over WebSocket
class WsInboundMessage(BaseModel):
    type: Literal["message"]
    content: str


class WsInboundTyping(BaseModel):
    type: Literal["typing"]
    is_typing: bool


class WsInboundRead(BaseModel):
    type: Literal["read"]
    message_id: str
