"""
Experimental camera-derived wellness estimates for the NatalNanny MVP.

These estimates are proof-of-concept only and are NOT diagnostic.
They are clearly labeled as experimental and camera-derived.
They require calibration or additional sensors for any clinical or personal health use.

Supports:
1. Respiratory Rate  — BVP low-frequency modulation (Welch PSD, 0.1–0.5 Hz)
2. Blood Pressure    — demo estimate only; requires user cuff baseline or explicit demo flag
3. SpO2             — RGB ratio-of-ratios demo; not a validated pulse oximeter
4. Pulse Timing     — cross-correlation between facial ROIs; NOT true PWV
"""

import numpy as np
from typing import Optional

try:
    from scipy import signal as scipy_signal
    _SCIPY_AVAILABLE = True
except ImportError:
    _SCIPY_AVAILABLE = False


# ── Constants ─────────────────────────────────────────────────────────────────

RR_LOW_HZ = 0.10    # 6 breaths/min
RR_HIGH_HZ = 0.50   # 30 breaths/min
RR_MIN_BPM = 6.0
RR_MAX_BPM = 30.0

_DISCLAIMER = "Estimated wellness signal only, not diagnostic."
_URGENT = (
    "Seek urgent medical care for chest pain, trouble breathing, fainting, "
    "seizure, severe headache, vision changes, heavy bleeding, or reduced fetal movement."
)


# ── Signal utilities ──────────────────────────────────────────────────────────

def _detrend_normalize(sig: np.ndarray) -> np.ndarray:
    sig = np.asarray(sig, dtype=np.float64).squeeze()
    sig = sig - np.mean(sig)
    std = np.std(sig)
    return sig / std if std > 1e-10 else sig


def _butter_bandpass(sig: np.ndarray, fs: float, low: float, high: float) -> np.ndarray:
    if not _SCIPY_AVAILABLE:
        return sig
    nyq = fs / 2.0
    low_n = max(0.001, min(low / nyq, 0.98))
    high_n = max(low_n + 0.01, min(high / nyq, 0.99))
    try:
        b, a = scipy_signal.butter(2, [low_n, high_n], btype="band")
        return scipy_signal.filtfilt(b, a, sig)
    except Exception:
        return sig


def _dominant_freq_welch(sig: np.ndarray, fs: float, low_hz: float, high_hz: float):
    """Return (dominant_hz, confidence_score) using Welch PSD. Falls back to FFT."""
    if _SCIPY_AVAILABLE:
        nperseg = min(len(sig), max(256, int(fs * 4)))
        freqs, psd = scipy_signal.welch(sig, fs=fs, nperseg=nperseg)
    else:
        n = max(512, int(2 ** np.ceil(np.log2(len(sig)))))
        freqs = np.fft.rfftfreq(n, d=1.0 / fs)
        psd = np.abs(np.fft.rfft(sig, n=n)) ** 2

    mask = (freqs >= low_hz) & (freqs <= high_hz)
    if not np.any(mask):
        return None, 0.0

    band_psd = psd[mask]
    band_freqs = freqs[mask]
    peak_idx = int(np.argmax(band_psd))
    peak_power = float(band_psd[peak_idx])
    mean_power = float(np.mean(band_psd))

    if mean_power < 1e-14:
        return None, 0.0

    # Normalize so that a perfectly dominant peak → ~1.0, flat spectrum → ~0.1
    confidence_score = float(np.clip(peak_power / mean_power / 10.0, 0.0, 1.0))
    return float(band_freqs[peak_idx]), confidence_score


def _extract_ac_dc(sig: np.ndarray, fs: float, hr_bpm: float):
    """AC (pulsatile RMS around HR) and DC (absolute mean) components."""
    sig = np.asarray(sig, dtype=np.float64)
    dc = float(np.mean(np.abs(sig)))
    if dc < 1e-10:
        dc = 1.0
    low = max(0.3, (hr_bpm / 60.0) * 0.7)
    high = min(3.5, (hr_bpm / 60.0) * 1.3)
    filtered = _butter_bandpass(sig, fs, low, high)
    ac = float(np.sqrt(np.mean(filtered ** 2)))
    return ac, dc


