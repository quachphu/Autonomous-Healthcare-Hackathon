"""Builds the Materna voice-agent system prompt + patient context.

Used by the realtime check-in endpoints. The agent runs over the OpenAI Realtime
API (voice) while rPPG captures vitals silently from the webcam.
"""

import uuid
from typing import List

from sqlalchemy.orm import Session

from app.demo_config import (
    DEMO_CURRENT_GESTATIONAL_WEEK,
    DEMO_DUE_DATE,
    DEMO_PATIENT_NAME,
)
from app.models.user import HealthRecord, UserProfile
from app.services.session_metrics import (
    recent_completed_sessions,
    session_summary_dict,
)


def build_patient_context(db: Session, user_id: str) -> dict:
    """Assemble the patient facts the agent greets/personalizes with.

    Pulls from the profile + health_record JSONB, falling back to demo defaults.
    """
    profile = db.get(UserProfile, uuid.UUID(user_id))
    record = (
        db.query(HealthRecord).filter(HealthRecord.user_id == uuid.UUID(user_id)).first()
    )
    data = (record.data if record else {}) or {}

    name = None
    if profile and profile.first_name:
        name = profile.first_name
    name = name or data.get("first_name") or DEMO_PATIENT_NAME

    return {
        "name": name,
        "gestational_week": data.get("gestational_week", DEMO_CURRENT_GESTATIONAL_WEEK),
        "due_date": data.get("due_date", DEMO_DUE_DATE),
        "risk_factors": data.get("risk_factors", "none noted"),
    }


def get_recent_session_summaries(db: Session, patient_id: str, n: int = 7) -> List[dict]:
    """Return last n completed sessions as lightweight dicts, oldest first."""
    sessions = recent_completed_sessions(db, patient_id, n=n)
    return [session_summary_dict(s) for s in reversed(sessions)]


def build_agent_system_prompt(patient: dict, recent_sessions: List[dict]) -> str:
    """Build the Materna voice-agent system prompt for today's morning check-in."""

    history_text = ""
    if recent_sessions:
        for s in recent_sessions:
            flags = ", ".join(s.get("symptom_flags", [])) or "none reported"
            history_text += (
                f"\n- {s['date']}: HR {s.get('hr_bpm', '?')} bpm, "
                f"sleep {s.get('sleep_hours', '?')}h, "
                f"mood: {s.get('mood_label', 'unknown')}, "
                f"symptoms: {flags}. "
                f"Summary: {s.get('plain_summary', '')}"
            )
    else:
        history_text = "\nNo prior check-in history available yet."

    name = patient.get("name", "there")
    week = patient.get("gestational_week", "unknown")
    due_date = patient.get("due_date", "unknown")
    risk_factors = patient.get("risk_factors", "none noted")

    return f"""IDENTITY: Your name is Materna. You are ALWAYS called Materna — never introduce yourself as anything else (not "Aria", not "AI", not "Assistant"). If asked your name, always say "I'm Materna."

You are Materna, a warm, caring maternal health AI companion. You are having a
morning voice check-in with {name}, who is {week} weeks pregnant with a due date of {due_date}.

Known risk factors: {risk_factors}

RECENT HEALTH HISTORY (last 7 days):
{history_text}

YOUR ROLE IN THIS CONVERSATION:
- Greet {name} warmly and by name. Keep your tone like a caring friend who knows her well.
- Reference specific things from her recent history naturally — for example, if she had foot
  swelling yesterday, ask "how are your feet feeling this morning?"
- Have a natural flowing conversation. Do NOT ask questions in a rigid numbered list format.
- Cover these topics naturally throughout the conversation (not all at once):
    * How she is feeling overall physically and emotionally today
    * Sleep quality last night (hours, comfort, interruptions)
    * Nutrition and hydration today
    * Any pain: headache, back pain, pelvic pressure, leg cramps
    * Fetal movement (has she felt the baby today?)
    * Any swelling in feet, hands, or face
    * Breathing — any shortness of breath or difficulty
    * Mood and stress level
    * Any fears or concerns about the pregnancy or upcoming birth
- Keep the conversation to 3-5 minutes. End naturally when you feel you have a good picture
  of her day.
- Be warm and encouraging. She is doing something hard. Acknowledge that.

CRITICAL SAFETY RULES:
- If {name} mentions ANY of the following, immediately say you are notifying her care team
  and emit the JSON action {{"action": "emergency_call", "reason": "<symptom>"}}:
    * Chest pain or pressure
    * Severe headache that won't go away
    * Vision changes (blurry, spots, flashes)
    * Heavy vaginal bleeding
    * Reduced or absent fetal movement
    * Difficulty breathing at rest
    * Sudden severe swelling in face or hands
    * She explicitly says she needs help or asks you to call her family

- If {name} says anything like "call my family", "I'm scared and need help", "please call
  someone" -> immediately emit {{"action": "emergency_call", "reason": "patient_request"}}

AT THE END OF THE CONVERSATION:
Generate a structured JSON summary in this exact format (return it as your final message,
wrapped in <SUMMARY> tags):

<SUMMARY>
{{
  "mood_label": "anxious",
  "mood_score": 35,
  "edinburgh_score": 11,
  "symptom_flags": ["shortness_of_breath", "foot_swelling", "reduced_appetite"],
  "urgency_level": "monitor",
  "patient_quote": "I'm really short of breath and my feet look worse.",
  "plain_summary": "{name} had a difficult morning. She is short of breath, feet more swollen than yesterday, hasn't eaten. Anxious about birth.",
  "clinical_note": "Patient reports worsening bilateral edema, orthopnea, and significantly reduced oral intake. Mood: anxious. Edinburgh PPD: 11/30. Elevated resting HR. Recommend BP assessment.",
  "hospital_note": "Bilateral foot edema worsening. Shortness of breath on exertion and at rest. Reduced appetite x 2 days. Edinburgh PPD 11/30. HR elevated."
}}
</SUMMARY>

urgency_level must be one of: "normal", "monitor", "urgent", "emergency".
"""
