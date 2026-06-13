"""Materna conversational voice check-in endpoints.

Supports two voice backends:
1. OpenAI Realtime (ephemeral token → WebRTC in browser)
2. Gemini Live API (ephemeral token → WebSocket in browser)  ← primary
"""

import asyncio
import base64
import json
import logging
import uuid
from datetime import date, datetime, timezone
from typing import Annotated, Any

import httpx
import websockets
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.config import Settings, get_settings
from app.db.session import get_db
from app.demo_config import (
    DEMO_CURRENT_GESTATIONAL_WEEK,
    DEMO_REPORT_RECIPIENTS,
    DEMO_SESSION_SECONDS,
)
from app.dependencies import CurrentUser, get_current_user, require_patient_role
from app.models.checkin import CheckupSession, SessionStatus
from app.models.user import HealthRecord
from app.routers.dashboard import _apply_health_decay, _compute_streak, _get_profile
from app.services.agent_context import (
    build_agent_system_prompt,
    build_patient_context,
    get_recent_session_summaries,
)
from app.services.email_report import send_daily_report_email
from app.services.emergency_call import place_emergency_call
from app.services.watch_simulation import simulate_apple_watch_data

router = APIRouter(prefix="/checkup", tags=["voice-agent"])

Auth = Annotated[CurrentUser, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]
Cfg = Annotated[Settings, Depends(get_settings)]

_OPENAI_REALTIME_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions"
_REALTIME_MODEL = "gpt-4o-realtime-preview"

# Symptoms that should trigger an emergency call regardless of stated urgency level.
_CRITICAL_FLAGS = {
    "chest_pain",
    "severe_headache",
    "vision_changes",
    "heavy_bleeding",
    "reduced_fetal_movement",
    "shortness_of_breath",
}


_GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models"
    "/gemini-2.0-flash:generateContent"
)

# xAI Grok Voice Agent API
_XAI_VOICE_WS = "wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-1.0"
_XAI_VOICE    = "ara"  # warm, friendly female voice — best for maternal health

# In-memory cache: session_id (str) → system prompt
# Populated by gemini/live-token, consumed by xai-voice/ws
_PROMPT_CACHE: dict[str, str] = {}


class GeminiChatPayload(BaseModel):
    message: str
    history: list[dict[str, str]] = []
    system_prompt: str | None = None


class RealtimeStartResponse(BaseModel):
    session_id: uuid.UUID
    system_prompt: str
    patient_context: dict
    recent_summaries: list[dict]
    session_seconds: int
    token: str
    expires_at: int
    model: str


class RealtimeCompleteRequest(BaseModel):
    session_id: uuid.UUID
    full_transcript: str | None = None
    summary: dict[str, Any] | None = None
    stats: dict[str, Any] | None = None
    emergency: bool = False
    emergency_reason: str | None = None


class RealtimeCompleteResponse(BaseModel):
    status: str
    session_id: uuid.UUID
    urgency_level: str
    watch_data: dict
    email_scheduled: bool
    emergency_scheduled: bool
    mascot_health: int
    streak: int


def _gestational_week(db: Session, user_id: str) -> int:
    record = (
        db.query(HealthRecord).filter(HealthRecord.user_id == uuid.UUID(user_id)).first()
    )
    data = (record.data if record else {}) or {}
    return int(data.get("gestational_week", DEMO_CURRENT_GESTATIONAL_WEEK))