# ── Respiratory Rate ──────────────────────────────────────────────────────────

def estimate_respiratory_rate(
    bvp: Optional[np.ndarray],
    fs: float,
    duration_seconds: float,
    signal_quality: str = "medium",
    enabled: bool = True,
) -> dict:
    """Estimate respiratory rate from BVP amplitude/baseline modulation via Welch PSD."""

    if not enabled:
        return {
            "status": "disabled",
            "value_breaths_per_min": None,
            "method": None,
            "confidence": "unavailable",
            "confidence_score": None,
            "valid_range_breaths_per_min": [RR_MIN_BPM, RR_MAX_BPM],
            "notes": ["Experimental respiratory-rate estimation is disabled for this session."],
        }

    if bvp is None or len(bvp) < int(fs * 15):
        return {
            "status": "unavailable",
            "value_breaths_per_min": None,
            "method": None,
            "confidence": "unavailable",
            "confidence_score": None,
            "valid_range_breaths_per_min": [RR_MIN_BPM, RR_MAX_BPM],
            "notes": ["Respiratory rate could not be estimated — recording too short or no signal."],
        }

    try:
        sig = _detrend_normalize(bvp)
        dom_hz, conf_score = _dominant_freq_welch(sig, fs, RR_LOW_HZ, RR_HIGH_HZ)

        if dom_hz is None:
            return {
                "status": "unavailable",
                "value_breaths_per_min": None,
                "method": "low_frequency_rppg_modulation_welch",
                "confidence": "unavailable",
                "confidence_score": 0.0,
                "valid_range_breaths_per_min": [RR_MIN_BPM, RR_MAX_BPM],
                "notes": ["No dominant respiratory frequency found in the signal."],
            }

        rr_bpm = round(dom_hz * 60.0, 1)

        if not (RR_MIN_BPM <= rr_bpm <= RR_MAX_BPM):
            return {
                "status": "unavailable",
                "value_breaths_per_min": None,
                "method": "low_frequency_rppg_modulation_welch",
                "confidence": "unavailable",
                "confidence_score": round(conf_score, 3),
                "valid_range_breaths_per_min": [RR_MIN_BPM, RR_MAX_BPM],
                "notes": [
                    f"Estimated value ({rr_bpm} br/min) is outside the valid physiological range.",
                    "Respiratory rate could not be confirmed from this recording.",
                ],
            }

        if duration_seconds < 45 or fs < 15 or signal_quality == "low":
            conf_label = "low"
        elif conf_score > 0.5 and duration_seconds >= 55 and signal_quality == "good":
            conf_label = "high"
        elif conf_score > 0.25:
            conf_label = "medium"
        else:
            conf_label = "low"

        return {
            "status": "experimental_estimate",
            "value_breaths_per_min": rr_bpm,
            "method": "low_frequency_rppg_modulation_welch",
            "confidence": conf_label,
            "confidence_score": round(conf_score, 3),
            "valid_range_breaths_per_min": [RR_MIN_BPM, RR_MAX_BPM],
            "notes": [
                "Experimental camera-derived estimate.",
                "Not diagnostic.",
                "May be affected by motion, lighting, talking, and posture.",
                _DISCLAIMER,
            ],
        }

    except Exception as exc:
        return {
            "status": "unavailable",
            "value_breaths_per_min": None,
            "method": "low_frequency_rppg_modulation_welch",
            "confidence": "unavailable",
            "confidence_score": None,
            "valid_range_breaths_per_min": [RR_MIN_BPM, RR_MAX_BPM],
            "notes": [f"Estimation error: {str(exc)[:120]}"],
        }


# ── Blood Pressure ────────────────────────────────────────────────────────────

