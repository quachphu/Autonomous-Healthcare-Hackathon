"""
PDF text extraction service using pypdf.
Handles text-based PDFs (no OCR needed for MVP).
"""

import logging
from pathlib import Path
from typing import IO, Union

logger = logging.getLogger(__name__)


def extract_pdf_text(pdf_source: Union[str, Path, IO[bytes]]) -> dict:
    """
    Extract text from a PDF file or file-like object.

    Returns:
        {
            "text": "full concatenated text",
            "pages": [{"page_number": 1, "text": "..."}],
            "page_count": 4
        }

    Raises:
        RuntimeError if pypdf is not installed.
        ValueError if the PDF cannot be parsed.
    """
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError(
            "pypdf is required for PDF text extraction. "
            "Add it to requirements.txt and reinstall."
        ) from exc

    try:
        reader = PdfReader(pdf_source)
    except Exception as exc:
        raise ValueError(f"Cannot parse PDF: {exc}") from exc

    pages = []
    full_text_parts = []

    for i, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception as exc:
            logger.warning("Page %d extraction failed: %s", i + 1, exc)
            text = ""

        pages.append({"page_number": i + 1, "text": text})
        if text.strip():
            full_text_parts.append(text)

    full_text = "\n\n".join(full_text_parts)

    return {
        "text": full_text,
        "pages": pages,
        "page_count": len(reader.pages),
    }