def _create_realtime_token(cfg: Settings, instructions: str) -> dict:
    if not cfg.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OPENAI_API_KEY is not configured on the server.",
        )
    try:
        resp = httpx.post(
            _OPENAI_REALTIME_SESSIONS_URL,
            headers={
                "Authorization": f"Bearer {cfg.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": _REALTIME_MODEL,
                "voice": "alloy",
                "instructions": instructions,
                "modalities": ["audio", "text"],
            },
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error("OpenAI Realtime HTTP error %s: %s", exc.response.status_code, exc.response.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI token creation failed: {exc.response.text}",
        ) from exc
    except httpx.RequestError as exc:
        logger.error("OpenAI Realtime network error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI unreachable: {exc}",
        ) from exc
    return resp.json()


@router.post("/test-emergency-call")
async def test_emergency_call(user: Auth, background_tasks: BackgroundTasks, cfg: Cfg) -> dict:
    """Dev/demo endpoint: place a test Twilio emergency call immediately.

    Uses a dummy session_id so the call still goes through with a generic message.
    """
    if not (cfg.twilio_account_sid and cfg.twilio_auth_token):
        raise HTTPException(status_code=503, detail="Twilio not configured.")
    if not cfg.emergency_call_recipient:
        raise HTTPException(status_code=503, detail="EMERGENCY_CALL_RECIPIENT not set in .env")

    from twilio.rest import Client
    from twilio.base.exceptions import TwilioRestException

    twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" rate="90%">
    Hello. This is a test call from Materna AI.
    Your Twilio emergency call system is working correctly.
    In a real emergency, this call would include the patient's health status and symptoms.
    Thank you.
  </Say>
</Response>"""
    try:
        client = Client(cfg.twilio_account_sid, cfg.twilio_auth_token)
        call = client.calls.create(
            twiml=twiml,
            to=cfg.emergency_call_recipient,
            from_=cfg.twilio_phone_number,
        )
        return {"status": "call_placed", "sid": call.sid, "to": cfg.emergency_call_recipient}
    except TwilioRestException as exc:
        raise HTTPException(status_code=502, detail=f"Twilio error: {exc.msg}") from exc


@router.post("/gemini/live-token")
async def gemini_live_token(user: Auth, db: DB, cfg: Cfg) -> dict:
    """Create a short-lived Gemini Live API ephemeral token for direct browser WebSocket audio."""
    require_patient_role(db, user.id)

    if not cfg.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GEMINI_API_KEY not configured.",
        )

    patient = build_patient_context(db, user.id)
    recent = get_recent_session_summaries(db, user.id, n=7)
    system_prompt = build_agent_system_prompt(patient, recent)

    session = CheckupSession(user_id=uuid.UUID(user.id), status=SessionStatus.in_progress)
    db.add(session)
    db.commit()
    db.refresh(session)

    # Cache prompt so the xAI voice WebSocket can look it up by session_id
    _PROMPT_CACHE[str(session.id)] = system_prompt

    return {
        "session_id": str(session.id),
        "api_key": cfg.gemini_api_key,
        "system_prompt": system_prompt,
    }


@router.post("/gemini/chat")
async def gemini_chat(payload: GeminiChatPayload, user: Auth, db: DB, cfg: Cfg) -> dict:
    """Proxy a single turn of the Gemini conversational voice agent."""
    require_patient_role(db, user.id)

    if not cfg.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GEMINI_API_KEY not configured on the server.",
        )

    # Build Gemini contents array from history + new message
    contents: list[dict] = []
    for msg in payload.history:
        role = "user" if msg.get("role") == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg.get("text", "")}]})
    contents.append({"role": "user", "parts": [{"text": payload.message}]})

    body: dict[str, Any] = {"contents": contents}
    if payload.system_prompt:
        body["system_instruction"] = {"parts": [{"text": payload.system_prompt}]}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                _GEMINI_URL,
                params={"key": cfg.gemini_api_key},
                json=body,
            )
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error("Gemini API error %s: %s", exc.response.status_code, exc.response.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini API failed: {exc.response.text}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini unreachable: {exc}",
        ) from exc

    data = resp.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Unexpected Gemini response shape: {data}",
        ) from exc

    return {"response": text}


@router.post("/realtime/start", response_model=RealtimeStartResponse)
def start_realtime_checkin(user: Auth, db: DB, cfg: Cfg) -> RealtimeStartResponse:
    """Create a session + personalized agent prompt + ephemeral Realtime token."""
    require_patient_role(db, user.id)

    patient = build_patient_context(db, user.id)
    recent = get_recent_session_summaries(db, user.id, n=7)
    system_prompt = build_agent_system_prompt(patient, recent)

    session = CheckupSession(user_id=uuid.UUID(user.id), status=SessionStatus.in_progress)
    db.add(session)
    db.commit()
    db.refresh(session)

    # Mint an ephemeral Realtime token. If the account lacks Realtime access (or the
    # key is missing) we still return the created session with an empty token so the
    # check-in page can run in demo mode rather than hard-failing.
    token = ""
    expires_at = 0
    model = _REALTIME_MODEL
    try:
        body = _create_realtime_token(cfg, system_prompt)
        secret = body.get("client_secret", {})
        token = secret.get("value", "")
        expires_at = secret.get("expires_at", 0)
        model = body.get("model", _REALTIME_MODEL)
        logger.info("Realtime token minted, model=%s, token_len=%d", model, len(token))
    except HTTPException as exc:
        logger.warning("Realtime token failed (demo mode): %s", exc.detail)

    return RealtimeStartResponse(
        session_id=session.id,
        system_prompt=system_prompt,
        patient_context=patient,
        recent_summaries=recent,
        session_seconds=DEMO_SESSION_SECONDS,
        token=token,
        expires_at=expires_at,
        model=model,
    )


def _apply_summary(session: CheckupSession, summary: dict[str, Any]) -> None:
    session.mood_label = summary.get("mood_label")
    session.mood_score = summary.get("mood_score")
    session.edinburgh_score = summary.get("edinburgh_score")
    session.symptom_flags = summary.get("symptom_flags") or []
    session.urgency_level = (summary.get("urgency_level") or "normal").lower()
    session.plain_summary = summary.get("plain_summary")
    session.clinical_note = summary.get("clinical_note")
    session.hospital_note = summary.get("hospital_note")
    session.patient_quote = summary.get("patient_quote")


@router.post("/realtime/complete", response_model=RealtimeCompleteResponse)
def complete_realtime_checkin(
    payload: RealtimeCompleteRequest,
    background_tasks: BackgroundTasks,
    user: Auth,
    db: DB,
) -> RealtimeCompleteResponse:
    """Finalize a Materna voice check-in and fire notifications."""
    require_patient_role(db, user.id)

    session = db.get(CheckupSession, payload.session_id)
    if session is None or str(session.user_id) != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    was_completed = session.status == SessionStatus.completed

    if payload.summary:
        _apply_summary(session, payload.summary)
    if payload.full_transcript is not None:
        session.full_transcript = payload.full_transcript
    if payload.stats is not None:
        session.stats = {**(session.stats or {}), **payload.stats}

    # Simulated Apple Watch layer (demo only).
    session.watch_data = simulate_apple_watch_data(_gestational_week(db, user.id))

    # Finalize status + health/streak only the first time.
    if not was_completed:
        session.status = SessionStatus.completed
        session.completed_at = datetime.now(timezone.utc)
        if session.brownie_points is None:
            session.brownie_points = 0.0
    db.flush()

    profile = _get_profile(db, user.id)
    if not was_completed:
        decayed = _apply_health_decay(profile)
        profile.mascot_health = min(100, decayed + 10)
        profile.last_checkin_date = date.today()
        profile.last_health_update = datetime.now(timezone.utc)

    streak = _compute_streak(db, user.id)
    if streak > profile.longest_streak:
        profile.longest_streak = streak

    db.commit()
    db.refresh(session)

    urgency = (session.urgency_level or "normal").lower()
    flags = set(session.symptom_flags or [])
    emergency_needed = (
        payload.emergency
        or urgency in ("urgent", "emergency")
        or bool(flags & _CRITICAL_FLAGS)
    )

    # Daily report email → send to all family/demo recipients.
    for _recipient in DEMO_REPORT_RECIPIENTS:
        background_tasks.add_task(send_daily_report_email, str(session.id), _recipient)
    if emergency_needed:
        background_tasks.add_task(
            place_emergency_call,
            str(session.id),
            payload.emergency_reason or urgency,
        )

    return RealtimeCompleteResponse(
        status="saved",
        session_id=session.id,
        urgency_level=urgency,
        watch_data=session.watch_data,
        email_scheduled=True,
        emergency_scheduled=emergency_needed,
        mascot_health=profile.mascot_health,
        streak=streak,
    )


# ── xAI Grok Voice Agent WebSocket proxy ─────────────────────────────────────
#
# Architecture (mirrors google-gemini/gemini-live-api-examples sdk pattern):
#   Browser → our /ws/xai-voice → xAI wss://api.x.ai/v1/realtime
#
# Audio flow:
#   Browser sends raw Int16 PCM bytes → we base64-encode → input_audio_buffer.append
#   xAI sends response.output_audio.delta (base64 PCM) → we decode → send binary to browser
#
# Events flow:
#   JSON text frames carry {type, inputText?, outputText?} to the browser.

@router.websocket("/xai-voice/ws")
async def xai_voice_proxy(
    websocket: WebSocket,
    session_id: str = Query(default=""),
    cfg: Settings = Depends(get_settings),
):
    """Relay WebSocket: browser ↔ xAI Grok Voice Agent (binary PCM audio + JSON events).

    The browser passes ?session_id=<uuid> (short, no URL length issues).
    The system prompt is looked up from _PROMPT_CACHE populated by gemini/live-token.
    """
    await websocket.accept()
    logger.warning("xai_voice_proxy: browser connected (session_id=%s)", session_id or "none")

    xai_key = cfg.xai_api_key
    if not xai_key:
        logger.error("xai_voice_proxy: XAI_API_KEY is not set in .env")
        await websocket.send_json({"type": "error", "message": "XAI_API_KEY not configured"})
        await websocket.close()
        return

    # ── Look up system prompt from cache ─────────────────────────────────────
    default_prompt = "You are Materna, a warm and caring maternal health AI assistant. Greet the patient warmly and ask how they are feeling today."
    prompt = _PROMPT_CACHE.pop(session_id, default_prompt) if session_id else default_prompt
    logger.warning("xai_voice_proxy: using prompt from %s (%d chars)",
                "cache" if session_id and prompt != default_prompt else "default", len(prompt))

    logger.warning("xai_voice_proxy: connecting to xAI → %s", _XAI_VOICE_WS)
    try:
        async with websockets.connect(  # type: ignore[attr-defined]
            _XAI_VOICE_WS,
            additional_headers={"Authorization": f"Bearer {xai_key}"},
            open_timeout=15,
        ) as xws:
            logger.info("xai_voice_proxy: xAI WebSocket open — waiting for session.created")

            # ── Session setup ─────────────────────────────────────────────────
            raw_init = await asyncio.wait_for(xws.recv(), timeout=12)
            init_msg = json.loads(raw_init)
            logger.info("xai_voice_proxy: got '%s' from xAI", init_msg.get("type"))

            await xws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "voice": _XAI_VOICE,
                    "instructions": prompt,
                    "turn_detection": {"type": "server_vad"},
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16",
                },
            }))

            # ── Drain session.updated / conversation.created ───────────────
            # xAI sends 2-3 ack messages after session.update before it's ready.
            # We must consume them before triggering the greeting.
            for _ in range(4):
                try:
                    ack_raw = await asyncio.wait_for(xws.recv(), timeout=3)
                    ack = json.loads(ack_raw)
                    logger.warning("xai_voice_proxy: handshake ack → %s", ack.get("type"))
                    if ack.get("type") == "session.updated":
                        break
                except asyncio.TimeoutError:
                    break

            # ── Force xAI to greet first ──────────────────────────────────
            # With server_vad, the model waits for audio before speaking.
            # Sending response.create makes it produce a greeting immediately.
            await xws.send(json.dumps({
                "type": "response.create",
                "response": {
                    "instructions": (
                        "You are Materna. Always introduce yourself as Materna, never any other name. "
                        "Greet the patient warmly by name and ask how she is feeling today. "
                        "Keep it to 1-2 sentences — natural and caring."
                    ),
                },
            }))
            logger.warning("xai_voice_proxy: response.create sent — xAI will greet now")

            # Signal frontend that the session is ready
            await websocket.send_json({"type": "setupComplete"})
            logger.warning("xai_voice_proxy: setupComplete sent — streaming begins")

            async def browser_to_xai() -> None:
                """Forward raw Int16 PCM bytes from the browser to xAI."""
                frames_sent = 0
                try:
                    while True:
                        frame = await websocket.receive()
                        if frame.get("type") == "websocket.disconnect":
                            break
                        raw_bytes: bytes | None = frame.get("bytes")
                        if raw_bytes:
                            b64 = base64.b64encode(raw_bytes).decode()
                            await xws.send(json.dumps({
                                "type": "input_audio_buffer.append",
                                "audio": b64,
                            }))
                            frames_sent += 1
                            if frames_sent % 50 == 0:
                                logger.debug("xai_voice_proxy: sent %d audio frames to xAI", frames_sent)
                except (WebSocketDisconnect, websockets.exceptions.ConnectionClosed):
                    logger.info("xai_voice_proxy: browser_to_xai done (%d frames sent)", frames_sent)

            # ── Real-time emergency detection ─────────────────────────────
            emergency_fired = False  # only call once per session
            patient_transcript: list[str] = []  # accumulate what patient says

            _EMERGENCY_PHRASES = [
                "call my husband", "call my partner", "call my family", "call my mom",
                "call someone", "call for help", "please call",
                "not feeling good", "not feeling well", "feeling very sick",
                "i need help", "i'm scared", "i feel dizzy", "i can't breathe",
                "chest pain", "chest pressure", "heavy bleeding", "can't see",
                "blurry vision", "seeing spots", "baby not moving", "baby stopped moving",
                "please help", "something is wrong",
            ]

            def _check_emergency(user_text: str) -> str | None:
                t = user_text.lower()
                for phrase in _EMERGENCY_PHRASES:
                    if phrase in t:
                        return phrase
                return None

            async def _fire_emergency(reason: str, transcript: list[str]) -> None:
                """Place Twilio call immediately, with the patient's actual words."""
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None, place_emergency_call, session_id, reason, list(transcript)
                )
                logger.warning("xai_voice_proxy: emergency call placed (%s)", reason)

            async def xai_to_browser() -> None:
                """Forward xAI responses to the browser."""
                nonlocal emergency_fired
                audio_chunks = 0
                try:
                    async for raw in xws:
                        text = raw if isinstance(raw, str) else raw.decode()
                        try:
                            msg = json.loads(text)
                        except json.JSONDecodeError:
                            continue

                        event_type: str = msg.get("type", "")
                        logger.warning("xai_voice_proxy: xAI event → %s", event_type)

                        # ── Audio chunks → raw binary frames to browser ────
                        # xAI uses "response.audio.delta" (OpenAI compat);
                        # guard against both names just in case.
                        if event_type in ("response.audio.delta", "response.output_audio.delta"):
                            delta = msg.get("delta", "")
                            if delta:
                                await websocket.send_bytes(base64.b64decode(delta))
                                audio_chunks += 1
                            continue

                        # ── Events forwarded as JSON ───────────────────────
                        event: dict[str, str] = {}

                        if event_type == "response.done":
                            logger.info("xai_voice_proxy: turn complete (%d audio chunks sent)", audio_chunks)
                            audio_chunks = 0
                            event["type"] = "turnComplete"
                        elif event_type in ("input_audio_buffer.speech_started",):
                            logger.info("xai_voice_proxy: speech detected (VAD)")
                            event["type"] = "speechStarted"
                        elif event_type == "response.audio_transcript.delta":
                            delta_text = msg.get("delta", "")
                            if delta_text:
                                event["type"] = "outputText"
                                event["outputText"] = delta_text
                        elif event_type in (
                            "conversation.item.input_audio_transcription.completed",
                            "conversation.item.input_audio_transcription.updated",
                        ):
                            # Use "transcript" field (completed event) or fallback
                            t = (msg.get("transcript") or msg.get("delta") or "").strip()
                            if t:
                                patient_transcript.append(t)
                                event["type"] = "inputText"
                                event["inputText"] = t
                                # ── Real-time emergency check ──────────────
                                if not emergency_fired:
                                    matched = _check_emergency(t)
                                    if matched:
                                        emergency_fired = True
                                        logger.warning(
                                            "xai_voice_proxy: EMERGENCY detected — '%s'", matched
                                        )
                                        asyncio.create_task(
                                            _fire_emergency(matched, patient_transcript)
                                        )
                                        # Notify the browser immediately
                                        try:
                                            await websocket.send_json({
                                                "type": "emergency",
                                                "reason": matched,
                                            })
                                        except Exception:
                                            pass
                        elif event_type == "error":
                            event["type"] = "error"
                            event["message"] = str(msg.get("error", {}).get("message", ""))
                            logger.error("xAI error event: %s", msg)

                        if event:
                            await websocket.send_json(event)

                except (WebSocketDisconnect, websockets.exceptions.ConnectionClosed):
                    pass
                except Exception as exc:
                    logger.error("xai_to_browser error: %s", exc)

            b2x = asyncio.create_task(browser_to_xai())
            x2b = asyncio.create_task(xai_to_browser())
            _done, pending = await asyncio.wait([b2x, x2b], return_when=asyncio.FIRST_COMPLETED)
            for t in pending:
                t.cancel()

    except asyncio.TimeoutError:
        logger.error("xai_voice_proxy: timed out waiting for session.created from xAI")
        try:
            await websocket.send_json({"type": "error", "message": "xAI handshake timed out"})
        except Exception:
            pass
    except (WebSocketDisconnect, websockets.exceptions.ConnectionClosed) as exc:
        logger.warning("xai_voice_proxy: connection closed (%s)", type(exc).__name__)
    except Exception as exc:
        logger.error("xai_voice_proxy error: %s: %s", type(exc).__name__, exc)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        logger.warning("xai_voice_proxy: session ended")
        try:
            await websocket.close()
        except Exception:
            pass