def estimate_blood_pressure(
    hr_bpm: Optional[float],
    bvp: Optional[np.ndarray],
    fs: float,
    enabled_demo: bool = False,
    user_cuff_systolic: Optional[float] = None,
    user_cuff_diastolic: Optional[float] = None,
) -> dict:
    """Proof-of-concept BP estimate. Not measured. Requires calibration for real use."""

    # Case 1: User-provided cuff reading — use as anchor with tiny HR adjustment
    if user_cuff_systolic is not None and user_cuff_diastolic is not None:
        try:
            adj = 0.0
            if hr_bpm is not None:
                adj = (hr_bpm - 75.0) * 0.10  # 0.1 mmHg per bpm — toy adjustment
            systolic = int(round(user_cuff_systolic + adj))
            diastolic = int(round(user_cuff_diastolic + adj * 0.5))
            return {
                "status": "experimental_estimate_calibrated_to_user_cuff",
                "systolic_mmHg": systolic,
                "diastolic_mmHg": diastolic,
                "method": "baseline_cuff_plus_rppg_features_demo_model",
                "confidence": "low",
                "calibration_source": "user_entered_cuff_reading",
                "show_warning": True,
                "notes": [
                    "Experimental estimate anchored to a user-provided cuff reading.",
                    "Not diagnostic.",
                    "Use a validated cuff for blood pressure decisions.",
                    _DISCLAIMER,
                ],
            }
        except Exception:
            pass

    # Case 2: Demo flag disabled → no numeric output
    if not enabled_demo:
        return {
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
        }

    # Case 3: Demo mode — rough uncalibrated proof-of-concept estimate
    try:
        base_sys = 118.0
        base_dia = 76.0
        hr_delta = (hr_bpm - 72.0) if hr_bpm is not None else 0.0
        sys_adj = hr_delta * 0.30
        dia_adj = hr_delta * 0.20

        wf_adj = 0.0
        if bvp is not None and len(bvp) > int(fs * 5):
            amp = float(np.std(_detrend_normalize(bvp)))
            wf_adj = (amp - 1.0) * -0.5

        systolic = int(np.clip(round(base_sys + sys_adj), 90, 160))
        diastolic = int(np.clip(round(base_dia + dia_adj + wf_adj), 55, 110))

        return {
            "status": "experimental_demo_estimate_uncalibrated",
            "systolic_mmHg": systolic,
            "diastolic_mmHg": diastolic,
            "method": "uncalibrated_rppg_feature_demo_model",
            "confidence": "very_low",
            "show_warning": True,
            "notes": [
                "Proof-of-concept estimate only.",
                "Not validated. Do not use for medical decisions.",
                "Use a validated cuff for blood pressure readings.",
                _DISCLAIMER,
            ],
        }
    except Exception as exc:
        return {
            "status": "unavailable",
            "systolic_mmHg": None,
            "diastolic_mmHg": None,
            "method": "demo_model_failed",
            "confidence": "unavailable",
            "notes": [f"BP demo estimation failed: {str(exc)[:120]}"],
        }


# ── SpO2 ──────────────────────────────────────────────────────────────────────

