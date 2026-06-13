"""
Voice + rPPG check-in session router.

POST /api/checkup/start-session       – start a new voice session, return questions
POST /api/checkup/transcribe-answer   – transcribe one spoken answer via Whisper
POST /api/checkup/finish-session      – AI note cleanup, merge rPPG, save, return result
GET  /api/checkup/voice-latest        – latest combined voice+rPPG result
GET  /api/checkup/voice-history       – recent combined results
POST /api/checkup/mock-voice-session  – realistic mock (no OpenAI/camera required)
"""

import json
import logging
import random
import tempfile
import uuid as _uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.session import get_db
from app.dependencies import CurrentUser, get_current_user, require_patient_role
from app.models.user import HealthRecord, UserProfile
from rppg import storage

logger = logging.getLogger(__name__)
router = APIRouter(tags=["voice-checkup"])

Cfg = Annotated[Settings, Depends(get_settings)]
Auth = Annotated[CurrentUser, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]

OPENAI_MODEL = "gpt-4o-mini"

# ── In-memory session store (MVP — single server) ────────────────────────────
_SESSIONS: dict[str, dict] = {}

# ── Questions ────────────────────────────────────────────────────────────────
# Always-included safety questions (never dropped)
SAFETY_QUESTIONS = [
    {"id": "symptoms_check",  "question": "Do you feel your heart racing, shortness of breath, chest pain, dizziness, or anything unusual?"},
    {"id": "urgent_symptoms", "question": "Have you had any severe headache, vision changes, heavy bleeding, or reduced fetal movement today?"},
]

# Full question bank — GPT picks the best 3 to pair with the 2 safety questions
QUESTION_BANK = [
    {"id": "feeling_now",        "question": "How are you feeling right now?"},
    {"id": "activity_before",    "question": "Did you rest quietly before starting, or were you recently active?"},
    {"id": "care_team_notes",    "question": "Is there anything you want your care team to know?"},
    {"id": "sleep_quality",      "question": "How has your sleep been lately?"},
    {"id": "hydration",          "question": "Have you been staying hydrated and eating regularly today?"},
    {"id": "stress_mood",        "question": "How has your mood or stress level been?"},
    {"id": "swelling",           "question": "Have you noticed any swelling in your hands, feet, or face?"},
    {"id": "fetal_movement",     "question": "Have you felt your baby moving today?"},
    {"id": "pain_discomfort",    "question": "Are you experiencing any pain or unusual discomfort?"},
    {"id": "medications",        "question": "Have you taken your medications or supplements as usual today?"},
]

# Fallback when no user or no API key
DEFAULT_QUESTIONS = [
    {"id": "feeling_now",     "question": "How are you feeling right now?"},
    {"id": "activity_before", "question": "Did you rest quietly before starting, or were you recently active?"},
    {"id": "symptoms_check",  "question": "Do you feel your heart racing, shortness of breath, chest pain, dizziness, or anything unusual?"},
    {"id": "urgent_symptoms", "question": "Have you had any severe headache, vision changes, heavy bleeding, or reduced fetal movement today?"},
    {"id": "care_team_notes", "question": "Is there anything you want your care team to know?"},
]

QUESTION_PERSONALIZATION_PROMPT = """\
You are NatalNanny, a maternal wellness assistant. Select and lightly personalize exactly 5 check-in questions for this user's wellness session.

Rules:
- ALWAYS include symptoms_check and urgent_symptoms — they are safety-critical and must appear last.
- Choose the best 3 from the question bank based on: recent symptom history, gestational week, known risk factors, and gaps in recent check-ins.
- You may lightly rephrase a question to feel personal (e.g. reference the user's name or week), but keep it concise and warm.
- Return ONLY valid JSON: {"questions": [{"id": "...", "question": "..."}]}
- Use only IDs from the provided bank. Do not invent new IDs.
"""

URGENT_NOTICE = (
    "Seek urgent medical care for chest pain, trouble breathing, fainting, "
    "seizure, severe headache, vision changes, heavy bleeding, or reduced fetal movement."
)

