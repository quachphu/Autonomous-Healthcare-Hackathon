"""
POST /api/tts/speak  — generate Ava Neural audio via edge-tts and stream MP3 bytes.
Falls back gracefully when edge-tts is unavailable.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

router = APIRouter(tags=["tts"])

TTS_VOICE = "en-US-AvaNeural"
MAX_TEXT_LENGTH = 500


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None


@router.post("/tts/speak")
async def tts_speak(req: TTSRequest):
    text = req.text.strip()[:MAX_TEXT_LENGTH]
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    voice = req.voice or TTS_VOICE

    try:
        import edge_tts
    except ImportError:
        raise HTTPException(status_code=503, detail="edge-tts not installed")

    try:
        communicate = edge_tts.Communicate(text, voice)
        audio_bytes = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_bytes += chunk["data"]

        if not audio_bytes:
            raise HTTPException(status_code=502, detail="edge-tts returned no audio")

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-store"},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TTS generation failed: {exc}") from exc