def estimate_spo2(
    mean_red_trace: Optional[np.ndarray],
    mean_blue_trace: Optional[np.ndarray],
    mean_green_trace: Optional[np.ndarray],
    fs: float,
    hr_bpm: Optional[float],
    enabled_demo: bool = False,
) -> dict:
    """
    Proof-of-concept SpO2 demo using RGB ratio-of-ratios.
    A webcam does NOT provide validated pulse-oximetry wavelengths.
    This is not a measured oxygen saturation.
    """
    if not enabled_demo:
        return {
            "status": "disabled_or_requires_calibration",
            "value_percent": None,
            "method": "rgb_ratio_of_ratios_requires_calibration",
            "confidence": "unavailable",
            "notes": [
                "SpO2 is not estimated in this session.",
                "SpO2 normally requires validated optical wavelengths and calibration.",
                "A standard webcam should not be treated as a pulse oximeter.",
            ],
        }

    if mean_red_trace is None or len(mean_red_trace) < int(fs * 10):
        return {
            "status": "unavailable",
            "value_percent": None,
            "method": "rgb_ratio_of_ratios_demo",
            "confidence": "unavailable",
            "notes": [
                "Insufficient signal data for SpO2 demo estimate.",
                "A standard webcam should not be treated as a pulse oximeter.",
            ],
        }

    try:
        ref_trace = mean_blue_trace if mean_blue_trace is not None else mean_green_trace
        if ref_trace is None or len(ref_trace) < int(fs * 10):
            raise ValueError("No reference channel available")

        hr = hr_bpm or 75.0
        ac_red, dc_red = _extract_ac_dc(mean_red_trace, fs, hr)
        ac_ref, dc_ref = _extract_ac_dc(ref_trace, fs, hr)

        if dc_ref < 1e-10 or dc_red < 1e-10:
            raise ValueError("DC near zero")

        R = (ac_red / dc_red) / (ac_ref / dc_ref)
        # Demo calibration curve (not validated — approximate display only)
        spo2_raw = 110.0 - 25.0 * R
        spo2 = int(np.clip(round(spo2_raw), 90, 100))

        return {
            "status": "experimental_demo_estimate_uncalibrated",
            "value_percent": spo2,
            "method": "rgb_ratio_of_ratios_demo",
            "confidence": "very_low",
            "show_warning": True,
            "notes": [
                "Proof-of-concept color-ratio estimate only.",
                "Not a measured oxygen saturation.",
                "Use a validated pulse oximeter for SpO2.",
                _DISCLAIMER,
            ],
        }

    except Exception as exc:
        return {
            "status": "unavailable",
            "value_percent": None,
            "method": "rgb_ratio_of_ratios_demo",
            "confidence": "unavailable",
            "notes": [
                f"SpO2 demo estimation failed: {str(exc)[:120]}",
                "A standard webcam should not be treated as a pulse oximeter.",
            ],
        }


# ── Pulse Timing Surrogate ────────────────────────────────────────────────────

def estimate_pulse_timing(
    forehead_green: Optional[np.ndarray],
    cheek_green: Optional[np.ndarray],
    fs: float,
    hr_bpm: Optional[float],
    enabled: bool = True,
) -> dict:
    """
    Pulse timing surrogate via cross-correlation between two facial ROI signals.
    This is NOT true pulse wave velocity (PWV). True PWV requires ECG+PPG or two
    distant body sites with known separation distance.
    """
    if not enabled:
        return {
            "status": "disabled",
            "value_m_per_s": None,
            "pulse_arrival_delay_ms": None,
            "method": "disabled",
            "confidence": "unavailable",
            "notes": ["Experimental pulse timing estimation is disabled for this session."],
        }

    if forehead_green is None or cheek_green is None:
        return {
            "status": "not_available_single_roi",
            "value_m_per_s": None,
            "pulse_arrival_delay_ms": None,
            "method": "not_available",
            "confidence": "unavailable",
            "notes": [
                "Pulse timing surrogate requires two ROI signals (e.g. forehead and cheek).",
                "True pulse wave velocity requires multiple measurement sites or ECG/PPG timing.",
            ],
        }

    min_len = int(fs * 10)
    if len(forehead_green) < min_len or len(cheek_green) < min_len:
        return {
            "status": "not_available_single_roi",
            "value_m_per_s": None,
            "pulse_arrival_delay_ms": None,
            "method": "not_available",
            "confidence": "unavailable",
            "notes": ["Insufficient signal length for pulse timing estimate."],
        }

    try:
        hr = hr_bpm or 75.0
        low_hz = max(0.4, (hr / 60.0) * 0.6)
        high_hz = min(3.5, (hr / 60.0) * 1.4)

        fh = _butter_bandpass(
            np.asarray(forehead_green, dtype=np.float64).squeeze(), fs, low_hz, high_hz
        )
        ck = _butter_bandpass(
            np.asarray(cheek_green, dtype=np.float64).squeeze(), fs, low_hz, high_hz
        )

        n = min(len(fh), len(ck))
        fh, ck = fh[:n] - fh[:n].mean(), ck[:n] - ck[:n].mean()

        # Cross-correlation; limit search window to ±200 ms
        max_lag = int(fs * 0.2)
        corr = np.correlate(fh, ck, mode="full")
        center = n - 1
        lo, hi = max(0, center - max_lag), min(len(corr), center + max_lag + 1)
        search = corr[lo:hi]
        peak_offset = int(np.argmax(np.abs(search)))
        lag_samples = abs((lo + peak_offset) - center)
        lag_ms = round(lag_samples / fs * 1000.0, 1)

        # Normalized cross-correlation strength as confidence indicator
        denom = float(np.std(fh) * np.std(ck) * n)
        peak_strength = float(np.max(np.abs(search))) / denom if denom > 1e-10 else 0.0
        conf_label = "medium" if peak_strength >= 0.4 else "low"

        return {
            "status": "surrogate_only_not_true_pwv",
            "value_m_per_s": None,
            "pulse_arrival_delay_ms": lag_ms,
            "method": "cross_correlation_between_face_rois",
            "confidence": conf_label,
            "notes": [
                "Pulse timing surrogate — not true pulse wave velocity.",
                "ROI traces use spatial approximations (top/middle face regions).",
                "True PWV requires two body sites with known separation or ECG+PPG timing.",
                _DISCLAIMER,
            ],
        }

    except Exception as exc:
        return {
            "status": "not_available_single_roi",
            "value_m_per_s": None,
            "pulse_arrival_delay_ms": None,
            "method": "cross_correlation_failed",
            "confidence": "unavailable",
            "notes": [f"Pulse timing estimation failed: {str(exc)[:120]}"],
        }


