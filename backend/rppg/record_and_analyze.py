import cv2
import json
import time
import math
import numpy as np
from pathlib import Path
from datetime import datetime


OUTPUT_ROOT = Path("backend/rppg/output")
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

SESSION_ID = datetime.now().strftime("%Y%m%d_%H%M%S")
SESSION_DIR = OUTPUT_ROOT / SESSION_ID
SESSION_DIR.mkdir(parents=True, exist_ok=True)

VIDEO_PATH = SESSION_DIR / "vid.avi"
JSON_PATH = SESSION_DIR / "results.json"

# Optional: also save in UBFC-rPPG-compatible format for rPPG-Toolbox
TOOLBOX_DATA_DIR = Path("rPPG-Toolbox/data/UBFC-rPPG/subject1")
TOOLBOX_DATA_DIR.mkdir(parents=True, exist_ok=True)
TOOLBOX_VIDEO_PATH = TOOLBOX_DATA_DIR / "vid.avi"
TOOLBOX_GT_PATH = TOOLBOX_DATA_DIR / "ground_truth.txt"


def estimate_hr_from_green_signal(signal, fps):
    """
    Simple demo rPPG estimator:
    - Uses mean green-channel intensity over time
    - Removes trend
    - FFT to find dominant frequency in plausible heart-rate band
    """
    signal = np.array(signal, dtype=np.float32)

    if len(signal) < fps * 10:
        return None, "too_short"

    # Normalize
    signal = signal - np.mean(signal)
    std = np.std(signal)
    if std > 0:
        signal = signal / std

    # Basic windowing
    window = np.hanning(len(signal))
    signal = signal * window

    freqs = np.fft.rfftfreq(len(signal), d=1.0 / fps)
    fft_mag = np.abs(np.fft.rfft(signal))

    # Heart rate range: 45-150 bpm = 0.75-2.5 Hz
    mask = (freqs >= 0.75) & (freqs <= 2.5)

    if not np.any(mask):
        return None, "no_valid_frequency"

    valid_freqs = freqs[mask]
    valid_mag = fft_mag[mask]

    peak_idx = np.argmax(valid_mag)
    peak_freq = valid_freqs[peak_idx]
    bpm = peak_freq * 60.0

    # Basic signal confidence
    peak_power = valid_mag[peak_idx]
    avg_power = np.mean(valid_mag) + 1e-8
    snr_like = float(peak_power / avg_power)

    return float(bpm), snr_like


def main():
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        raise RuntimeError("Could not open webcam.")

    target_seconds = 120
    target_fps = 30

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480

    fourcc = cv2.VideoWriter_fourcc(*"XVID")
    writer = cv2.VideoWriter(str(VIDEO_PATH), fourcc, target_fps, (width, height))
    toolbox_writer = cv2.VideoWriter(str(TOOLBOX_VIDEO_PATH), fourcc, target_fps, (width, height))

    green_signal = []
    timestamps = []

    print("Recording 120-second rPPG clip.")
    print("Sit still, face the camera, use good lighting, and breathe normally.")

    start = time.time()
    frame_count = 0

    while time.time() - start < target_seconds:
        ret, frame = cap.read()
        if not ret:
            break

        elapsed = time.time() - start
        timestamps.append(elapsed)

        # Save full video
        writer.write(frame)
        toolbox_writer.write(frame)

        # Use central face-ish region for quick demo.
        # Later replace this with face detection.
        # Use a larger central face/upper-body region for quick demo.
        # Later replace this with face detection.
        h, w, _ = frame.shape

        x1, x2 = int(w * 0.25), int(w * 0.75)
        y1, y2 = int(h * 0.12), int(h * 0.62)

        roi = frame[y1:y2, x1:x2]

        # OpenCV uses BGR. Green channel is index 1.
        mean_green = float(np.mean(roi[:, :, 1]))
        green_signal.append(mean_green)

        # Draw ROI for preview
        preview = frame.copy()
        cv2.rectangle(preview, (x1, y1), (x2, y2), (0, 255, 0), 2)
        remaining = max(0, int(target_seconds - elapsed))
        cv2.putText(
            preview,
            f"Recording: {remaining}s",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (255, 255, 255),
            2,
        )

        cv2.imshow("NatalNanny rPPG Recording", preview)

        frame_count += 1

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    end = time.time()

    cap.release()
    writer.release()
    toolbox_writer.release()
    cv2.destroyAllWindows()

    duration = end - start
    actual_fps = frame_count / duration if duration > 0 else target_fps

    hr_bpm, quality = estimate_hr_from_green_signal(green_signal, actual_fps)

    # Dummy ground truth so rPPG-Toolbox UBFC loader has the expected file.
    # This is not real clinical ground truth.
    TOOLBOX_GT_PATH.write_text("0\n0\n0\n")

    if hr_bpm is None:
        signal_quality = "low"
    elif isinstance(quality, float) and quality > 5:
        signal_quality = "good"
    elif isinstance(quality, float) and quality > 2.5:
        signal_quality = "medium"
    else:
        signal_quality = "low"

    results = {
        "session_id": SESSION_ID,
        "created_at": datetime.now().isoformat(),
        "recording": {
            "duration_seconds": round(duration, 2),
            "frame_count": frame_count,
            "estimated_fps": round(actual_fps, 2),
            "video_path": str(VIDEO_PATH),
            "toolbox_compatible_video_path": str(TOOLBOX_VIDEO_PATH),
        },
        "rppg_demo_analysis": {
            "method": "mean_green_channel_fft_demo",
            "estimated_heart_rate_bpm": round(hr_bpm, 1) if hr_bpm else None,
            "signal_quality": signal_quality,
            "quality_score": round(float(quality), 3) if isinstance(quality, float) else quality,
            "notes": [
                "This is a prototype rPPG estimate, not a medical diagnosis.",
                "For better accuracy, use face detection and validated rPPG-Toolbox methods.",
                "Respiratory rate is not estimated in this simple script yet."
            ],
        },
        "available_raw_signals": {
            "green_channel_samples": len(green_signal),
            "timestamps_samples": len(timestamps),
        },
        "safety_notice": "Seek urgent medical care for chest pain, trouble breathing, fainting, seizure, severe headache, vision changes, heavy bleeding, or reduced fetal movement."
    }

    JSON_PATH.write_text(json.dumps(results, indent=2))

    print("\nDone.")
    print(f"Video saved to: {VIDEO_PATH}")
    print(f"Toolbox-compatible video saved to: {TOOLBOX_VIDEO_PATH}")
    print(f"JSON saved to: {JSON_PATH}")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()