"""Messaging router — REST thread/message management + WebSocket real-time channel.

WebSocket protocol:
  Connect:  WS /ws/messaging/{thread_id}?token=<jwt>
  Inbound:  { "type": "message",  "content": "..." }
            { "type": "typing",   "is_typing": true/false }
            { "type": "read",     "message_id": "..." }
  Outbound: { "type": "message",       "data": { ...MessageRead } }
            { "type": "typing",        "user_id": "...", "is_typing": true }
            { "type": "read_receipt",  "message_id": "...", "user_id": "..." }
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.session import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models.doctor_patient import ConnectionStatus, DoctorPatient
from app.models.messaging import Message, MessageThread, SenderType, ThreadParticipant, ThreadStatus, ThreadType
from app.models.user import User, UserProfile, UserRole
from app.schemas.messaging import (
    MessageCreate,
    MessageRead,
    MessageRequestCreate,
    MessagesPage,
    ThreadCreate,
    ThreadRead,
    ThreadWithStatus,
)
from app.schemas.user import ContactRead

router = APIRouter(tags=["messaging"])
ws_router = APIRouter(tags=["messaging-ws"])

Auth = Annotated[CurrentUser, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]
Cfg = Annotated[Settings, Depends(get_settings)]


# ── In-memory WebSocket connection manager ────────────────────────────────────
# NOTE: single-process only. Replace with Redis pub/sub for multi-worker deploys.

class _ConnectionManager:
    def __init__(self) -> None:
        # thread_id → list of (user_id, WebSocket)
        self._connections: dict[str, list[tuple[str, WebSocket]]] = {}

    def connect(self, thread_id: str, user_id: str, ws: WebSocket) -> None:
        self._connections.setdefault(thread_id, []).append((user_id, ws))

    def disconnect(self, thread_id: str, user_id: str, ws: WebSocket) -> None:
        conns = self._connections.get(thread_id, [])
        self._connections[thread_id] = [
            (uid, w) for uid, w in conns if w is not ws
        ]

    async def broadcast(self, thread_id: str, payload: dict, exclude: WebSocket | None = None) -> None:
        for _uid, ws in list(self._connections.get(thread_id, [])):
            if ws is exclude:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                pass


_manager = _ConnectionManager()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _assert_participant(db: Session, thread_id: uuid.UUID, user_id: str) -> None:
    row = db.execute(
        select(ThreadParticipant).where(
            ThreadParticipant.thread_id == thread_id,
            ThreadParticipant.user_id == user_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a thread participant")


def _msg_to_schema(msg: Message) -> MessageRead:
    return MessageRead.model_validate(msg)


def _touch_thread(db: Session, thread: MessageThread) -> None:
    thread.last_message_at = datetime.now(timezone.utc)


def _notify_recipients_by_email(
    db: Session,
    settings: Settings,
    thread_id: uuid.UUID,
    sender_id: uuid.UUID,
    sender_profile: UserProfile,
    message_content: str = "",
) -> None:
    """Send an email notification to each thread participant who is not the sender."""
    from app.services.email_service import EmailService
    email_svc = EmailService(settings)
    print(f"[EMAIL DEBUG] _notify_recipients_by_email called — thread={thread_id}, sender={sender_id}")
    if not email_svc.is_configured():
        print(f"[EMAIL DEBUG] Email service NOT configured (smtp_from_email or smtp_from_password missing) — skipping")
        return

    sender_name = _format_contact_name(sender_profile)
    print(f"[EMAIL DEBUG] Sender name: {sender_name!r}")

    participant_ids = db.execute(
        select(ThreadParticipant.user_id).where(
            ThreadParticipant.thread_id == thread_id,
            ThreadParticipant.user_id != sender_id,
        )
    ).scalars().all()

    print(f"[EMAIL DEBUG] Recipients (excluding sender): {participant_ids}")

    for recipient_id in participant_ids:
        recipient_profile = db.get(UserProfile, recipient_id)
        if not recipient_profile:
            print(f"[EMAIL DEBUG] Skipping {recipient_id} — no profile found")
            continue
        if not recipient_profile.email_message_notification_enabled:
            print(f"[EMAIL DEBUG] Skipping {recipient_id} — email_message_notification_enabled=False")
            continue
        recipient_user = db.get(User, recipient_id)
        if not recipient_user:
            print(f"[EMAIL DEBUG] Skipping {recipient_id} — no User row found")
            continue
        print(f"[EMAIL DEBUG] Sending notification email to {recipient_user.email!r} (user={recipient_id})")
        ok, err = email_svc.send_message_notification(
            to_email=recipient_user.email,
            first_name=recipient_profile.first_name,
            sender_name=sender_name,
            message_content=message_content,
        )
        if ok:
            print(f"[EMAIL DEBUG] Email sent successfully to {recipient_user.email!r}")
        else:
            print(f"[EMAIL DEBUG] Email FAILED to {recipient_user.email!r}: {err}")


def _find_thread_between_users(db: Session, user1_id: uuid.UUID, user2_id: uuid.UUID) -> MessageThread | None:
    """Find an existing user thread between two users."""
    # Get all thread IDs for user1
    user1_thread_ids = db.execute(
        select(ThreadParticipant.thread_id).where(
            ThreadParticipant.user_id == user1_id
        )
    ).scalars().all()

    if not user1_thread_ids:
        return None

    # Find threads where both users are participants
    for tid in user1_thread_ids:
        thread_participants = db.execute(
            select(ThreadParticipant.user_id).where(ThreadParticipant.thread_id == tid)
        ).scalars().all()

        if set(thread_participants) == {user1_id, user2_id}:
            thread = db.get(MessageThread, tid)
            if thread and thread.type == ThreadType.user:
                return thread

    return None


# ── REST endpoints ────────────────────────────────────────────────────────────


def _format_contact_name(profile: UserProfile) -> str:
    """Format a user's display name from their profile.

    Returns "FirstName LastName" if available, otherwise just first or last name,
    or a role-based fallback if no names are set.
    """
    name_parts = [
        profile.first_name.strip() if profile.first_name else None,
        profile.last_name.strip() if profile.last_name else None,
    ]
    name_parts = [part for part in name_parts if part]  # filter out None/empty

    if name_parts:
        return ' '.join(name_parts)

    # Fallback to role-based display
    return "Patient" if profile.role == UserRole.patient else "Doctor"


@router.get("/messaging/contacts", response_model=list[ContactRead])
def list_contacts(user: Auth, db: DB) -> list[ContactRead]:
    """Return messaging contacts based on user role.

    Doctor → their patients. Patient → their doctors. Both include AI agent as synthetic contact.
    Includes contacts from accepted DoctorPatient links AND accepted message threads.
    """
    profile = db.get(UserProfile, uuid.UUID(user.id))
    contacts: list[ContactRead] = []
    seen_ids: set[str] = set()

    if profile and profile.role == UserRole.doctor:
        # Return patients with accepted connections only
        links = db.execute(
            select(DoctorPatient.patient_id).where(
                DoctorPatient.doctor_id == uuid.UUID(user.id),
                DoctorPatient.status == ConnectionStatus.accepted,
            )
        ).scalars().all()
        if links:
            patients = db.execute(
                select(UserProfile).where(UserProfile.id.in_(links))
            ).scalars().all()
            for p in patients:
                contacts.append(ContactRead(
                    id=str(p.id),
                    role=p.role,
                    display_name=_format_contact_name(p),
                    email=None,
                ))
                seen_ids.add(str(p.id))
    elif profile and profile.role == UserRole.patient:
        # Return doctors with accepted connections only
        links = db.execute(
            select(DoctorPatient.doctor_id).where(
                DoctorPatient.patient_id == uuid.UUID(user.id),
                DoctorPatient.status == ConnectionStatus.accepted,
            )
        ).scalars().all()
        if links:
            doctors = db.execute(
                select(UserProfile).where(UserProfile.id.in_(links))
            ).scalars().all()
            for d in doctors:
                contacts.append(ContactRead(
                    id=str(d.id),
                    role=d.role,
                    display_name=_format_contact_name(d),
                    email=None,
                ))
                seen_ids.add(str(d.id))

    # Also include participants from accepted message threads not already in the list
    all_thread_ids = db.execute(
        select(ThreadParticipant.thread_id).where(
            ThreadParticipant.user_id == uuid.UUID(user.id)
        )
    ).scalars().all()

    if all_thread_ids:
        accepted_threads = db.execute(
            select(MessageThread).where(
                MessageThread.id.in_(all_thread_ids),
                MessageThread.type == ThreadType.user,
                MessageThread.status == ThreadStatus.accepted,
            )
        ).scalars().all()

        for thread in accepted_threads:
            other_id = db.execute(
                select(ThreadParticipant.user_id).where(
                    ThreadParticipant.thread_id == thread.id,
                    ThreadParticipant.user_id != uuid.UUID(user.id),
                )
            ).scalar_one_or_none()

            if other_id and str(other_id) not in seen_ids:
                other_profile = db.get(UserProfile, other_id)
                if other_profile:
                    contacts.append(ContactRead(
                        id=str(other_profile.id),
                        role=other_profile.role,
                        display_name=_format_contact_name(other_profile),
                        email=None,
                    ))
                    seen_ids.add(str(other_id))

    # Always include AI agent as synthetic contact
    contacts.append(ContactRead(
        id="ai-agent",
        role=None,
        display_name="NatalNanny AI",
        email=None,
    ))

    return contacts


@router.get("/messaging/threads", response_model=list[ThreadRead])
def list_threads(user: Auth, db: DB) -> list[MessageThread]:
    """List all threads the current user participates in."""
    thread_ids = db.execute(
        select(ThreadParticipant.thread_id).where(
            ThreadParticipant.user_id == user.id
        )
    ).scalars().all()
    if not thread_ids:
        return []
    return db.execute(
        select(MessageThread)
        .where(MessageThread.id.in_(thread_ids))
        .order_by(MessageThread.last_message_at.desc().nullslast())
    ).scalars().all()


@router.post("/messaging/threads", response_model=ThreadRead, status_code=status.HTTP_201_CREATED)
def create_thread(payload: ThreadCreate, user: Auth, db: DB) -> MessageThread:
    """Create a new user-to-user thread. Use message request flow for new connections."""
    all_participants = list({uuid.UUID(user.id), *payload.participant_ids})

    if len(all_participants) != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exactly two participants required for a user thread.",
        )

    # Deduplication: find existing thread with same participants
    other_user_id = [pid for pid in all_participants if pid != uuid.UUID(user.id)][0]
    existing_thread = _find_thread_between_users(db, uuid.UUID(user.id), other_user_id)

    if existing_thread:
        # Only return if thread is accepted
        if existing_thread.status == ThreadStatus.accepted:
            return existing_thread
        elif existing_thread.status == ThreadStatus.pending:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="A message request is pending. Please wait for the recipient to accept.",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot create thread. Use the message request flow to initiate conversations.",
            )

    # For new threads, direct users to use message request flow
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Use the message request endpoint to initiate a new conversation.",
    )


@router.get("/messaging/agent/thread", response_model=ThreadRead)
def get_or_create_agent_thread(user: Auth, db: DB) -> MessageThread:
    """Return the singleton agent thread for the current user, creating it if needed."""
    existing_ids = db.execute(
        select(ThreadParticipant.thread_id).where(
            ThreadParticipant.user_id == user.id
        )
    ).scalars().all()

    if existing_ids:
        agent_thread = db.execute(
            select(MessageThread).where(
                MessageThread.id.in_(existing_ids),
                MessageThread.type == ThreadType.agent,
            )
        ).scalar_one_or_none()
        if agent_thread:
            return agent_thread

    thread = MessageThread(type=ThreadType.agent)
    db.add(thread)
    db.flush()
    db.add(ThreadParticipant(thread_id=thread.id, user_id=uuid.UUID(user.id)))
    db.commit()
    db.refresh(thread)
    return thread


@router.get("/messaging/threads/{thread_id}/messages", response_model=MessagesPage)
def list_messages(
    thread_id: uuid.UUID,
    user: Auth,
    db: DB,
    cursor: str | None = Query(default=None, description="ISO datetime cursor for pagination"),
    limit: int = Query(default=50, ge=1, le=200),
) -> MessagesPage:
    _assert_participant(db, thread_id, user.id)

    stmt = select(Message).where(Message.thread_id == thread_id)
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
            stmt = stmt.where(Message.created_at < cursor_dt)
        except ValueError:
            pass
    stmt = stmt.order_by(Message.created_at.desc()).limit(limit + 1)

    msgs = db.execute(stmt).scalars().all()
    has_more = len(msgs) > limit
    page = msgs[:limit]

    next_cursor = page[-1].created_at.isoformat() if has_more and page else None
    return MessagesPage(
        items=[_msg_to_schema(m) for m in reversed(page)],
        next_cursor=next_cursor,
    )


@router.post(
    "/messaging/threads/{thread_id}/messages",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    thread_id: uuid.UUID, payload: MessageCreate, user: Auth, db: DB, cfg: Cfg
) -> MessageRead:
    """Send a message. For agent threads, agent replies are handled async (TODO)."""
    _assert_participant(db, thread_id, user.id)

    thread = db.get(MessageThread, thread_id)
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")

    sender_id = uuid.UUID(user.id)
    msg = Message(
        thread_id=thread_id,
        sender_id=sender_id,
        sender_type=SenderType.user,
        content=payload.content,
    )
    db.add(msg)
    _touch_thread(db, thread)
    db.commit()
    db.refresh(msg)

    # Broadcast to WebSocket subscribers so recipients get real-time updates
    outbound = {"type": "message", "data": _msg_to_schema(msg).model_dump(mode="json")}
    await _manager.broadcast(str(thread_id), outbound)

    # Email notification to recipients
    print(f"[REST DEBUG] Message sent in thread={thread_id}, sender={sender_id}, thread_type={thread.type}")
    if thread.type == ThreadType.user:
        sender_profile = db.get(UserProfile, sender_id)
        if sender_profile:
            _notify_recipients_by_email(db, cfg, thread_id, sender_id, sender_profile, message_content=payload.content)
        else:
            print(f"[REST DEBUG] No sender profile found for {sender_id} — skipping email")

    # TODO: for agent threads, enqueue async agent reply via task queue
    return _msg_to_schema(msg)


# ── Message Request endpoints ─────────────────────────────────────────────────


@router.post("/messaging/requests", response_model=ThreadWithStatus, status_code=status.HTTP_201_CREATED)
async def send_message_request(payload: MessageRequestCreate, user: Auth, db: DB, cfg: Cfg) -> MessageThread:
    """Send a message request to another user."""
    if payload.recipient_id == uuid.UUID(user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot send a message request to yourself.",
        )

    # Check if recipient exists
    recipient = db.get(UserProfile, payload.recipient_id)
    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipient not found.",
        )

    # Check for existing thread
    existing_thread = _find_thread_between_users(db, uuid.UUID(user.id), payload.recipient_id)

    if existing_thread:
        if existing_thread.status == ThreadStatus.pending:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A message request is already pending with this user.",
            )
        elif existing_thread.status == ThreadStatus.accepted:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A conversation already exists with this user.",
            )
        elif existing_thread.status == ThreadStatus.rejected:
            # Allow re-request after 7 days
            days_since_rejection = (datetime.now(timezone.utc) - existing_thread.created_at.replace(tzinfo=timezone.utc)).days
            if days_since_rejection < 7:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Please wait {7 - days_since_rejection} more days before sending another request.",
                )
            # Update existing thread
            existing_thread.status = ThreadStatus.pending
            existing_thread.initiator_id = uuid.UUID(user.id)
        elif existing_thread.status == ThreadStatus.blocked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot send message request to this user.",
            )

    if not existing_thread:
        # Create new thread with pending status
        thread = MessageThread(
            type=ThreadType.user,
            status=ThreadStatus.pending,
            initiator_id=uuid.UUID(user.id),
        )
        db.add(thread)
        db.flush()

        # Add participants
        db.add(ThreadParticipant(thread_id=thread.id, user_id=uuid.UUID(user.id)))
        db.add(ThreadParticipant(thread_id=thread.id, user_id=payload.recipient_id))
    else:
        thread = existing_thread

    # Create initial message
    msg = Message(
        thread_id=thread.id,
        sender_id=uuid.UUID(user.id),
        sender_type=SenderType.user,
        content=payload.initial_message,
    )
    db.add(msg)
    _touch_thread(db, thread)

    db.commit()
    db.refresh(thread)

    # Broadcast to WebSocket if recipient is online
    outbound = {"type": "message", "data": _msg_to_schema(msg).model_dump(mode="json")}
    await _manager.broadcast(str(thread.id), outbound)

    # Email notification to recipient
    sender_id = uuid.UUID(user.id)
    sender_profile = db.get(UserProfile, sender_id)
    if sender_profile:
        _notify_recipients_by_email(db, cfg, thread.id, sender_id, sender_profile, message_content=payload.initial_message)

    return thread


@router.get("/messaging/requests/received", response_model=list[ThreadWithStatus])
def list_received_requests(user: Auth, db: DB) -> list[MessageThread]:
    """List pending message requests where current user is the recipient."""
    thread_ids = db.execute(
        select(ThreadParticipant.thread_id).where(
            ThreadParticipant.user_id == user.id
        )
    ).scalars().all()

    if not thread_ids:
        return []

    # Get pending threads where user is NOT the initiator
    threads = db.execute(
        select(MessageThread)
        .where(
            MessageThread.id.in_(thread_ids),
            MessageThread.type == ThreadType.user,
            MessageThread.status == ThreadStatus.pending,
            MessageThread.initiator_id != uuid.UUID(user.id),
        )
        .order_by(MessageThread.created_at.desc())
    ).scalars().all()

    return threads


@router.get("/messaging/requests/sent", response_model=list[ThreadWithStatus])
def list_sent_requests(user: Auth, db: DB) -> list[MessageThread]:
    """List pending message requests sent by current user."""
    thread_ids = db.execute(
        select(ThreadParticipant.thread_id).where(
            ThreadParticipant.user_id == user.id
        )
    ).scalars().all()

    if not thread_ids:
        return []

    # Get pending threads where user IS the initiator
    threads = db.execute(
        select(MessageThread)
        .where(
            MessageThread.id.in_(thread_ids),
            MessageThread.type == ThreadType.user,
            MessageThread.status == ThreadStatus.pending,
            MessageThread.initiator_id == uuid.UUID(user.id),
        )
        .order_by(MessageThread.created_at.desc())
    ).scalars().all()

    return threads


@router.post("/messaging/requests/{thread_id}/accept", response_model=ThreadWithStatus)
async def accept_message_request(thread_id: uuid.UUID, user: Auth, db: DB) -> MessageThread:
    """Accept a pending message request."""
    _assert_participant(db, thread_id, user.id)

    thread = db.get(MessageThread, thread_id)
    if not thread:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found.",
        )

    if thread.status != ThreadStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thread is not in pending status.",
        )

    # Verify user is recipient (not initiator)
    if thread.initiator_id == uuid.UUID(user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot accept your own message request.",
        )

    thread.status = ThreadStatus.accepted
    db.commit()
    db.refresh(thread)

    # Broadcast status update to WebSocket
    await _manager.broadcast(
        str(thread_id),
        {"type": "thread_status", "status": "accepted"},
    )

    return thread


@router.post("/messaging/requests/{thread_id}/reject", response_model=ThreadWithStatus)
async def reject_message_request(thread_id: uuid.UUID, user: Auth, db: DB) -> MessageThread:
    """Reject a pending message request."""
    _assert_participant(db, thread_id, user.id)

    thread = db.get(MessageThread, thread_id)
    if not thread:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found.",
        )

    if thread.status != ThreadStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thread is not in pending status.",
        )

    # Verify user is recipient (not initiator)
    if thread.initiator_id == uuid.UUID(user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot reject your own message request.",
        )

    thread.status = ThreadStatus.rejected
    db.commit()
    db.refresh(thread)

    # Broadcast status update to WebSocket
    await _manager.broadcast(
        str(thread_id),
        {"type": "thread_status", "status": "rejected"},
    )

    return thread


# ── WebSocket endpoint ────────────────────────────────────────────────────────


async def _ws_authenticate(token: str | None, cfg: Settings) -> CurrentUser | None:
    """Verify a JWT from a WebSocket query param."""
    if not token:
        return None
    import jwt
    from jwt.exceptions import InvalidTokenError

    try:
        payload = jwt.decode(
            token,
            cfg.jwt_secret,
            algorithms=["HS256"],
        )
        user_id = payload.get("sub")
        email = payload.get("email")
        if user_id and email:
            return CurrentUser(id=user_id, email=email)
    except InvalidTokenError:
        pass
    return None


@ws_router.websocket("/ws/messaging/{thread_id}")
async def websocket_messaging(
    websocket: WebSocket,
    thread_id: uuid.UUID,
    token: str | None = Query(default=None),
    cfg: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> None:
    """Real-time messaging channel for a thread.

    Auth: pass the JWT as ?token=<jwt>
    """
    current_user = await _ws_authenticate(token, cfg)
    if current_user is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    try:
        _assert_participant(db, thread_id, current_user.id)
    except HTTPException:
        await websocket.close(code=4003, reason="Not a participant")
        return

    await websocket.accept()
    _manager.connect(str(thread_id), current_user.id, websocket)
    print(f"[WS DEBUG] User {current_user.id} ({current_user.email}) connected to thread {thread_id}", flush=True)

    try:
        while True:
            raw = await websocket.receive_text()
            print(f"[WS DEBUG] Raw event received from {current_user.id}: {raw[:200]}", flush=True)
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                print(f"[WS DEBUG] Failed to parse JSON: {raw[:200]}", flush=True)
                continue

            event_type = event.get("type")
            print(f"[WS DEBUG] Event type: {event_type!r}")

            if event_type == "message":
                content = event.get("content", "").strip()
                if not content:
                    print(f"[WS DEBUG] Empty content — skipping")
                    continue

                thread = db.get(MessageThread, thread_id)
                if thread is None:
                    print(f"[WS DEBUG] Thread {thread_id} not found — skipping")
                    continue

                # Capture before commit — commit expires all ORM objects
                thread_type = thread.type
                sender_id = uuid.UUID(current_user.id)

                msg = Message(
                    thread_id=thread_id,
                    sender_id=sender_id,
                    sender_type=SenderType.user,
                    content=content,
                )
                db.add(msg)
                _touch_thread(db, thread)
                db.commit()
                db.refresh(msg)

                outbound = {"type": "message", "data": _msg_to_schema(msg).model_dump(mode="json")}
                await _manager.broadcast(str(thread_id), outbound)

                print(f"[WS DEBUG] Message saved — thread={thread_id}, sender={sender_id}, thread_type={thread_type}", flush=True)
                if thread_type == ThreadType.user:
                    sender_profile = db.get(UserProfile, sender_id)
                    if sender_profile:
                        try:
                            _notify_recipients_by_email(db, cfg, thread_id, sender_id, sender_profile, message_content=content)
                        except Exception as exc:
                            print(f"[WS DEBUG] Email notification raised an exception: {exc!r}", flush=True)
                    else:
                        print(f"[WS DEBUG] No sender profile found for {sender_id} — skipping email", flush=True)
                else:
                    print(f"[WS DEBUG] Thread type is {thread_type!r}, not 'user' — no email sent", flush=True)

            elif event_type == "typing":
                is_typing = bool(event.get("is_typing", False))
                outbound = {
                    "type": "typing",
                    "user_id": current_user.id,
                    "is_typing": is_typing,
                }
                await _manager.broadcast(str(thread_id), outbound, exclude=websocket)

            elif event_type == "read":
                message_id = event.get("message_id")
                if message_id:
                    msg = db.get(Message, uuid.UUID(message_id))
                    if msg and msg.thread_id == thread_id and msg.read_at is None:
                        msg.read_at = datetime.now(timezone.utc)
                        db.commit()
                    outbound = {
                        "type": "read_receipt",
                        "message_id": message_id,
                        "user_id": current_user.id,
                    }
                    await _manager.broadcast(str(thread_id), outbound, exclude=websocket)

    except WebSocketDisconnect:
        print(f"[WS DEBUG] User {current_user.id} disconnected from thread {thread_id}", flush=True)
    except Exception as exc:
        print(f"[WS DEBUG] UNHANDLED EXCEPTION in WS handler for user {current_user.id}: {exc!r}", flush=True)
        import traceback
        traceback.print_exc()
    finally:
        _manager.disconnect(str(thread_id), current_user.id, websocket)