# ── Master compute function ───────────────────────────────────────────────────

def compute_experimental_vitals(
    bvp: Optional[np.ndarray],
    fs: float,
    duration_seconds: float,
    signal_quality: str,
    hr_bpm: Optional[float],
    mean_red_trace: Optional[np.ndarray] = None,
    mean_blue_trace: Optional[np.ndarray] = None,
    mean_green_trace: Optional[np.ndarray] = None,
    forehead_green: Optional[np.ndarray] = None,
    cheek_green: Optional[np.ndarray] = None,
    enable_rr: bool = True,
    enable_uncalibrated_bp: bool = False,
    enable_spo2_demo: bool = False,
    enable_pulse_timing: bool = True,
    user_cuff_systolic: Optional[float] = None,
    user_cuff_diastolic: Optional[float] = None,
) -> dict:
    """
    Compute all four experimental vital estimates.
    Never raises — each sub-estimate handles its own errors.
    Returns dict with keys: experimental_vitals_config, experimental_vitals.
    """
    config = {
        "enable_experimental_rr": enable_rr,
        "enable_experimental_uncalibrated_bp": enable_uncalibrated_bp,
        "enable_experimental_spo2_demo": enable_spo2_demo,
        "enable_experimental_pulse_timing": enable_pulse_timing,
    }

    rr = estimate_respiratory_rate(
        bvp=bvp, fs=fs, duration_seconds=duration_seconds,
        signal_quality=signal_quality, enabled=enable_rr,
    )
    bp = estimate_blood_pressure(
        hr_bpm=hr_bpm, bvp=bvp, fs=fs,
        enabled_demo=enable_uncalibrated_bp,
        user_cuff_systolic=user_cuff_systolic,
        user_cuff_diastolic=user_cuff_diastolic,
    )
    spo2 = estimate_spo2(
        mean_red_trace=mean_red_trace,
        mean_blue_trace=mean_blue_trace,
        mean_green_trace=mean_green_trace,
        fs=fs,
        hr_bpm=hr_bpm,
        enabled_demo=enable_spo2_demo,
    )
    pwv = estimate_pulse_timing(
        forehead_green=forehead_green,
        cheek_green=cheek_green,
        fs=fs,
        hr_bpm=hr_bpm,
        enabled=enable_pulse_timing,
    )

    return {
        "experimental_vitals_config": config,
        "experimental_vitals": {
            "respiratory_rate": rr,
            "blood_pressure": bp,
            "spo2": spo2,
            "pulse_wave_velocity": pwv,
            "disclaimer": (
                "These are experimental camera-derived wellness estimates for "
                "proof-of-concept only and are not diagnostic."
            ),
        },
    }


