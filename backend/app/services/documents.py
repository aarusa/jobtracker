from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

ALLOWED_EXTENSIONS = {".pdf", ".docx"}
ALLOWED_MIMES = {
    PDF_MIME,
    DOCX_MIME,
    # Some browsers send these for DOCX:
    "application/zip",
    "application/octet-stream",
}


@dataclass(frozen=True)
class ValidatedUpload:
    extension: str
    mime_type: str
    data: bytes
    size_bytes: int


def _extension(filename: str) -> str:
    name = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if "." not in name:
        return ""
    return f".{name.rsplit('.', 1)[-1].lower()}"


def _looks_like_pdf(data: bytes) -> bool:
    return data.startswith(b"%PDF")


def _looks_like_docx(data: bytes) -> bool:
    # DOCX is a ZIP package; PK\x03\x04 is the local file header magic.
    return data[:4] == b"PK\x03\x04"


def validate_upload(
    *,
    filename: str | None,
    content_type: str | None,
    data: bytes,
    max_upload_mb: int,
) -> ValidatedUpload:
    max_bytes = max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"File too large. Maximum size is {max_upload_mb} MB.",
        )
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    ext = _extension(filename or "")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF and DOCX files are allowed",
        )

    mime = (content_type or "").split(";")[0].strip().lower()
    if mime and mime not in ALLOWED_MIMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type",
        )

    if ext == ".pdf":
        if not _looks_like_pdf(data):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File content does not match a PDF",
            )
        return ValidatedUpload(
            extension=".pdf",
            mime_type=PDF_MIME,
            data=data,
            size_bytes=len(data),
        )

    if not _looks_like_docx(data):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match a DOCX",
        )
    return ValidatedUpload(
        extension=".docx",
        mime_type=DOCX_MIME,
        data=data,
        size_bytes=len(data),
    )


def default_label_from_filename(filename: str) -> str:
    name = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if "." in name:
        name = name.rsplit(".", 1)[0]
    label = name.strip() or "Untitled"
    return label[:200]
