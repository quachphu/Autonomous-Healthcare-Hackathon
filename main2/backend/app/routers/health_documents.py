"""
Health document upload, list, get, and delete endpoints.

POST   /api/profile/health-documents/upload
GET    /api/profile/health-documents
GET    /api/profile/health-documents/{document_id}
DELETE /api/profile/health-documents/{document_id}
"""

import io
import logging
import uuid as _uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.config import Settings, get_settings
from app.dependencies import CurrentUser, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health-documents"])

Cfg = Annotated[Settings, Depends(get_settings)]
Auth = Annotated[CurrentUser, Depends(get_current_user)]

MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _get_sb(cfg: Settings):
    from supabase import create_client
    if not cfg.supabase_url or not cfg.supabase_service_role_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase is not configured on this server. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        )
    return create_client(cfg.supabase_url, cfg.supabase_service_role_key)


@router.post("/profile/health-documents/upload")
async def upload_health_document(
    cfg: Cfg,
    current_user: Auth,
    file: UploadFile = File(...),
) -> dict:
    """Upload a PDF health document, extract text, embed, and index for RAG."""

    filename = file.filename or "document.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only PDF files are supported. Please upload a .pdf file.",
        )

    content_type = file.content_type or ""
    if content_type and "pdf" not in content_type and content_type not in (
        "application/octet-stream", ""
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File must be a PDF (application/pdf).",
        )

    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="PDF is too large. Maximum size is 20 MB.",
        )
    if len(data) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )

    sb = _get_sb(cfg)
    document_id = str(_uuid.uuid4())
    user_id = current_user.id
    storage_path = f"{user_id}/{document_id}/{filename}"

    # Upload to Supabase Storage
    try:
        sb.storage.from_(cfg.supabase_health_docs_bucket).upload(
            path=storage_path,
            file=data,
            file_options={"content-type": "application/pdf", "upsert": "false"},
        )
    except Exception as exc:
        logger.error("Storage upload failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload file to storage: {exc}",
        )

    # Insert document record with status 'uploaded'
    uploaded_at = _now_iso()
    doc_row = {
        "id": document_id,
        "user_id": user_id,
        "file_name": filename,
        "file_path": storage_path,
        "file_size_bytes": len(data),
        "mime_type": "application/pdf",
        "uploaded_at": uploaded_at,
        "processing_status": "uploaded",
    }
    try:
        sb.table(cfg.supabase_documents_table).insert(doc_row).execute()
    except Exception as exc:
        logger.error("DB insert failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to save document metadata: {exc}")

    # Extract PDF text
    extracted = None
    try:
        from app.services.pdf_processing import extract_pdf_text
        extracted = extract_pdf_text(io.BytesIO(data))

        preview = extracted["text"][:500] if extracted["text"] else None
        sb.table(cfg.supabase_documents_table).update({
            "processing_status": "processing",
            "page_count": extracted["page_count"],
            "extracted_text_preview": preview,
        }).eq("id", document_id).execute()

    except Exception as exc:
        logger.error("PDF parsing failed for %s: %s", document_id, exc)
        sb.table(cfg.supabase_documents_table).update({
            "processing_status": "failed",
            "error_message": f"PDF parsing failed: {exc}",
        }).eq("id", document_id).execute()
        return {
            "document_id": document_id,
            "file_name": filename,
            "file_size_bytes": len(data),
            "processing_status": "failed",
            "uploaded_at": uploaded_at,
            "error": (
                "Your file was uploaded but could not be parsed. "
                "Make sure it is a text-based PDF (not a scanned image). "
                f"Details: {exc}"
            ),
        }

    # Chunk and embed
    processing_status = "uploaded"
    warning = None

    if not cfg.openai_api_key:
        warning = "Indexing skipped: OPENAI_API_KEY is not configured on this server."
        sb.table(cfg.supabase_documents_table).update({
            "processing_status": "uploaded",
            "error_message": warning,
        }).eq("id", document_id).execute()
    else:
        try:
            from app.services.rag_indexing import index_health_document
            n_chunks = await index_health_document(
                user_id=user_id,
                document_id=document_id,
                extracted_pages=extracted["pages"],
                supabase_url=cfg.supabase_url,
                service_key=cfg.supabase_service_role_key,
                openai_api_key=cfg.openai_api_key,
            )
            processing_status = "indexed"
            sb.table(cfg.supabase_documents_table).update({
                "processing_status": "indexed",
                "metadata": {"chunk_count": n_chunks},
            }).eq("id", document_id).execute()
        except Exception as exc:
            warning = f"Indexing failed: {exc}"
            logger.error("Indexing failed for %s: %s", document_id, exc)
            processing_status = "partially_indexed"
            sb.table(cfg.supabase_documents_table).update({
                "processing_status": "partially_indexed",
                "error_message": warning,
            }).eq("id", document_id).execute()

    response: dict = {
        "document_id": document_id,
        "file_name": filename,
        "file_size_bytes": len(data),
        "page_count": extracted["page_count"] if extracted else None,
        "processing_status": processing_status,
        "uploaded_at": uploaded_at,
    }
    if warning:
        response["warning"] = warning
    return response


@router.get("/profile/health-documents")
async def list_health_documents(cfg: Cfg, current_user: Auth) -> list:
    """Return all health documents for the authenticated user."""
    sb = _get_sb(cfg)
    try:
        result = (
            sb.table(cfg.supabase_documents_table)
            .select(
                "id, file_name, file_size_bytes, document_type, uploaded_at, "
                "processing_status, page_count, error_message, metadata"
            )
            .eq("user_id", current_user.id)
            .order("uploaded_at", desc=True)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        logger.error("List documents failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve documents: {exc}")


@router.get("/profile/health-documents/{document_id}")
async def get_health_document(document_id: str, cfg: Cfg, current_user: Auth) -> dict:
    """Return full metadata for one document (including preview text)."""
    sb = _get_sb(cfg)
    try:
        result = (
            sb.table(cfg.supabase_documents_table)
            .select("*")
            .eq("id", document_id)
            .eq("user_id", current_user.id)
            .single()
            .execute()
        )
    except Exception as exc:
        logger.error("Get document failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve document: {exc}")

    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")
    return result.data


@router.delete("/profile/health-documents/{document_id}", status_code=204)
async def delete_health_document(document_id: str, cfg: Cfg, current_user: Auth) -> None:
    """Delete document metadata, chunks, and the original file from storage."""
    sb = _get_sb(cfg)

    # Verify ownership and get file_path
    try:
        result = (
            sb.table(cfg.supabase_documents_table)
            .select("id, file_path")
            .eq("id", document_id)
            .eq("user_id", current_user.id)
            .single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch document: {exc}")

    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = result.data["file_path"]

    # Chunks are cascade-deleted via FK; delete the row first
    try:
        sb.table(cfg.supabase_documents_table).delete().eq("id", document_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete document record: {exc}")

    # Remove from storage (non-fatal if it fails)
    try:
        sb.storage.from_(cfg.supabase_health_docs_bucket).remove([file_path])
    except Exception as exc:
        logger.warning("Storage delete failed (record already removed): %s", exc)