# ── Demo / test helper ────────────────────────────────────────────────────────

def demo_run(bvp: Optional[np.ndarray] = None, fs: float = 30.0, duration: float = 120.0):
    """
    Run all four experimental estimates on sample data and print results.
    Useful for testing without a full checkup session.

    Usage:
        python -c "from rppg.experimental_vitals import demo_run; demo_run()"
    """
    import json

    if bvp is None:
        # Synthesize a plausible BVP: 75 bpm HR + 15 br/min respiratory modulation
        t = np.arange(int(fs * duration)) / fs
        hr_hz = 75.0 / 60.0
        rr_hz = 15.0 / 60.0
        bvp = (
            np.sin(2 * np.pi * hr_hz * t)
            + 0.15 * np.sin(2 * np.pi * rr_hz * t)  # respiratory modulation
            + 0.05 * np.random.randn(len(t))
        )
        mean_red = 100.0 + np.sin(2 * np.pi * hr_hz * t) * 2.0 + np.random.randn(len(t)) * 0.5
        mean_blue = 80.0 + np.sin(2 * np.pi * hr_hz * t + 0.1) * 1.5 + np.random.randn(len(t)) * 0.5
        mean_green = 90.0 + np.sin(2 * np.pi * hr_hz * t + 0.05) * 1.8 + np.random.randn(len(t)) * 0.5
        forehead = mean_green + np.random.randn(len(t)) * 0.3
        cheek = mean_green + np.random.randn(len(t)) * 0.3
    else:
        mean_red = mean_blue = mean_green = forehead = cheek = None

    # Scenario 1: RR available, BP/SpO2 disabled, PWV with multi-ROI
    print("\n=== Scenario 1: RR enabled, BP/SpO2 disabled, PWV with ROI ===")
    r1 = compute_experimental_vitals(
        bvp=bvp, fs=fs, duration_seconds=duration, signal_quality="good",
        hr_bpm=75.0, mean_red_trace=mean_red, mean_blue_trace=mean_blue,
        mean_green_trace=mean_green, forehead_green=forehead, cheek_green=cheek,
        enable_rr=True, enable_uncalibrated_bp=False,
        enable_spo2_demo=False, enable_pulse_timing=True,
    )
    print(json.dumps(r1, indent=2, default=float))

    # Scenario 2: All demo flags enabled
    print("\n=== Scenario 2: All demo flags enabled ===")
    r2 = compute_experimental_vitals(
        bvp=bvp, fs=fs, duration_seconds=duration, signal_quality="medium",
        hr_bpm=80.0, mean_red_trace=mean_red, mean_blue_trace=mean_blue,
        mean_green_trace=mean_green, forehead_green=forehead, cheek_green=cheek,
        enable_rr=True, enable_uncalibrated_bp=True,
        enable_spo2_demo=True, enable_pulse_timing=True,
    )
    print(json.dumps(r2, indent=2, default=float))

    # Scenario 3: Low signal quality — all unavailable
    print("\n=== Scenario 3: Low quality short recording ===")
    short_bvp = bvp[:int(fs * 10)] if bvp is not None else None
    r3 = compute_experimental_vitals(
        bvp=short_bvp, fs=fs, duration_seconds=10.0, signal_quality="low",
        hr_bpm=None, mean_red_trace=None, mean_blue_trace=None,
        mean_green_trace=None, forehead_green=None, cheek_green=None,
        enable_rr=True, enable_uncalibrated_bp=True,
        enable_spo2_demo=True, enable_pulse_timing=True,
    )
    print(json.dumps(r3, indent=2, default=float))


if __name__ == "__main__":
    demo_run()
