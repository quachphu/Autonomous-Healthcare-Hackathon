"""
Core rPPG result computation for the NatalNanny MVP.
Produces the full JSON result schema from per-method BVP signals.
Backward-compat legacy fields (rppg_analysis, recording, safety) are included alongside the new schema.
"""

import numpy as np
from datetime import datetime
from typing import Optional

from .experimental_vitals import compute_experimental_vitals


# ── Signal-processing helpers ─────────────────────────────────────────────────

def _fft_hr(bvp: np.ndarray, fs: float, low_hz: float = 0.75, high_hz: float = 2.5) -> float:
    """Return dominant BPM in the resting heart-rate band via FFT."""
    n = max(256, int(2 ** np.ceil(np.log2(len(bvp)))))
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    psd = np.abs(np.fft.rfft(bvp, n=n)) ** 2
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    if not np.any(mask):
        return 0.0
    return float(freqs[mask][np.argmax(psd[mask])] * 60.0)


def _snr(bvp: np.ndarray, hr_bpm: float, fs: float) -> float:
    """Power at HR peak / total band power (0–1 SNR-like score)."""
    if hr_bpm <= 0:
        return 0.0
    n = max(256, int(2 ** np.ceil(np.log2(len(bvp)))))
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    psd = np.abs(np.fft.rfft(bvp, n=n)) ** 2
    hr_hz = hr_bpm / 60.0
    signal_mask = (freqs >= hr_hz - 0.1) & (freqs <= hr_hz + 0.1)
    band_mask = (freqs >= 0.6) & (freqs <= 3.3)
    if not np.any(signal_mask) or not np.any(band_mask):
        return 0.0
    total = float(np.sum(psd[band_mask]))
    if total < 1e-10:
        return 0.0
    return round(float(np.sum(psd[signal_mask])) / total, 4)


def _windowed_hr(bvp: np.ndarray, fs: float, window_sec: int = 10) -> list[float]:
    """Per-window HR estimates for each non-overlapping window_sec segment."""
    n_samples = int(window_sec * fs)
    if len(bvp) < n_samples:
        return []
    values = []
    for start in range(0, len(bvp) - n_samples + 1, n_samples):
        hr = _fft_hr(bvp[start:start + n_samples], fs)
        if 30.0 < hr < 200.0:
            values.append(round(hr, 1))
    return values


def _hr_trend(window_values: list[float]) -> str:
    if len(window_values) < 2:
        return "stable"
    spread = max(window_values) - min(window_values)
    delta = window_values[-1] - window_values[0]
    if spread <= 10:
        return "stable"
    if delta > 8:
        return "increasing"
    if delta < -8:
        return "decreasing"
    return "variable"


def _pulse_category(hr_bpm: float) -> str:
    if hr_bpm < 60:
        return "below_typical_resting_range"
    if hr_bpm <= 100:
        return "typical_resting_range"
    return "elevated_for_resting_checkin"


def _pulse_label(cat: str) -> str:
    return {
        "below_typical_resting_range": "Below typical resting range",
        "typical_resting_range": "Within typical resting range",
        "elevated_for_resting_checkin": "Elevated for a resting check-in",
    }.get(cat, "")


def _legacy_pulse_category(cat: str) -> str:
    """Map new pulse category to legacy enum for backward compat."""
    return {
        "below_typical_resting_range": "low",
        "typical_resting_range": "normal",
        "elevated_for_resting_checkin": "elevated",
    }.get(cat, "unknown")


def _waveform_stats(bvp: np.ndarray, hr_bpm: float, fs: float, valid_windows: int) -> dict:
    n = max(256, int(2 ** np.ceil(np.log2(len(bvp)))))
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    psd = np.abs(np.fft.rfft(bvp, n=n)) ** 2
    band_mask = (freqs >= 0.75) & (freqs <= 2.5)
    if not np.any(band_mask):
        return {
            "waveform_available": True, "waveform_sample_count": len(bvp),
            "dominant_frequency_hz": None, "dominant_frequency_bpm": None,
            "peak_power": None, "average_band_power": None,
            "snr_like_score": None, "valid_window_count": valid_windows,
        }
    band_freqs = freqs[band_mask]
    band_psd = psd[band_mask]
    dom_idx = int(np.argmax(band_psd))
    dom_freq = float(band_freqs[dom_idx])
    snr = _snr(bvp, hr_bpm, fs)
    return {
        "waveform_available": True,
        "waveform_sample_count": len(bvp),
        "dominant_frequency_hz": round(dom_freq, 4),
        "dominant_frequency_bpm": round(dom_freq * 60.0, 2),
        "peak_power": round(float(band_psd[dom_idx]), 6),
        "average_band_power": round(float(np.mean(band_psd)), 6),
        "snr_like_score": snr,
        "valid_window_count": valid_windows,
    }