NOTE_CLEANUP_SYSTEM_PROMPT = """\
You are NatalNanny, a maternal wellness assistant.

Clean up the user's spoken check-in answers into a concise, supportive wellness note.

Rules:
- Do not diagnose.
- Do not make medical claims.
- Do not claim the camera measured blood pressure, SpO2, respiratory rate, or disease risk.
- Use cautious wording: "reported", "estimated", "may explain", "consider sharing with care team".
- Return ONLY valid JSON matching the schema below. No markdown, no explanation.

Schema:
{
  "cleaned_note": "string",
  "symptoms_reported": {
    "shortness_of_breath": false,
    "chest_pain": false,
    "dizziness": false,
    "severe_headache": false,
    "vision_changes": false,
    "heavy_bleeding": false,
    "reduced_fetal_movement": false,
    "fever_or_chills": false,
    "mood_concern": false
  },
  "possible_context_for_metrics": ["string"],
  "care_team_summary": "string",
  "suggested_next_step": "string",
  "requires_urgent_notice": false,
  "urgent_notice_reason": null
}
"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _session_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def get_user_context_for_session(user_id: Optional[str], db: Optional[Session] = None) -> dict:
    """Build user context from DB profile, health record, and recent check-in history."""
    ctx: dict = {
        "name": None,
        "gestational_week": None,
        "due_date": None,
        "care_team": None,
        "known_risk_factors": [],
        "recent_checkins": [],
    }

    if user_id and db:
        try:
            profile = db.get(UserProfile, _uuid.UUID(user_id))
            if profile:
                ctx["name"] = profile.first_name
        except Exception as exc:
            logger.warning("Profile fetch failed: %s", exc)

        try:
            health = db.query(HealthRecord).filter(
                HealthRecord.user_id == _uuid.UUID(user_id)
            ).first()
            if health and health.data:
                d = health.data
                ctx["gestational_week"] = d.get("gestational_week")
                ctx["due_date"] = d.get("due_date")
                ctx["care_team"] = d.get("care_team")
                ctx["known_risk_factors"] = d.get("risk_factors") or []
        except Exception as exc:
            logger.warning("Health record fetch failed: %s", exc)

    # Pull the 3 most recent voice check-ins from local JSON storage
    try:
        recent = storage.get_voice_history(limit=3)
        ctx["recent_checkins"] = [
            {
                "date": r.get("created_at", "")[:10],
                "symptoms_flagged": [
                    k for k, v in (
                        (r.get("voice_checkin") or {}).get("symptoms_reported") or {}
                    ).items() if v
                ],
                "requires_urgent": bool(
                    (r.get("voice_checkin") or {}).get("requires_urgent_notice")
                ),
                "cleaned_note_excerpt": (
                    ((r.get("voice_checkin") or {}).get("cleaned_note") or "")[:200]
                ),
            }
            for r in recent
        ]
    except Exception as exc:
        logger.warning("History fetch failed: %s", exc)

    return ctx


async def _generate_personalized_questions(user_ctx: dict, api_key: str) -> list[dict]:
    """Ask GPT-4o-mini to pick the best 5 questions for this user from the question bank."""
    try:
        from openai import AsyncOpenAI  # type: ignore[import]
    except ImportError:
        return DEFAULT_QUESTIONS

    bank_text = json.dumps(QUESTION_BANK + SAFETY_QUESTIONS, indent=2)
    user_prompt = (
        f"User context:\n{json.dumps(user_ctx, indent=2)}\n\n"
        f"Question bank (choose from these IDs only):\n{bank_text}"
    )

    try:
        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": QUESTION_PERSONALIZATION_PROMPT},
                {"role": "user",   "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        parsed = json.loads(response.choices[0].message.content or "{}")
        questions = parsed.get("questions", [])
        # Validate: must have exactly 5 items with id + question strings
        if (
            len(questions) == 5
            and all(isinstance(q.get("id"), str) and isinstance(q.get("question"), str) for q in questions)
        ):
            return questions
    except Exception as exc:
        logger.warning("Question personalization failed, using defaults: %s", exc)

    return DEFAULT_QUESTIONS


def _default_symptoms() -> dict:
    return {
        "shortness_of_breath": False,
        "chest_pain": False,
        "dizziness": False,
        "severe_headache": False,
        "vision_changes": False,
        "heavy_bleeding": False,
        "reduced_fetal_movement": False,
        "fever_or_chills": False,
        "mood_concern": False,
    }


async def _transcribe_audio(audio_path: str, api_key: str) -> str:
    """Call OpenAI Whisper. Returns transcript string or raises."""
    try:
        from openai import AsyncOpenAI  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError("openai package not installed") from exc

    client = AsyncOpenAI(api_key=api_key)
    with open(audio_path, "rb") as f:
        result = await client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="text",
        )
    return str(result).strip()


async def _run_note_cleanup(
    answers: list[dict],
    rppg_result: Optional[dict],
    user_ctx: dict,
    api_key: str,
) -> dict:
    """Call GPT-4o to produce cleaned voice notes. Falls back to raw on failure."""
    raw_transcript = "\n\n".join(
        f"Q: {a.get('question', '')}\nA: {a.get('raw_transcript', '')}"
        for a in answers
    )

    # Build user prompt
    rppg_summary = json.dumps(
        {
            "estimated_pulse_bpm": (
                (rppg_result or {}).get("checkup_summary", {}).get("estimated_pulse_bpm")
                or (rppg_result or {}).get("rppg_analysis", {}).get("consensus", {}).get("estimated_pulse_bpm")
            ),
            "pulse_category": (
                (rppg_result or {}).get("checkup_summary", {}).get("pulse_category")
                or (rppg_result or {}).get("rppg_analysis", {}).get("consensus", {}).get("pulse_category")
            ),
            "signal_quality": (
                (rppg_result or {}).get("signal_quality", {}).get("overall")
                or (rppg_result or {}).get("rppg_analysis", {}).get("signal_quality", {}).get("label")
            ),
        },
        indent=2,
    ) if rppg_result else "No rPPG data available."

    user_prompt = (
        f"User knowledge base:\n{json.dumps(user_ctx, indent=2)}\n\n"
        f"rPPG result:\n{rppg_summary}\n\n"
        f"Questions and transcripts:\n{raw_transcript}"
    )

    try:
        from openai import AsyncOpenAI  # type: ignore[import]

        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": NOTE_CLEANUP_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        parsed = json.loads(response.choices[0].message.content or "{}")
    except Exception as exc:
        logger.warning("Note cleanup failed: %s", exc)
        parsed = {}

    symptoms = {**_default_symptoms(), **parsed.get("symptoms_reported", {})}
    requires_urgent = bool(parsed.get("requires_urgent_notice") or any([
        symptoms.get("chest_pain"),
        symptoms.get("shortness_of_breath"),
        symptoms.get("severe_headache"),
        symptoms.get("vision_changes"),
        symptoms.get("heavy_bleeding"),
        symptoms.get("reduced_fetal_movement"),
    ]))

    return {
        "questions_asked": [
            {
                "id": a.get("question_id", ""),
                "question": a.get("question", ""),
                "raw_transcript": a.get("raw_transcript", ""),
                "cleaned_answer": a.get("raw_transcript", ""),
            }
            for a in answers
        ],
        "raw_full_transcript": raw_transcript,
        "cleaned_note": parsed.get(
            "cleaned_note",
            f"User completed a camera-based wellness check-in. {raw_transcript[:300]}"
        ),
        "symptoms_reported": symptoms,
        "possible_context_for_metrics": parsed.get("possible_context_for_metrics", []),
        "care_team_summary": parsed.get(
            "care_team_summary",
            "Voice check-in completed. No AI summary available — raw transcript saved."
        ),
        "suggested_next_step": parsed.get(
            "suggested_next_step",
            "Continue your daily check-ins and share trends with your care team."
        ),
        "requires_urgent_notice": requires_urgent,
        "urgent_notice_reason": parsed.get("urgent_notice_reason") if requires_urgent else None,
    }


def _build_combined_result(
    session_id: str,
    created_at: str,
    duration_seconds: float,
    completed_reason: str,
    rppg_result: Optional[dict],
    voice_checkin: dict,
    user_ctx: dict,
) -> dict:
    cs = (rppg_result or {}).get("checkup_summary") or {}
    sq = (rppg_result or {}).get("signal_quality") or {}

    estimated_pulse = (
        cs.get("estimated_pulse_bpm")
        or (rppg_result or {}).get("rppg_analysis", {}).get("consensus", {}).get("estimated_pulse_bpm")
    )
    pulse_cat = (
        cs.get("pulse_category")
        or (rppg_result or {}).get("rppg_analysis", {}).get("consensus", {}).get("pulse_category")
    )
    sig_quality = sq.get("overall") or (rppg_result or {}).get("rppg_analysis", {}).get("signal_quality", {}).get("label")

    mwi = (rppg_result or {}).get("maternal_wellness_interpretation") or {}
    suggested_step = voice_checkin.get("suggested_next_step") or mwi.get("suggested_next_step", "")
    cleaned_note = voice_checkin.get("cleaned_note", "")
    care_team_summary = voice_checkin.get("care_team_summary", "")

    session_notes = {
        "title": "Your NatalNanny Check-In Notes",
        "summary": (
            "Today's check-in combined your camera-based pulse estimate with your voice answers. "
            "Not a diagnosis. Share trends with your care team."
        ),
        "cleaned_note": cleaned_note,
        "care_team_summary": care_team_summary,
    }

    return {
        "session_id": session_id,
        "created_at": created_at,
        "duration_seconds": duration_seconds,
        "completed_reason": completed_reason,
        "source": {
            "pipeline": "rPPG-Toolbox + OpenAI voice check-in",
            "mode": "voice_rppg_maternal_wellness_mvp",
            "ground_truth_used": False,
        },
        # rPPG data — embed the full upstream result for the frontend ResultsSummary component
        **(rppg_result or {}),
        # Voice check-in overlay
        "voice_checkin": voice_checkin,
        "user_context_used": {
            "gestational_week": user_ctx.get("gestational_week"),
            "care_team": user_ctx.get("care_team"),
            "recent_checkins_used": bool(user_ctx.get("recent_checkins")),
        },
        "session_notes_for_user": session_notes,
        "storage": {
            "saved_local_json": True,
            "local_json_path": f"backend/rppg/output/{session_id}/results.json",
            "saved_supabase": False,
            "supabase_table": "checkup_sessions",
        },
        "medical_notice": "Estimated wellness signal only, not diagnostic.",
        "safety": {
            "not_diagnostic": True,
            "disclaimer": (
                "This is a camera-based wellness signal, not a medical diagnosis. "
                "Estimated pulse is for informational use only. Share trends with your care team."
            ),
            "urgent_notice": URGENT_NOTICE,
        },
    }


def _build_mock_voice_session(session_id: str) -> dict:
    hr = round(78 + random.uniform(-8, 15), 1)
    created_at = _now_iso()

    mock_answers = [
        {"question_id": "feeling_now",     "question": "How are you feeling right now?",                   "raw_transcript": "I'm feeling pretty good today, just a little tired from last night."},
        {"question_id": "activity_before", "question": "Did you rest quietly before starting?",             "raw_transcript": "Yes, I was sitting on the couch for about ten minutes before starting."},
        {"question_id": "symptoms_check",  "question": "Any heart racing, shortness of breath, or dizziness?", "raw_transcript": "No, none of that. I feel okay."},
        {"question_id": "urgent_symptoms", "question": "Any severe headache, vision changes, or heavy bleeding?", "raw_transcript": "No, nothing like that."},
        {"question_id": "care_team_notes", "question": "Anything for your care team?",                      "raw_transcript": "Just that I've been a bit more tired than usual this week."},
    ]

    voice_checkin = {
        "questions_asked": [
            {**a, "id": a["question_id"], "cleaned_answer": a["raw_transcript"]}
            for a in mock_answers
        ],
        "raw_full_transcript": "\n\n".join(
            f"Q: {a['question']}\nA: {a['raw_transcript']}" for a in mock_answers
        ),
        "cleaned_note": (
            "User completed a camera-based wellness check-in. "
            "Reported feeling generally well with mild fatigue. "
            "Rested quietly before the check-in. No acute symptoms reported. "
            "User noted increased tiredness this week."
        ),
        "symptoms_reported": _default_symptoms(),
        "possible_context_for_metrics": [
            "User reported mild fatigue which may contribute to slightly elevated pulse if present.",
            "Rested before check-in — pulse reading reflects a closer resting state.",
        ],
        "care_team_summary": (
            f"Estimated pulse was approximately {hr:.1f} bpm for this resting check-in. "
            "User reported mild fatigue but no acute symptoms. "
            "No urgent symptoms reported. User mentioned increased tiredness this week."
        ),
        "suggested_next_step": (
            "Continue daily check-ins and share your trend history at your next appointment. "
            "If fatigue persists or worsens, mention it to Dr. Rivera."
        ),
        "requires_urgent_notice": False,
        "urgent_notice_reason": None,
    }

    from app.routers.rppg import _make_full_result
    rppg = _make_full_result(session_id, hr, "good", created_at)

    result = _build_combined_result(
        session_id=session_id,
        created_at=created_at,
        duration_seconds=120,
        completed_reason="answered_all_questions",
        rppg_result=rppg,
        voice_checkin=voice_checkin,
        user_ctx=get_user_context_for_session(),
    )
    result["storage"]["saved_supabase"] = False
    result["_is_mock"] = True
    return result


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class AnswerPayload(BaseModel):
    question_id: str
    question: str
    raw_transcript: str


class FinishSessionRequest(BaseModel):
    session_id: str
    rppg_result: Optional[dict] = None
    duration_seconds: Optional[float] = 120
    completed_reason: Optional[str] = "time_limit_reached"
    answers: Optional[list[AnswerPayload]] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/checkup/start-session")
async def start_session(cfg: Cfg, current_user: Auth, db: DB) -> dict:
    """Create an in-memory voice session with AI-personalized questions."""
    require_patient_role(db, current_user.id)
    sid = _session_id()
    user_id = current_user.id

    # Build context from real DB + history, then let GPT pick the best questions
    user_ctx = get_user_context_for_session(user_id, db)
    if cfg.openai_api_key:
        questions = await _generate_personalized_questions(user_ctx, cfg.openai_api_key)
    else:
        questions = DEFAULT_QUESTIONS

    _SESSIONS[sid] = {
        "session_id": sid,
        "user_id": user_id,
        "questions": questions,
        "user_ctx": user_ctx,
        "answers": [],
        "started_at": _now_iso(),
        "status": "active",
    }
    return {
        "session_id": sid,
        "status": "started",
        "max_duration_seconds": 120,
        "questions": questions,
    }


@router.post("/checkup/transcribe-answer")
async def transcribe_answer(
    cfg: Cfg,
    current_user: Auth,
    db: DB,
    session_id: str = Form(...),
    question_id: str = Form(...),
    audio: UploadFile = File(...),
) -> dict:
    """Transcribe one spoken answer with OpenAI Whisper and store it in the session."""
    require_patient_role(db, current_user.id)
    session = _SESSIONS.get(session_id)
    if session is None:
        # Session expired or server restarted — create stub with default questions
        session = {
            "session_id": session_id,
            "user_id": current_user.id,
            "questions": DEFAULT_QUESTIONS,
            "answers": [],
            "started_at": _now_iso(),
        }
        _SESSIONS[session_id] = session

    session_questions: list[dict] = session.get("questions") or DEFAULT_QUESTIONS

    # Find matching question text
    q_text = next((q["question"] for q in session_questions if q["id"] == question_id), question_id)

    # Save audio to a temp file
    suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
    transcript = "[Transcription unavailable]"
    transcription_error: Optional[str] = None

    if not cfg.openai_api_key:
        transcription_error = "OPENAI_API_KEY not configured on server"
    else:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await audio.read())
            tmp_path = tmp.name
        try:
            transcript = await _transcribe_audio(tmp_path, cfg.openai_api_key)
        except Exception as exc:
            transcription_error = str(exc)
            logger.warning("Transcription error: %s", exc)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    # Store answer
    answer = {
        "question_id": question_id,
        "question": q_text,
        "raw_transcript": transcript,
    }
    session["answers"].append(answer)

    # Determine next question
    answered_ids = {a["question_id"] for a in session["answers"]}
    next_question = next(
        (q for q in session_questions if q["id"] not in answered_ids), None
    )
    questions_remaining = sum(1 for q in session_questions if q["id"] not in answered_ids)

    response: dict[str, Any] = {
        "question_id": question_id,
        "transcript": transcript,
        "next_question": next_question,
        "questions_remaining": questions_remaining,
        "all_questions_answered": questions_remaining == 0,
    }
    if transcription_error:
        response["transcription_error"] = transcription_error
    return response


@router.post("/checkup/finish-session")
async def finish_session(payload: FinishSessionRequest, cfg: Cfg, current_user: Auth, db: DB) -> dict:
    """
    Clean up voice notes with AI, merge with rPPG result, save locally + Supabase.
    """
    require_patient_role(db, current_user.id)
    session = _SESSIONS.get(payload.session_id, {})

    # Resolve user_id: JWT > session store
    user_id: str = current_user.id or session.get("user_id", "")

    # Use answers from payload (authoritative) or from in-memory session
    answers: list[dict] = (
        [a.model_dump() for a in payload.answers]
        if payload.answers
        else session.get("answers", [])
    )

    # Use context stored at session start (already fetched from DB); re-fetch if missing
    user_ctx = session.get("user_ctx") or get_user_context_for_session(user_id, db)

    if not cfg.openai_api_key:
        logger.warning("OPENAI_API_KEY not set — skipping AI note cleanup")
        voice_checkin = await _run_note_cleanup(answers, payload.rppg_result, user_ctx, "")
        voice_checkin["ai_cleanup_skipped"] = True
        voice_checkin["ai_cleanup_reason"] = "OPENAI_API_KEY not configured"
    else:
        voice_checkin = await _run_note_cleanup(answers, payload.rppg_result, user_ctx, cfg.openai_api_key)

    result = _build_combined_result(
        session_id=payload.session_id,
        created_at=session.get("started_at", _now_iso()),
        duration_seconds=payload.duration_seconds or 120,
        completed_reason=payload.completed_reason or "time_limit_reached",
        rppg_result=payload.rppg_result,
        voice_checkin=voice_checkin,
        user_ctx=user_ctx,
    )

    # Save locally
    try:
        storage.save_checkup_result(result)
        result["storage"]["saved_local_json"] = True
    except Exception as exc:
        logger.error("Local save failed: %s", exc)
        result["storage"]["saved_local_json"] = False
        result["storage"]["local_save_error"] = str(exc)

    # Save to Supabase (three tables)
    if cfg.supabase_url and cfg.supabase_service_role_key:
        errors: list[str] = []
        url, key = cfg.supabase_url, cfg.supabase_service_role_key

        # 1. rppg_results — flat signal metrics
        try:
            storage.save_rppg_result_supabase(result, url, key, user_id=user_id)
        except Exception as exc:
            logger.warning("rppg_results save failed: %s", exc)
            errors.append(f"rppg_results: {exc}")

        # 2. checkin_voice_notes + checkin_answers — voice Q&A
        try:
            storage.save_voice_checkin_supabase(result, url, key, user_id=user_id)
        except Exception as exc:
            logger.warning("checkin tables save failed: %s", exc)
            errors.append(f"checkin_tables: {exc}")

        # 3. checkup_sessions — full JSON backup
        try:
            storage.save_checkup_result_supabase(result, url, key, cfg.supabase_checkup_table, user_id=user_id)
        except Exception as exc:
            logger.warning("checkup_sessions save failed: %s", exc)
            errors.append(f"checkup_sessions: {exc}")

        if errors:
            result["storage"]["saved_supabase"] = False
            result["storage"]["supabase_error"] = "; ".join(errors)
        else:
            result["storage"]["saved_supabase"] = True
    else:
        result["storage"]["saved_supabase"] = False
        result["storage"]["supabase_error"] = "Supabase not configured"

    _SESSIONS.pop(payload.session_id, None)
    return result


_RPPG_RESULTS_COLUMNS = (
    "session_id,created_at,duration_seconds,completed_reason,"
    "source_pipeline,source_mode,"
    "estimated_pulse_bpm,pulse_category,pulse_label,confidence,"
    "retake_recommended,retake_reasons,"
    "pos_hr_bpm,chrom_hr_bpm,green_hr_bpm,consensus_hr_bpm,"
    "hr_trend,mean_window_bpm,min_window_bpm,max_window_bpm,"
    "range_window_bpm,std_window_bpm,window_values_bpm,window_size_seconds,"
    "pos_chrom_diff_bpm,pos_green_diff_bpm,chrom_green_diff_bpm,"
    "agreement_quality,outlier_methods,"
    "signal_quality_overall,method_agreement_quality,hr_stability,"
    "waveform_strength,snr_like_score,dominant_frequency_hz,"
    "dominant_frequency_bpm,waveform_sample_count,valid_window_count,"
    "face_detected,multiple_faces_detected,recording_duration_seconds,"
    "estimated_fps,frame_count,resolution,"
    "wellness_score,wellness_message,suggested_next_step,"
    "exp_rr_status,exp_rr_value_bpm,"
    "exp_bp_status,exp_bp_systolic,exp_bp_diastolic,"
    "exp_spo2_status,exp_spo2_value_pct,"
    "exp_pwv_status,exp_pwv_delay_ms"
)


def _rppg_row_to_checkup_result(row: dict, voice_note: Optional[dict] = None) -> dict:
    """Convert a rppg_results Supabase row into a complete CheckupResult-compatible dict."""
    pulse_bpm = row.get("estimated_pulse_bpm")
    signal_q = row.get("signal_quality_overall") or "unknown"
    wellness = row.get("wellness_score") or 0
    trend = row.get("hr_trend") or "stable"
    duration = row.get("recording_duration_seconds") or 0.0
    fps = row.get("estimated_fps") or 0.0
    frame_count = row.get("frame_count") or 0
    snr = row.get("snr_like_score") or 0.0

    result: dict = {
        "session_id": row.get("session_id", ""),
        "created_at": row.get("created_at", ""),
        "duration_seconds": row.get("duration_seconds"),
        "completed_reason": row.get("completed_reason"),
        "source": {
            "pipeline": row.get("source_pipeline") or "",
            "mode": row.get("source_mode") or "",
            "ground_truth_used": False,
        },
        "checkup_summary": {
            "estimated_pulse_bpm": pulse_bpm,
            "pulse_category": row.get("pulse_category") or "unknown",
            "pulse_label": row.get("pulse_label") or "",
            "confidence": row.get("confidence") or "medium",
            "retake_recommended": bool(row.get("retake_recommended")),
        },
        "heart_rate_statistics": {
            "primary_method": "",
            "backup_method": "",
            "baseline_method": "",
            "consensus_method": "",
            "heart_rate_by_method": {
                "POS": row.get("pos_hr_bpm"),
                "CHROM": row.get("chrom_hr_bpm"),
                "GREEN": row.get("green_hr_bpm"),
            },
            "consensus_heart_rate_bpm": row.get("consensus_hr_bpm"),
            "window_size_seconds": row.get("window_size_seconds") or 10,
            "window_values_bpm": row.get("window_values_bpm") or [],
            "mean_window_bpm": row.get("mean_window_bpm"),
            "min_window_bpm": row.get("min_window_bpm"),
            "max_window_bpm": row.get("max_window_bpm"),
            "range_window_bpm": row.get("range_window_bpm"),
            "std_window_bpm": row.get("std_window_bpm"),
            "trend": trend,
        },
        "method_agreement": {
            "pos_chrom_difference_bpm": row.get("pos_chrom_diff_bpm"),
            "pos_green_difference_bpm": row.get("pos_green_diff_bpm"),
            "chrom_green_difference_bpm": row.get("chrom_green_diff_bpm"),
            "green_difference_from_consensus_bpm": None,
            "outlier_methods": row.get("outlier_methods") or [],
            "agreement_quality": row.get("agreement_quality") or "unknown",
        },
        "rppg_waveform_statistics": {
            "waveform_available": snr > 0,
            "waveform_sample_count": row.get("waveform_sample_count"),
            "dominant_frequency_hz": row.get("dominant_frequency_hz"),
            "dominant_frequency_bpm": row.get("dominant_frequency_bpm"),
            "peak_power": None,
            "average_band_power": None,
            "snr_like_score": snr or None,
            "valid_window_count": row.get("valid_window_count") or 0,
        },
        "signal_quality": {
            "overall": signal_q,
            "method_agreement": row.get("method_agreement_quality") or "unknown",
            "hr_stability": row.get("hr_stability") or "unknown",
            "waveform_strength": row.get("waveform_strength") or "unknown",
            "face_detected": bool(row.get("face_detected", True)),
            "multiple_faces_detected": bool(row.get("multiple_faces_detected", False)),
            "recording_duration_seconds": duration,
            "estimated_fps": fps,
        },
        "recording_quality": {
            "face_detected": bool(row.get("face_detected", True)),
            "multiple_faces_detected": bool(row.get("multiple_faces_detected", False)),
            "recording_duration_seconds": duration,
            "frame_count": frame_count,
            "estimated_fps": fps,
            "resolution": row.get("resolution") or "—",
            "retake_recommended": bool(row.get("retake_recommended")),
            "retake_reasons": row.get("retake_reasons") or [],
        },
        "maternal_wellness_interpretation": {
            "wellness_score": wellness,
            "score_label": None,
            "message": row.get("wellness_message"),
            "suggested_next_step": row.get("suggested_next_step"),
            "escalation_note": None,
        },
        # Legacy compat fields
        "recording": {
            "duration_seconds": duration,
            "frame_count": frame_count,
            "estimated_fps": fps,
            "video_path": "",
        },
        "rppg_analysis": {
            "methods": {
                "pos": {
                    "hr_bpm": row.get("pos_hr_bpm"),
                    "snr": None,
                    "status": "ok" if row.get("pos_hr_bpm") else "unavailable",
                },
                "chrom": {
                    "hr_bpm": row.get("chrom_hr_bpm"),
                    "snr": None,
                    "status": "ok" if row.get("chrom_hr_bpm") else "unavailable",
                },
                "green": {
                    "hr_bpm": row.get("green_hr_bpm"),
                    "snr": None,
                    "status": "ok" if row.get("green_hr_bpm") else "unavailable",
                },
            },
            "consensus": {
                "estimated_pulse_bpm": pulse_bpm,
                "pulse_category": row.get("pulse_category") or "unknown",
                "pulse_label": row.get("pulse_label") or "",
                "method_agreement": row.get("agreement_quality") or "unknown",
                "retake_recommended": bool(row.get("retake_recommended")),
            },
            "signal_quality": {
                "label": signal_q,
                "best_snr": snr,
                "wellness_score": wellness,
            },
            "check_in_trend": trend,
        },
        "safety": {
            "not_diagnostic": True,
            "disclaimer": "Wellness signal only.",
            "urgent_notice": (
                "Seek urgent medical care for chest pain, trouble breathing, fainting, "
                "seizure, severe headache, vision changes, heavy bleeding, or reduced fetal movement."
            ),
        },
    }

    # Reconstruct experimental_vitals from stored columns
    result["experimental_vitals"] = {
        "respiratory_rate": {
            "status": row.get("exp_rr_status") or "unavailable",
            "value_breaths_per_min": row.get("exp_rr_value_bpm"),
            "method": None,
            "confidence": "unavailable" if row.get("exp_rr_value_bpm") is None else "medium",
            "confidence_score": None,
            "valid_range_breaths_per_min": None,
            "notes": [
                "May require a supervised multitask model such as BigSmall or additional validated signal processing."
                if row.get("exp_rr_value_bpm") is None
                else "Camera-derived estimate."
            ],
        },
        "blood_pressure": {
            "status": row.get("exp_bp_status") or "disabled_or_requires_calibration",
            "systolic_mmHg": row.get("exp_bp_systolic"),
            "diastolic_mmHg": row.get("exp_bp_diastolic"),
            "method": None,
            "confidence": "unavailable",
            "notes": [
                "Camera-only blood pressure estimation requires validated calibration/modeling or cuff integration."
            ],
        },
        "spo2": {
            "status": row.get("exp_spo2_status") or "disabled_or_requires_calibration",
            "value_percent": row.get("exp_spo2_value_pct"),
            "method": None,
            "confidence": "unavailable",
            "notes": [
                "SpO2 requires a validated optical sensor or calibrated model. Do not present it as measured from webcam."
            ],
        },
        "pulse_wave_velocity": {
            "status": row.get("exp_pwv_status") or "not_available_single_roi",
            "value_m_per_s": None,
            "pulse_arrival_delay_ms": row.get("exp_pwv_delay_ms"),
            "method": None,
            "confidence": "unavailable",
            "notes": [
                "Requires timing between multiple pulse sites or additional sensors."
            ],
        },
        "disclaimer": (
            "These are experimental camera-derived wellness estimates for "
            "proof-of-concept only and are not diagnostic."
        ),
    }

    if voice_note:
        result["voice_checkin"] = {
            "questions_asked": [],
            "raw_full_transcript": "",
            "cleaned_note": voice_note.get("cleaned_note") or "",
            "symptoms_reported": {
                "shortness_of_breath": bool(voice_note.get("symptom_shortness_of_breath")),
                "chest_pain": bool(voice_note.get("symptom_chest_pain")),
                "dizziness": bool(voice_note.get("symptom_dizziness")),
                "severe_headache": bool(voice_note.get("symptom_severe_headache")),
                "vision_changes": bool(voice_note.get("symptom_vision_changes")),
                "heavy_bleeding": bool(voice_note.get("symptom_heavy_bleeding")),
                "reduced_fetal_movement": bool(voice_note.get("symptom_reduced_fetal_movement")),
                "fever_or_chills": bool(voice_note.get("symptom_fever_or_chills")),
                "mood_concern": bool(voice_note.get("symptom_mood_concern")),
            },
            "possible_context_for_metrics": voice_note.get("possible_context") or [],
            "care_team_summary": voice_note.get("care_team_summary") or "",
            "suggested_next_step": voice_note.get("suggested_next_step") or "",
            "requires_urgent_notice": bool(voice_note.get("requires_urgent_notice")),
            "urgent_notice_reason": voice_note.get("urgent_notice_reason"),
        }

    return result


@router.get("/checkup/latest-db")
async def get_latest_checkup_db(current_user: Auth, cfg: Cfg, db: DB) -> dict:
    """
    Return the most recent checkup result for the authenticated user.
    Queries Supabase rppg_results by user_id first; falls back to local JSON.
    Returns a complete CheckupResult-compatible object.
    """
    require_patient_role(db, current_user.id)

    if cfg.supabase_url and cfg.supabase_service_role_key:
        try:
            client = storage._get_supabase_client(cfg.supabase_url, cfg.supabase_service_role_key)
            resp = (
                client.table("rppg_results")
                .select(_RPPG_RESULTS_COLUMNS)
                .eq("user_id", current_user.id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if resp.data:
                row = resp.data[0]
                session_id = row.get("session_id", "")

                # Fetch voice notes for this session if available
                voice_note: Optional[dict] = None
                try:
                    vn_resp = (
                        client.table("checkin_voice_notes")
                        .select(
                            "cleaned_note,care_team_summary,suggested_next_step,"
                            "possible_context,requires_urgent_notice,urgent_notice_reason,"
                            "symptom_chest_pain,symptom_shortness_of_breath,symptom_dizziness,"
                            "symptom_severe_headache,symptom_vision_changes,symptom_heavy_bleeding,"
                            "symptom_reduced_fetal_movement,symptom_fever_or_chills,symptom_mood_concern"
                        )
                        .eq("session_id", session_id)
                        .limit(1)
                        .execute()
                    )
                    if vn_resp.data:
                        voice_note = vn_resp.data[0]
                except Exception as exc:
                    logger.warning("Voice notes fetch failed for session %s: %s", session_id, exc)

                return _rppg_row_to_checkup_result(row, voice_note)

        except Exception as exc:
            logger.warning("Supabase rppg_results query failed, falling back to local JSON: %s", exc)

    # Fallback: local JSON (covers non-voice sessions and when Supabase is unavailable)
    result = storage.get_latest_checkup_result()
    if result is None:
        raise HTTPException(status_code=404, detail="No checkup results found")
    return result


@router.get("/checkup/history-db")
async def get_checkup_history_db(current_user: Auth, cfg: Cfg, db: DB, limit: int = 60) -> list:
    """
    Return checkup history for the authenticated user from Supabase.
    Falls back to local JSON if Supabase is unavailable.
    Returns a list of complete CheckupResult-compatible objects.
    """
    require_patient_role(db, current_user.id)

    if cfg.supabase_url and cfg.supabase_service_role_key:
        try:
            client = storage._get_supabase_client(cfg.supabase_url, cfg.supabase_service_role_key)
            resp = (
                client.table("rppg_results")
                .select(_RPPG_RESULTS_COLUMNS)
                .eq("user_id", current_user.id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            if resp.data:
                # Fetch all voice notes for these sessions in one query
                session_ids = [r.get("session_id") for r in resp.data if r.get("session_id")]
                voice_notes_by_session: dict[str, dict] = {}
                if session_ids:
                    try:
                        vn_resp = (
                            client.table("checkin_voice_notes")
                            .select(
                                "session_id,cleaned_note,care_team_summary,suggested_next_step,"
                                "possible_context,requires_urgent_notice,urgent_notice_reason,"
                                "symptom_chest_pain,symptom_shortness_of_breath,symptom_dizziness,"
                                "symptom_severe_headache,symptom_vision_changes,symptom_heavy_bleeding,"
                                "symptom_reduced_fetal_movement,symptom_fever_or_chills,symptom_mood_concern"
                            )
                            .in_("session_id", session_ids)
                            .execute()
                        )
                        if vn_resp.data:
                            for vn in vn_resp.data:
                                sid = vn.get("session_id")
                                if sid:
                                    voice_notes_by_session[sid] = vn
                    except Exception as exc:
                        logger.warning("Bulk voice notes fetch failed: %s", exc)

                return [
                    _rppg_row_to_checkup_result(row, voice_notes_by_session.get(row.get("session_id", "")))
                    for row in resp.data
                ]
        except Exception as exc:
            logger.warning("Supabase history query failed, falling back to local JSON: %s", exc)

    return storage.get_checkup_history(limit=limit)


@router.get("/checkup/voice-latest")
async def get_voice_latest(current_user: Auth, db: DB) -> dict:
    require_patient_role(db, current_user.id)
    result = storage.get_latest_voice_result()
    if result is None:
        raise HTTPException(status_code=404, detail="No voice check-in results found")
    return result


@router.get("/checkup/voice-history")
async def get_voice_history(current_user: Auth, db: DB, limit: int = 30) -> list:
    require_patient_role(db, current_user.id)
    return storage.get_voice_history(limit=limit)


@router.post("/checkup/mock-voice-session")
async def mock_voice_session(current_user: Auth, db: DB) -> dict:
    """Return a realistic combined mock session — no camera or OpenAI required."""
    require_patient_role(db, current_user.id)
    sid = "mock_voice_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    result = _build_mock_voice_session(sid)
    storage.save_checkup_result(result)
    return result
