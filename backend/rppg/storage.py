"""
Local JSON storage for checkup results, with optional Supabase sync.
All functions degrade gracefully when Supabase is not configured.
"""

import json
import logging
import uuid
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

OUTPUT_ROOT = Path(__file__).parent / "output"


def _session_path(session_id: str) -> Path:
    return OUTPUT_ROOT / session_id / "results.json"


# ── Local JSON ────────────────────────────────────────────────────────────────

def save_checkup_result(result: dict) -> None:
    session_id = result["session_id"]
    session_dir = OUTPUT_ROOT / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    _session_path(session_id).write_text(json.dumps(result, indent=2))


def get_latest_checkup_result() -> Optional[dict]:
    if not OUTPUT_ROOT.exists():
        return None
    sessions = sorted(
        [d for d in OUTPUT_ROOT.iterdir() if d.is_dir() and (d / "results.json").exists()],
        key=lambda d: d.name,
        reverse=True,
    )
    if not sessions:
        return None
    return json.loads((sessions[0] / "results.json").read_text())


def get_checkup_history(limit: int = 30) -> list[dict]:
    if not OUTPUT_ROOT.exists():
        return []
    sessions = sorted(
        [d for d in OUTPUT_ROOT.iterdir() if d.is_dir() and (d / "results.json").exists()],
        key=lambda d: d.name,
        reverse=True,
    )[:limit]
    results = []
    for s in sessions:
        try:
            results.append(json.loads((s / "results.json").read_text()))
        except Exception:
            continue
    return results


def get_latest_voice_result() -> Optional[dict]:
    """Return the most recent result that contains a voice_checkin section."""
    if not OUTPUT_ROOT.exists():
        return None
    sessions = sorted(
        [d for d in OUTPUT_ROOT.iterdir() if d.is_dir() and (d / "results.json").exists()],
        key=lambda d: d.name,
        reverse=True,
    )
    for s in sessions:
        try:
            r = json.loads((s / "results.json").read_text())
            if r.get("voice_checkin"):
                return r
        except Exception:
            continue
    return None


def get_voice_history(limit: int = 30) -> list[dict]:
    """Return results that contain a voice_checkin section, newest first."""
    if not OUTPUT_ROOT.exists():
        return []
    sessions = sorted(
        [d for d in OUTPUT_ROOT.iterdir() if d.is_dir() and (d / "results.json").exists()],
        key=lambda d: d.name,
        reverse=True,
    )
    results = []
    for s in sessions:
        if len(results) >= limit:
            break
        try:
            r = json.loads((s / "results.json").read_text())
            if r.get("voice_checkin"):
                results.append(r)
        except Exception:
            continue
    return results


# ── Supabase ──────────────────────────────────────────────────────────────────

def _get_supabase_client(supabase_url: str, supabase_key: str):
    if not supabase_url or not supabase_key:
        raise ValueError("Supabase URL and service role key are required")
    try:
        from supabase import create_client  # type: ignore[import]
    except ImportError as exc:
        raise ImportError("supabase package not installed. Run: pip install supabase>=2.9.0") from exc
    return create_client(supabase_url, supabase_key)


def save_checkup_result_supabase(
    result: dict,
    supabase_url: str,
    supabase_key: str,
    table: str = "checkup_sessions",
    user_id: Optional[str] = None,
) -> None:
    """Insert a completed checkup session into the checkup_sessions table."""
    client = _get_supabase_client(supabase_url, supabase_key)

    cs = result.get("checkup_summary") or {}
    sq = result.get("signal_quality") or {}
    voice = result.get("voice_checkin") or {}

    stats = {
        "session_id": result.get("session_id"),
        "duration_seconds": result.get("duration_seconds"),
        "completed_reason": result.get("completed_reason"),
        "estimated_pulse_bpm": cs.get("estimated_pulse_bpm"),
        "pulse_category": cs.get("pulse_category"),
        "signal_quality": sq.get("overall") if isinstance(sq, dict) else None,
        "voice_checkin": voice or None,
        "session_notes_for_user": result.get("session_notes_for_user") or {},
        "wellness_score": (result.get("maternal_wellness_interpretation") or {}).get("wellness_score"),
        "wellness_message": (result.get("maternal_wellness_interpretation") or {}).get("wellness_message"),
    }

    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "started_at": result.get("created_at"),
        "completed_at": result.get("created_at"),
        "status": "completed",
        "stats": stats,
        "rppg_raw": result.get("rppg_analysis") or {},
    }
    client.table(table).insert(row).execute()


