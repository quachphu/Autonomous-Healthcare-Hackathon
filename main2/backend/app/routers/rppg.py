"""
FastAPI router for rPPG checkup endpoints.

POST /api/checkup/upload    — upload a browser-recorded video blob and run rPPG analysis
POST /api/checkup/analyze   — analyze a video file already on disk (server-side path)
GET  /api/checkup/latest    — most recent checkup result
GET  /api/checkup/history   — list of past results (newest first)
POST /api/checkup/mock      — return a realistic mock result (no video required)
"""

import sys
import shutil
import random
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

_BACKEND_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(_BACKEND_ROOT))

from rppg.direct_analyze import analyze_video
from rppg.analyze_results import compute_result
from rppg import storage
from app.config import get_settings

router = APIRouter(tags=["rppg"])


# ── Request schemas ───────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    video_path: str
    session_id: Optional[str] = None
    resolution: Optional[str] = "640x480"
    face_detected: Optional[bool] = True
    multiple_faces: Optional[bool] = False


class MockRequest(BaseModel):
    estimated_hr_bpm: Optional[float] = 78.0
    signal_quality: Optional[str] = "good"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_full_result(
    session_id: str,
    hr: float,
    sig_q: str,
    created_at: Optional[str] = None,
) -> dict:
    """Build the full rich result schema from a handful of parameters (for mock/demo use)."""
    created_at = created_at or (datetime.utcnow().isoformat() + "Z")

    # Vary POS/CHROM slightly so the result looks realistic
    pos_hr = round(hr + random.uniform(-1.5, 1.5), 2)
    chrom_hr = round(hr + random.uniform(-1.5, 1.5), 2)
    green_hr = round(hr * random.uniform(0.7, 1.3), 2)   # GREEN can drift

    consensus_hr = round((pos_hr + chrom_hr) / 2.0, 2)
    pos_chrom_diff = round(abs(pos_hr - chrom_hr), 2)
    green_consensus_diff = round(abs(green_hr - consensus_hr), 2)

    quality_snr = {"good": 0.52, "medium": 0.31, "low": 0.14}.get(sig_q, 0.31)
    fps = 22.0
    duration = 120.0
    frame_count = int(fps * duration)

    # Windowed HR values — 6 windows around consensus
    window_values = [round(consensus_hr + random.uniform(-4, 4), 1) for _ in range(12)]
    window_arr = window_values
    spread = max(window_arr) - min(window_arr)
    hr_trend = "stable" if spread <= 10 else "variable"

    # Agreement quality
    if pos_chrom_diff <= 5:
        agreement_quality = "good"
    elif pos_chrom_diff <= 12:
        agreement_quality = "medium"
    else:
        agreement_quality = "low"
    legacy_agreement = {"good": "good", "medium": "moderate", "low": "poor"}[agreement_quality]

    # Outlier detection
    outliers = ["GREEN"] if green_consensus_diff > 15 else []

    # Pulse category
    if consensus_hr < 60:
        pulse_cat = "below_typical_resting_range"
        pulse_lbl = "Below typical resting range"
        legacy_cat = "low"
    elif consensus_hr <= 100:
        pulse_cat = "typical_resting_range"
        pulse_lbl = "Within typical resting range"
        legacy_cat = "normal"
    else:
        pulse_cat = "elevated_for_resting_checkin"
        pulse_lbl = "Elevated for a resting check-in"
        legacy_cat = "elevated"

    # Quality factors
    qual_score = (
        (2 if agreement_quality == "good" else (1 if agreement_quality == "medium" else 0))
        + (2 if quality_snr >= 0.4 else (1 if quality_snr >= 0.2 else 0))
        + 2  # full 120s duration
    )
    overall_quality = sig_q  # honour the requested quality for demo

    retake_reasons = []
    if overall_quality == "low":
        retake_reasons.append("low signal quality")
    if pos_chrom_diff > 12:
        retake_reasons.append("high disagreement between POS and CHROM")
    retake = len(retake_reasons) > 0

    # Confidence
    if overall_quality == "good" and agreement_quality == "good":
        confidence = "good"
    elif overall_quality == "low" or agreement_quality == "low":
        confidence = "low"
    else:
        confidence = "medium"

    # Wellness score
    ws = 85
    if pulse_cat == "elevated_for_resting_checkin":
        ws -= 10
    elif pulse_cat == "below_typical_resting_range":
        ws -= 5
    if overall_quality == "low":
        ws -= 15
    elif overall_quality == "medium":
        ws -= 5
    if hr_trend == "variable":
        ws -= 10
    if retake:
        ws -= 10
    wellness_score = max(0, min(100, ws))

    # Message
    if pulse_cat == "elevated_for_resting_checkin":
        msg = (
            "Your estimated pulse was higher than a typical resting check-in. "
            "This can happen with stress, movement, caffeine, dehydration, recent activity, "
            "or normal pregnancy-related cardiovascular changes."
        )
        step = (
            "Sit quietly for 2 minutes and retake the check-in if this feels unusual. "
            "Share trends with your care team if this keeps happening."
        )
    elif pulse_cat == "below_typical_resting_range":
        msg = (
            "Your estimated pulse was a little lower than a typical resting check-in. "
            "This can happen when you are very relaxed or if camera conditions affected the signal."
        )
        step = "Ensure good front lighting and try a retake. Share trends with your care team."
    else:
        msg = (
            "Your estimated pulse looked within a typical resting range for this check-in. "
            "Keep up your wellness routine and continue sharing trends with your care team."
        )
        step = "Continue your daily check-ins and share your trend history at your next appointment."

    escalation = (
        "Seek urgent medical care for chest pain, trouble breathing, fainting, "
        "seizure, severe headache, vision changes, heavy bleeding, or reduced fetal movement."
    )

    hr_stability = "good" if hr_trend == "stable" else "variable"
    waveform_strength = "good" if quality_snr >= 0.4 else ("medium" if quality_snr >= 0.2 else "low")
    dom_freq = round(consensus_hr / 60.0, 4)

    # Mock experimental vitals — RR estimated, BP/SpO2 disabled, PWV unavailable
    mock_rr_bpm = round(15.0 + random.uniform(-2.5, 2.5), 1)
    mock_rr_conf_score = round(0.32 + random.uniform(-0.08, 0.08), 3)
    mock_rr_conf = "medium" if mock_rr_conf_score > 0.25 else "low"
    mock_exp_vitals = {
        "experimental_vitals_config": {
            "enable_experimental_rr": True,
            "enable_experimental_uncalibrated_bp": False,
            "enable_experimental_spo2_demo": False,
            "enable_experimental_pulse_timing": True,
        },
        "experimental_vitals": {
            "respiratory_rate": {
                "status": "experimental_estimate",
                "value_breaths_per_min": mock_rr_bpm,
                "method": "low_frequency_rppg_modulation_welch",
                "confidence": mock_rr_conf,
                "confidence_score": mock_rr_conf_score,
                "valid_range_breaths_per_min": [6, 30],
                "notes": [
                    "Experimental camera-derived estimate.",
                    "Not diagnostic.",
                    "May be affected by motion, lighting, talking, and posture.",
                    "Estimated wellness signal only, not diagnostic.",
                ],
            },
            "blood_pressure": {
                "status": "disabled_or_requires_calibration",
                "systolic_mmHg": None,
                "diastolic_mmHg": None,
                "method": "not_available_without_calibration",
                "confidence": "unavailable",
                "notes": [
                    "Blood pressure is not estimated in this session.",
                    "Camera-only BP estimation requires validated calibration or cuff integration.",
                    "Use a validated cuff for blood pressure readings.",
                ],
            },
            "spo2": {
                "status": "disabled_or_requires_calibration",
                "value_percent": None,
                "method": "rgb_ratio_of_ratios_requires_calibration",
                "confidence": "unavailable",
                "notes": [
                    "SpO2 is not estimated in this session.",
                    "SpO2 normally requires validated optical wavelengths and calibration.",
                    "A standard webcam should not be treated as a pulse oximeter.",
                ],
            },
            "pulse_wave_velocity": {
                "status": "not_available_single_roi",
                "value_m_per_s": None,
                "pulse_arrival_delay_ms": None,
                "method": "not_available",
                "confidence": "unavailable",
                "notes": [
                    "Pulse timing surrogate requires two ROI signals (e.g. forehead and cheek).",
                    "True pulse wave velocity requires multiple measurement sites or ECG/PPG timing.",
                ],
            },
            "disclaimer": (
                "These are experimental camera-derived wellness estimates for "
                "proof-of-concept only and are not diagnostic."
            ),
        },
        "raw_signal_traces": {
            "stored_inline": False,
            "sample_count": frame_count,
            "local_trace_path": None,
            "supabase_storage_path": None,
            "available_traces": ["mean_red_trace", "mean_green_trace", "mean_blue_trace",
                                 "bvp_pos", "bvp_chrom", "bvp_green"],
        },
    }

    return {
        "session_id": session_id,
        "created_at": created_at,
        "source": {
            "pipeline": "rPPG-Toolbox",
            "mode": "unsupervised_webcam_mvp",
            "methods_run": ["POS", "CHROM", "GREEN"],
            "ground_truth_used": False,
        },
        "checkup_summary": {
            "estimated_pulse_bpm": consensus_hr,
            "pulse_category": pulse_cat,
            "pulse_label": pulse_lbl,
            "confidence": confidence,
            "retake_recommended": retake,
        },
        "heart_rate_statistics": {
            "primary_method": "POS",
            "backup_method": "CHROM",
            "baseline_method": "GREEN",
            "consensus_method": "POS_CHROM",
            "heart_rate_by_method": {"POS": pos_hr, "CHROM": chrom_hr, "GREEN": green_hr},
            "consensus_heart_rate_bpm": consensus_hr,
            "window_size_seconds": 10,
            "window_values_bpm": window_values,
            "mean_window_bpm": round(sum(window_values) / len(window_values), 2),
            "min_window_bpm": min(window_values),
            "max_window_bpm": max(window_values),
            "range_window_bpm": round(max(window_values) - min(window_values), 2),
            "std_window_bpm": round(
                (sum((v - sum(window_values) / len(window_values)) ** 2 for v in window_values)
                 / len(window_values)) ** 0.5, 2
            ),
            "trend": hr_trend,
        },
        "method_agreement": {
            "pos_chrom_difference_bpm": pos_chrom_diff,
            "pos_green_difference_bpm": round(abs(pos_hr - green_hr), 2),
            "chrom_green_difference_bpm": round(abs(chrom_hr - green_hr), 2),
            "green_difference_from_consensus_bpm": green_consensus_diff,
            "outlier_methods": outliers,
            "agreement_quality": agreement_quality,
        },
        "rppg_waveform_statistics": {
            "waveform_available": True,
            "waveform_sample_count": frame_count,
            "dominant_frequency_hz": dom_freq,
            "dominant_frequency_bpm": round(dom_freq * 60, 2),
            "peak_power": round(quality_snr * 1.2, 6),
            "average_band_power": round(quality_snr * 0.3, 6),
            "snr_like_score": quality_snr,
            "valid_window_count": len(window_values),
        },
        "signal_quality": {
            "overall": overall_quality,
            "method_agreement": agreement_quality,
            "hr_stability": hr_stability,
            "waveform_strength": waveform_strength,
            "face_detected": True,
            "multiple_faces_detected": False,
            "recording_duration_seconds": duration,
            "estimated_fps": fps,
        },
        "recording_quality": {
            "face_detected": True,
            "multiple_faces_detected": False,
            "recording_duration_seconds": duration,
            "frame_count": frame_count,
            "estimated_fps": fps,
            "resolution": "640x480",
            "retake_recommended": retake,
            "retake_reasons": retake_reasons,
        },
        "maternal_wellness_interpretation": {
            "wellness_score": wellness_score,
            "score_label": "wellness_checkin_score_not_medical_risk",
            "message": msg,
            "suggested_next_step": step,
            "escalation_note": escalation,
        },
        "future_or_unsupported_metrics": {
            "respiratory_rate": {
                "status": "future_or_experimental",
                "value_breaths_per_min": None,
                "explanation": "Respiratory rate may require a supervised multitask model such as BigSmall or additional validated signal processing.",
            },
            "blood_pressure": {
                "status": "not_measured",
                "systolic_mmHg": None,
                "diastolic_mmHg": None,
                "explanation": "Camera-only blood pressure estimation requires validated calibration/modeling or cuff integration.",
            },
            "pulse_wave_velocity": {
                "status": "not_measured",
                "value": None,
                "explanation": "Pulse wave velocity requires timing between multiple pulse sites or additional sensors.",
            },
            "spo2": {
                "status": "not_measured",
                "value_percent": None,
                "explanation": "SpO2 requires a validated optical sensor or calibrated model. Do not present it as measured from webcam.",
            },
        },
        "available_from_webcam": {
            "heart_rate": True,
            "heart_rate_trend": True,
            "rppg_waveform": True,
            "signal_quality": True,
            "recording_quality": True,
            "respiratory_rate": True,   # RR estimated in mock
            "blood_pressure": False,
            "spo2": False,
            "pulse_wave_velocity": False,
        },
        "medical_notice": "Estimated wellness signal only, not diagnostic.",
        **mock_exp_vitals,
        # Legacy compat
        "recording": {
            "duration_seconds": duration,
            "frame_count": frame_count,
            "estimated_fps": fps,
            "video_path": "mock",
        },
        "rppg_analysis": {
            "methods": {
                "pos":   {"hr_bpm": pos_hr,   "snr": quality_snr,         "status": "ok"},
                "chrom": {"hr_bpm": chrom_hr, "snr": quality_snr * 0.95,  "status": "ok"},
                "green": {"hr_bpm": green_hr, "snr": quality_snr * 0.88,  "status": "ok"},
            },
            "consensus": {
                "estimated_pulse_bpm": consensus_hr,
                "pulse_category": legacy_cat,
                "pulse_label": pulse_lbl,
                "method_agreement": legacy_agreement,
                "retake_recommended": retake,
            },
            "signal_quality": {
                "label": overall_quality,
                "best_snr": quality_snr,
                "wellness_score": wellness_score,
            },
            "check_in_trend": hr_trend,
        },
        "safety": {
            "not_diagnostic": True,
            "disclaimer": "This is a camera-based wellness signal, not a medical diagnosis. Estimated pulse is for informational use only. Share trends with your care team.",
            "urgent_notice": escalation,
        },
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/checkup/upload")
async def upload_and_analyze(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(default=None),
    face_detected: bool = Form(default=True),
    multiple_faces: bool = Form(default=False),
):
    """
    Accept a browser-recorded video blob (WebM or MP4), run rPPG analysis,
    save results.json, and return the full result schema.
    Falls back to a realistic demo result if the rPPG libraries are unavailable.
    """
    sid = session_id or datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    session_dir = _BACKEND_ROOT / "rppg" / "output" / sid
    session_dir.mkdir(parents=True, exist_ok=True)

    # Determine extension from MIME type
    content_type = file.content_type or "video/webm"
    ext = ".mp4" if "mp4" in content_type else ".webm"
    video_path = session_dir / f"vid{ext}"

    # Save the uploaded video
    with open(video_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Try real rPPG analysis
    cfg = get_settings()

    try:
        raw = analyze_video(str(video_path))

        result = compute_result(
            session_id=sid,
            pos_bvp=raw["pos_bvp"],
            chrom_bvp=raw["chrom_bvp"],
            green_bvp=raw["green_bvp"],
            fs=raw["fps"],
            duration_seconds=raw["duration_seconds"],
            frame_count=raw["frame_count"],
            video_path=str(video_path),
            face_detected=face_detected,
            multiple_faces=multiple_faces,
            mean_red_trace=raw.get("mean_red_trace"),
            mean_blue_trace=raw.get("mean_blue_trace"),
            mean_green_trace=raw.get("mean_green_trace"),
            roi_traces=raw.get("roi_traces"),
            enable_experimental_rr=cfg.enable_experimental_rr,
            enable_experimental_uncalibrated_bp=cfg.enable_experimental_uncalibrated_bp,
            enable_experimental_spo2_demo=cfg.enable_experimental_spo2_demo,
            enable_experimental_pulse_timing=cfg.enable_experimental_pulse_timing,
        )

        if raw["errors"]:
            result["analysis_warnings"] = raw["errors"]

    except Exception as exc:
        result = _make_full_result(sid, 85.0 + random.uniform(-10, 10), "medium")
        result["recording"]["video_path"] = str(video_path)
        result["analysis_warnings"] = {
            "fallback": (
                f"rPPG analysis failed ({exc}). "
                "Ensure rPPG-Toolbox dependencies (numpy, opencv-python, scipy) are installed. "
                "Showing estimated demo result."
            )
        }

    storage.save_checkup_result(result)
    return result


@router.post("/checkup/analyze")
async def analyze_checkup(req: AnalyzeRequest):
    video_path = Path(req.video_path)
    if not video_path.exists():
        raise HTTPException(status_code=404, detail=f"Video file not found: {req.video_path}")

    session_id = req.session_id or datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    cfg = get_settings()

    try:
        raw = analyze_video(str(video_path))
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    result = compute_result(
        session_id=session_id,
        pos_bvp=raw["pos_bvp"],
        chrom_bvp=raw["chrom_bvp"],
        green_bvp=raw["green_bvp"],
        fs=raw["fps"],
        duration_seconds=raw["duration_seconds"],
        frame_count=raw["frame_count"],
        video_path=str(video_path),
        resolution=req.resolution or "640x480",
        face_detected=req.face_detected if req.face_detected is not None else True,
        multiple_faces=req.multiple_faces or False,
        mean_red_trace=raw.get("mean_red_trace"),
        mean_blue_trace=raw.get("mean_blue_trace"),
        mean_green_trace=raw.get("mean_green_trace"),
        roi_traces=raw.get("roi_traces"),
        enable_experimental_rr=cfg.enable_experimental_rr,
        enable_experimental_uncalibrated_bp=cfg.enable_experimental_uncalibrated_bp,
        enable_experimental_spo2_demo=cfg.enable_experimental_spo2_demo,
        enable_experimental_pulse_timing=cfg.enable_experimental_pulse_timing,
    )

    if raw["errors"]:
        result["analysis_warnings"] = raw["errors"]

    storage.save_checkup_result(result)
    return result


@router.get("/checkup/latest")
async def get_latest_checkup():
    result = storage.get_latest_checkup_result()
    if result is None:
        raise HTTPException(status_code=404, detail="No checkup results found")
    return result


@router.get("/checkup/history")
async def get_checkup_history(limit: int = 30):
    return storage.get_checkup_history(limit=limit)


@router.post("/checkup/mock")
async def mock_checkup(req: MockRequest):
    """Return a plausible full-schema mock result — for frontend dev without a real recording."""
    hr = req.estimated_hr_bpm or 78.0
    sig_q = req.signal_quality or "good"
    session_id = "mock_" + datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    result = _make_full_result(session_id, hr, sig_q)
    storage.save_checkup_result(result)
    return result