def _no_waveform(valid_windows: int) -> dict:
    return {
        "waveform_available": False, "waveform_sample_count": None,
        "dominant_frequency_hz": None, "dominant_frequency_bpm": None,
        "peak_power": None, "average_band_power": None,
        "snr_like_score": None, "valid_window_count": valid_windows,
    }


def _wellness_message(pulse_cat: str) -> tuple[str, str]:
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
            "This can happen when you are very relaxed or if lighting or camera conditions affected the signal."
        )
        step = "Ensure good front lighting and try a retake. Share trends with your care team."
    else:
        msg = (
            "Your estimated pulse looked within a typical resting range for this check-in. "
            "Keep up your wellness routine and continue sharing trends with your care team."
        )
        step = "Continue your daily check-ins and share your trend history at your next appointment."
    return msg, step


def _maternal_wellness_score(
    pulse_cat: str, overall_quality: str, hr_trend: str, retake: bool
) -> int:
    score = 85
    if pulse_cat == "elevated_for_resting_checkin":
        score -= 10
    elif pulse_cat == "below_typical_resting_range":
        score -= 5
    if overall_quality == "low":
        score -= 15
    elif overall_quality == "medium":
        score -= 5
    if hr_trend == "variable":
        score -= 10
    if retake:
        score -= 10
    return max(0, min(100, score))


# ── Main computation ──────────────────────────────────────────────────────────