def save_rppg_result_supabase(
    result: dict,
    supabase_url: str,
    supabase_key: str,
    user_id: Optional[str] = None,
) -> None:
    """Upsert structured rPPG signal data into the rppg_results table."""
    client = _get_supabase_client(supabase_url, supabase_key)

    cs = result.get("checkup_summary") or {}
    hrs = result.get("heart_rate_statistics") or {}
    ma = result.get("method_agreement") or {}
    sq = result.get("signal_quality") or {}
    rq = result.get("recording_quality") or {}
    wf = result.get("rppg_waveform_statistics") or {}
    mwi = result.get("maternal_wellness_interpretation") or {}
    src = result.get("source") or {}
    hr_by_method = hrs.get("heart_rate_by_method") or {}
    ev = result.get("experimental_vitals") or {}
    ev_rr = ev.get("respiratory_rate") or {}
    ev_bp = ev.get("blood_pressure") or {}
    ev_spo2 = ev.get("spo2") or {}
    ev_pwv = ev.get("pulse_wave_velocity") or {}

    row = {
        "session_id": result["session_id"],
        "user_id": user_id,
        "created_at": result.get("created_at"),
        "duration_seconds": result.get("duration_seconds"),
        "completed_reason": result.get("completed_reason"),
        "source_pipeline": src.get("pipeline"),
        "source_mode": src.get("mode"),

        # Pulse summary
        "estimated_pulse_bpm": cs.get("estimated_pulse_bpm"),
        "pulse_category": cs.get("pulse_category"),
        "pulse_label": cs.get("pulse_label"),
        "confidence": cs.get("confidence"),
        "retake_recommended": cs.get("retake_recommended"),
        "retake_reasons": rq.get("retake_reasons") or [],

        # Per-method HRs
        "pos_hr_bpm": hr_by_method.get("POS"),
        "chrom_hr_bpm": hr_by_method.get("CHROM"),
        "green_hr_bpm": hr_by_method.get("GREEN"),
        "consensus_hr_bpm": hrs.get("consensus_heart_rate_bpm"),

        # HR statistics
        "hr_trend": hrs.get("trend"),
        "mean_window_bpm": hrs.get("mean_window_bpm"),
        "min_window_bpm": hrs.get("min_window_bpm"),
        "max_window_bpm": hrs.get("max_window_bpm"),
        "range_window_bpm": hrs.get("range_window_bpm"),
        "std_window_bpm": hrs.get("std_window_bpm"),
        "window_values_bpm": hrs.get("window_values_bpm") or [],
        "window_size_seconds": hrs.get("window_size_seconds"),

        # Method agreement
        "pos_chrom_diff_bpm": ma.get("pos_chrom_difference_bpm"),
        "pos_green_diff_bpm": ma.get("pos_green_difference_bpm"),
        "chrom_green_diff_bpm": ma.get("chrom_green_difference_bpm"),
        "agreement_quality": ma.get("agreement_quality"),
        "outlier_methods": ma.get("outlier_methods") or [],

        # Signal quality
        "signal_quality_overall": sq.get("overall"),
        "method_agreement_quality": sq.get("method_agreement"),
        "hr_stability": sq.get("hr_stability"),
        "waveform_strength": sq.get("waveform_strength"),
        "snr_like_score": wf.get("snr_like_score"),
        "dominant_frequency_hz": wf.get("dominant_frequency_hz"),
        "dominant_frequency_bpm": wf.get("dominant_frequency_bpm"),
        "waveform_sample_count": wf.get("waveform_sample_count"),
        "valid_window_count": wf.get("valid_window_count"),

        # Recording quality
        "face_detected": rq.get("face_detected"),
        "multiple_faces_detected": rq.get("multiple_faces_detected"),
        "recording_duration_seconds": rq.get("recording_duration_seconds"),
        "estimated_fps": rq.get("estimated_fps"),
        "frame_count": rq.get("frame_count"),
        "resolution": rq.get("resolution"),

        # Wellness
        "wellness_score": mwi.get("wellness_score"),
        "wellness_message": mwi.get("message"),
        "suggested_next_step": mwi.get("suggested_next_step"),

        # Experimental vitals
        "exp_rr_status": ev_rr.get("status"),
        "exp_rr_value_bpm": ev_rr.get("value_breaths_per_min"),
        "exp_bp_status": ev_bp.get("status"),
        "exp_bp_systolic": ev_bp.get("systolic_mmHg"),
        "exp_bp_diastolic": ev_bp.get("diastolic_mmHg"),
        "exp_spo2_status": ev_spo2.get("status"),
        "exp_spo2_value_pct": ev_spo2.get("value_percent"),
        "exp_pwv_status": ev_pwv.get("status"),
        "exp_pwv_delay_ms": ev_pwv.get("pulse_arrival_delay_ms"),
    }

    client.table("rppg_results").upsert(row, on_conflict="session_id").execute()


def save_voice_checkin_supabase(
    result: dict,
    supabase_url: str,
    supabase_key: str,
    user_id: Optional[str] = None,
) -> None:
    """
    Upsert voice check-in notes into checkin_voice_notes and individual
    Q&A rows into checkin_answers. Requires checkin_voice_notes to exist first.
    """
    vc = result.get("voice_checkin")
    if not vc:
        return

    client = _get_supabase_client(supabase_url, supabase_key)
    symptoms = vc.get("symptoms_reported") or {}
    session_id = result["session_id"]

    # Upsert the voice notes summary
    notes_row = {
        "session_id": session_id,
        "user_id": user_id,
        "created_at": result.get("created_at"),
        "cleaned_note": vc.get("cleaned_note"),
        "care_team_summary": vc.get("care_team_summary"),
        "suggested_next_step": vc.get("suggested_next_step"),
        "possible_context": vc.get("possible_context_for_metrics") or [],
        "requires_urgent_notice": bool(vc.get("requires_urgent_notice")),
        "urgent_notice_reason": vc.get("urgent_notice_reason"),
        "symptom_chest_pain": bool(symptoms.get("chest_pain")),
        "symptom_shortness_of_breath": bool(symptoms.get("shortness_of_breath")),
        "symptom_dizziness": bool(symptoms.get("dizziness")),
        "symptom_severe_headache": bool(symptoms.get("severe_headache")),
        "symptom_vision_changes": bool(symptoms.get("vision_changes")),
        "symptom_heavy_bleeding": bool(symptoms.get("heavy_bleeding")),
        "symptom_reduced_fetal_movement": bool(symptoms.get("reduced_fetal_movement")),
        "symptom_fever_or_chills": bool(symptoms.get("fever_or_chills")),
        "symptom_mood_concern": bool(symptoms.get("mood_concern")),
        "ai_cleanup_skipped": bool(vc.get("ai_cleanup_skipped")),
        "ai_cleanup_reason": vc.get("ai_cleanup_reason"),
    }
    client.table("checkin_voice_notes").upsert(notes_row, on_conflict="session_id").execute()

    # Upsert individual answers — delete existing rows first to avoid duplicates
    questions = vc.get("questions_asked") or []
    if questions:
        client.table("checkin_answers").delete().eq("session_id", session_id).execute()
        answer_rows = [
            {
                "session_id": session_id,
                "user_id": user_id,
                "created_at": result.get("created_at"),
                "question_index": i + 1,
                "question_id": q.get("id", ""),
                "question_text": q.get("question", ""),
                "raw_transcript": q.get("raw_transcript", ""),
                "cleaned_answer": q.get("cleaned_answer", ""),
            }
            for i, q in enumerate(questions)
        ]
        client.table("checkin_answers").insert(answer_rows).execute()