def compute_result(
    session_id: str,
    pos_bvp: Optional[np.ndarray],
    chrom_bvp: Optional[np.ndarray],
    green_bvp: Optional[np.ndarray],
    fs: float,
    duration_seconds: float,
    frame_count: int,
    video_path: str,
    resolution: str = "640x480",
    face_detected: bool = True,
    multiple_faces: bool = False,
    # Raw channel traces for experimental vitals (optional)
    mean_red_trace: Optional[np.ndarray] = None,
    mean_blue_trace: Optional[np.ndarray] = None,
    mean_green_trace: Optional[np.ndarray] = None,
    roi_traces: Optional[dict] = None,
    # Experimental vitals feature flags
    enable_experimental_rr: bool = True,
    enable_experimental_uncalibrated_bp: bool = False,
    enable_experimental_spo2_demo: bool = False,
    enable_experimental_pulse_timing: bool = True,
) -> dict:
    """Compute the full NatalNanny checkup result from per-method BVP signals."""

    # ── Per-method HR ─────────────────────────────────────────────────────────
    bvps: dict[str, Optional[np.ndarray]] = {
        "POS": pos_bvp, "CHROM": chrom_bvp, "GREEN": green_bvp
    }
    method_hrs: dict[str, Optional[float]] = {}
    valid_bvps: dict[str, np.ndarray] = {}

    for name, bvp in bvps.items():
        if bvp is not None and len(bvp) >= max(9, int(fs * 5)):
            arr = np.asarray(bvp, dtype=np.float64).squeeze()
            hr = _fft_hr(arr, fs)
            if 30.0 < hr < 200.0:
                method_hrs[name] = round(float(hr), 2)
                valid_bvps[name] = arr
            else:
                method_hrs[name] = None
        else:
            method_hrs[name] = None

    # ── Consensus HR: POS + CHROM primary; GREEN is baseline/debug ────────────
    pos_hr = method_hrs.get("POS")
    chrom_hr = method_hrs.get("CHROM")
    green_hr = method_hrs.get("GREEN")

    consensus_hr: Optional[float] = None
    primary_method, backup_method, consensus_method = "POS", "CHROM", "POS_CHROM"

    if pos_hr is not None and chrom_hr is not None:
        consensus_hr = round((pos_hr + chrom_hr) / 2.0, 2)
        consensus_method = "POS_CHROM"
    elif pos_hr is not None:
        consensus_hr = pos_hr
        consensus_method = "POS"
        backup_method = "GREEN" if green_hr is not None else "unavailable"
    elif chrom_hr is not None:
        consensus_hr = chrom_hr
        primary_method, consensus_method = "CHROM", "CHROM"
        backup_method = "GREEN" if green_hr is not None else "unavailable"
    elif green_hr is not None:
        consensus_hr = green_hr
        primary_method, backup_method, consensus_method = "GREEN", "unavailable", "GREEN"

    # ── Method agreement ──────────────────────────────────────────────────────
    pos_chrom_diff = round(abs(pos_hr - chrom_hr), 2) if (pos_hr and chrom_hr) else None
    pos_green_diff = round(abs(pos_hr - green_hr), 2) if (pos_hr and green_hr) else None
    chrom_green_diff = round(abs(chrom_hr - green_hr), 2) if (chrom_hr and green_hr) else None
    green_consensus_diff = (
        round(abs(green_hr - consensus_hr), 2) if (green_hr and consensus_hr) else None
    )

    if pos_chrom_diff is None:
        agreement_quality = "low"
    elif pos_chrom_diff <= 5:
        agreement_quality = "good"
    elif pos_chrom_diff <= 12:
        agreement_quality = "medium"
    else:
        agreement_quality = "low"

    outlier_methods = [
        name for name, hr_val in method_hrs.items()
        if hr_val is not None and consensus_hr is not None and abs(hr_val - consensus_hr) > 15
    ]

    # Legacy method agreement label
    legacy_agreement = {"good": "good", "medium": "moderate", "low": "poor"}.get(
        agreement_quality, "poor"
    )

    # ── Windowed HR stats ──────────────────────────────────────────────────────
    # Use the best available BVP (POS preferred)
    best_bvp: Optional[np.ndarray] = next(
        (valid_bvps[n] for n in ["POS", "CHROM", "GREEN"] if n in valid_bvps), None
    )

    window_values: list[float] = []
    if best_bvp is not None and len(best_bvp) >= int(fs * 10):
        window_values = _windowed_hr(best_bvp, fs, window_sec=10)

    hr_trend = _hr_trend(window_values)

    hr_stats: dict = {k: None for k in ["mean_window_bpm", "min_window_bpm", "max_window_bpm",
                                         "range_window_bpm", "std_window_bpm"]}
    if window_values:
        arr = np.array(window_values)
        hr_stats = {
            "mean_window_bpm": round(float(np.mean(arr)), 2),
            "min_window_bpm": round(float(np.min(arr)), 2),
            "max_window_bpm": round(float(np.max(arr)), 2),
            "range_window_bpm": round(float(np.ptp(arr)), 2),
            "std_window_bpm": round(float(np.std(arr)), 2),
        }

    # ── rPPG waveform stats ───────────────────────────────────────────────────
    valid_window_count = len(window_values)
    if best_bvp is not None and consensus_hr is not None:
        waveform = _waveform_stats(best_bvp, consensus_hr, fs, valid_window_count)
    else:
        waveform = _no_waveform(valid_window_count)

    snr_like = waveform.get("snr_like_score") or 0.0

    # ── Pulse category ────────────────────────────────────────────────────────
    if consensus_hr is not None:
        pulse_cat = _pulse_category(consensus_hr)
    else:
        pulse_cat = "below_typical_resting_range"

    pulse_lbl = _pulse_label(pulse_cat)

    # ── Signal quality ────────────────────────────────────────────────────────
    qual_score = 0
    if agreement_quality == "good":
        qual_score += 2
    elif agreement_quality == "medium":
        qual_score += 1

    if snr_like >= 0.4:
        qual_score += 2
    elif snr_like >= 0.2:
        qual_score += 1

    if duration_seconds >= 55:
        qual_score += 2
    elif duration_seconds >= 45:
        qual_score += 1

    if qual_score >= 4:
        overall_quality = "good"
    elif qual_score >= 2:
        overall_quality = "medium"
    else:
        overall_quality = "low"

    hr_stability = (
        "good" if hr_trend == "stable" else
        "medium" if hr_trend in ("increasing", "decreasing") else "low"
    )
    waveform_strength = (
        "good" if snr_like >= 0.4 else
        "medium" if snr_like >= 0.2 else
        ("low" if snr_like > 0 else "unknown")
    )

    # ── Retake logic ──────────────────────────────────────────────────────────
    retake_reasons = []
    if overall_quality == "low":
        retake_reasons.append("low signal quality")
    if duration_seconds < 45:
        retake_reasons.append("recording too short (< 45 seconds)")
    if fs < 15:
        retake_reasons.append("low frame rate (< 15 fps)")
    if not face_detected:
        retake_reasons.append("face not detected")
    if pos_chrom_diff is not None and pos_chrom_diff > 12:
        retake_reasons.append("high disagreement between POS and CHROM")
    if multiple_faces:
        retake_reasons.append("multiple faces detected")
    if len(outlier_methods) >= 2:
        retake_reasons.append("too many outlier methods")

    retake_recommended = len(retake_reasons) > 0

    # ── Confidence ────────────────────────────────────────────────────────────
    if overall_quality == "good" and agreement_quality == "good":
        confidence = "good"
    elif overall_quality == "low" or agreement_quality == "low":
        confidence = "low"
    else:
        confidence = "medium"

    # ── Wellness interpretation ───────────────────────────────────────────────
    wellness_score = _maternal_wellness_score(
        pulse_cat, overall_quality, hr_trend, retake_recommended
    )
    msg, step = _wellness_message(pulse_cat)

    # ── Experimental vitals ───────────────────────────────────────────────────
    forehead_green = roi_traces.get("forehead_green") if roi_traces else None
    left_cheek_green = roi_traces.get("left_cheek_green") if roi_traces else None

    exp = compute_experimental_vitals(
        bvp=best_bvp,
        fs=fs,
        duration_seconds=duration_seconds,
        signal_quality=overall_quality,
        hr_bpm=consensus_hr,
        mean_red_trace=mean_red_trace,
        mean_blue_trace=mean_blue_trace,
        mean_green_trace=mean_green_trace,
        forehead_green=forehead_green,
        cheek_green=left_cheek_green,
        enable_rr=enable_experimental_rr,
        enable_uncalibrated_bp=enable_experimental_uncalibrated_bp,
        enable_spo2_demo=enable_experimental_spo2_demo,
        enable_pulse_timing=enable_experimental_pulse_timing,
    )
    exp_vitals = exp["experimental_vitals"]
    rr_available = exp_vitals["respiratory_rate"]["status"] == "experimental_estimate"
    bp_available = "experimental_" in exp_vitals["blood_pressure"]["status"]
    spo2_available = "experimental_" in exp_vitals["spo2"]["status"]
    pwv_available = exp_vitals["pulse_wave_velocity"]["status"] == "surrogate_only_not_true_pwv"

    roi_list = ["forehead_green", "left_cheek_green", "right_cheek_green"]
    available_traces = ["mean_red_trace", "mean_green_trace", "mean_blue_trace",
                        "bvp_pos", "bvp_chrom", "bvp_green"]
    if roi_traces:
        available_traces += [t for t in roi_list if roi_traces.get(t) is not None]

    # ── Build result ──────────────────────────────────────────────────────────
    return {
        "session_id": session_id,
        "created_at": datetime.utcnow().isoformat() + "Z",

        # ── New rich schema fields ─────────────────────────────────────────
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
            "retake_recommended": retake_recommended,
        },
        "heart_rate_statistics": {
            "primary_method": primary_method,
            "backup_method": backup_method,
            "baseline_method": "GREEN",
            "consensus_method": consensus_method,
            "heart_rate_by_method": {
                "POS": method_hrs.get("POS"),
                "CHROM": method_hrs.get("CHROM"),
                "GREEN": method_hrs.get("GREEN"),
            },
            "consensus_heart_rate_bpm": consensus_hr,
            "window_size_seconds": 10,
            "window_values_bpm": window_values,
            **hr_stats,
            "trend": hr_trend,
        },
        "method_agreement": {
            "pos_chrom_difference_bpm": pos_chrom_diff,
            "pos_green_difference_bpm": pos_green_diff,
            "chrom_green_difference_bpm": chrom_green_diff,
            "green_difference_from_consensus_bpm": green_consensus_diff,
            "outlier_methods": outlier_methods,
            "agreement_quality": agreement_quality,
        },
        "rppg_waveform_statistics": waveform,
        "signal_quality": {
            "overall": overall_quality,
            "method_agreement": agreement_quality,
            "hr_stability": hr_stability,
            "waveform_strength": waveform_strength,
            "face_detected": face_detected,
            "multiple_faces_detected": multiple_faces,
            "recording_duration_seconds": round(duration_seconds, 2),
            "estimated_fps": round(fs, 2),
        },
        "recording_quality": {
            "face_detected": face_detected,
            "multiple_faces_detected": multiple_faces,
            "recording_duration_seconds": round(duration_seconds, 2),
            "frame_count": frame_count,
            "estimated_fps": round(fs, 2),
            "resolution": resolution,
            "retake_recommended": retake_recommended,
            "retake_reasons": retake_reasons,
        },
        "maternal_wellness_interpretation": {
            "wellness_score": wellness_score,
            "score_label": "wellness_checkin_score_not_medical_risk",
            "message": msg,
            "suggested_next_step": step,
            "escalation_note": (
                "Seek urgent medical care for chest pain, trouble breathing, fainting, "
                "seizure, severe headache, vision changes, heavy bleeding, or reduced fetal movement."
            ),
        },
        "future_or_unsupported_metrics": {
            "respiratory_rate": {
                "status": "future_or_experimental",
                "value_breaths_per_min": None,
                "explanation": (
                    "Respiratory rate may require a supervised multitask model such as BigSmall "
                    "or additional validated signal processing."
                ),
            },
            "blood_pressure": {
                "status": "not_measured",
                "systolic_mmHg": None,
                "diastolic_mmHg": None,
                "explanation": (
                    "Camera-only blood pressure estimation requires validated calibration/modeling "
                    "or cuff integration."
                ),
            },
            "pulse_wave_velocity": {
                "status": "not_measured",
                "value": None,
                "explanation": (
                    "Pulse wave velocity requires timing between multiple pulse sites "
                    "or additional sensors."
                ),
            },
            "spo2": {
                "status": "not_measured",
                "value_percent": None,
                "explanation": (
                    "SpO2 requires a validated optical sensor or calibrated model. "
                    "Do not present it as measured from webcam."
                ),
            },
        },
        "available_from_webcam": {
            "heart_rate": True,
            "heart_rate_trend": len(window_values) > 0,
            "rppg_waveform": best_bvp is not None,
            "signal_quality": True,
            "recording_quality": True,
            "respiratory_rate": rr_available,
            "blood_pressure": bp_available,
            "spo2": spo2_available,
            "pulse_wave_velocity": pwv_available,
        },
        "medical_notice": "Estimated wellness signal only, not diagnostic.",

        # ── Experimental vitals ────────────────────────────────────────────
        "experimental_vitals_config": exp["experimental_vitals_config"],
        "experimental_vitals": exp_vitals,
        "raw_signal_traces": {
            "stored_inline": False,
            "sample_count": frame_count,
            "local_trace_path": None,
            "supabase_storage_path": None,
            "available_traces": available_traces,
        },

        # ── Backward-compat legacy fields ──────────────────────────────────
        "recording": {
            "duration_seconds": round(duration_seconds, 2),
            "frame_count": frame_count,
            "estimated_fps": round(fs, 2),
            "video_path": video_path,
        },
        "rppg_analysis": {
            "methods": {
                "pos": {
                    "hr_bpm": method_hrs.get("POS"),
                    "snr": round(snr_like, 4) if "POS" in valid_bvps else None,
                    "status": "ok" if method_hrs.get("POS") is not None else "unavailable",
                },
                "chrom": {
                    "hr_bpm": method_hrs.get("CHROM"),
                    "snr": round(snr_like * 0.95, 4) if "CHROM" in valid_bvps else None,
                    "status": "ok" if method_hrs.get("CHROM") is not None else "unavailable",
                },
                "green": {
                    "hr_bpm": method_hrs.get("GREEN"),
                    "snr": round(snr_like * 0.88, 4) if "GREEN" in valid_bvps else None,
                    "status": "ok" if method_hrs.get("GREEN") is not None else "unavailable",
                },
            },
            "consensus": {
                "estimated_pulse_bpm": consensus_hr,
                "pulse_category": _legacy_pulse_category(pulse_cat),
                "pulse_label": pulse_lbl,
                "method_agreement": legacy_agreement,
                "retake_recommended": retake_recommended,
            },
            "signal_quality": {
                "label": overall_quality,
                "best_snr": round(snr_like, 4),
                "wellness_score": wellness_score,
            },
            "check_in_trend": hr_trend,
        },
        "safety": {
            "not_diagnostic": True,
            "disclaimer": (
                "This is a camera-based wellness signal, not a medical diagnosis. "
                "Estimated pulse is for informational use only. Share trends with your care team."
            ),
            "urgent_notice": (
                "Seek urgent medical care for chest pain, trouble breathing, fainting, "
                "seizure, severe headache, vision changes, heavy bleeding, or reduced fetal movement."
            ),
        },
    }
