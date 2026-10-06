from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Application, Document, User
from app.models.enums import DocumentKind
from app.schemas.documents import DocumentOut, DocumentUpdate
from app.services.documents import default_label_from_filename, validate_upload
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/documents", tags=["documents"])


def _used_by_count_expr():
    return (
        select(func.count(Application.id))
        .where(
            or_(
                Application.resume_id == Document.id,
                Application.cover_letter_id == Document.id,
            )
        )
        .correlate(Document)
        .scalar_subquery()
        .label("used_by_count")
    )


def _get_owned_document(
    db: Session,
    *,
    document_id: uuid.UUID,
    user: User,
) -> Document:
    document = db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == user.id)
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


def _to_out(document: Document, used_by_count: int) -> DocumentOut:
    return DocumentOut(
        id=document.id,
        kind=document.kind,
        label=document.label,
        original_filename=document.original_filename,
        mime_type=document.mime_type,
        size_bytes=document.size_bytes,
        created_at=document.created_at,
        used_by_count=used_by_count,
    )


@router.get("", response_model=list[DocumentOut])
def list_documents(
    kind: DocumentKind | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DocumentOut]:
    stmt = (
        select(Document, _used_by_count_expr())
        .where(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
    )
    if kind is not None:
        stmt = stmt.where(Document.kind == kind)

    rows = db.execute(stmt).all()
    return [_to_out(document, int(count or 0)) for document, count in rows]


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    kind: DocumentKind = Form(...),
    label: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_storage),
) -> DocumentOut:
    data = await file.read()
    validated = validate_upload(
        filename=file.filename,
        content_type=file.content_type,
        data=data,
        max_upload_mb=settings.max_upload_mb,
    )

    original_filename = (file.filename or f"upload{validated.extension}")[:255]
    resolved_label = (label.strip() if label and label.strip() else None) or (
        default_label_from_filename(original_filename)
    )

    storage_key = storage.save(validated.data, extension=validated.extension)
    document = Document(
        user_id=current_user.id,
        kind=kind,
        label=resolved_label[:200],
        original_filename=original_filename,
        storage_key=storage_key,
        mime_type=validated.mime_type,
        size_bytes=validated.size_bytes,
    )
    db.add(document)
    try:
        db.commit()
    except Exception:
        storage.delete(storage_key)
        raise
    db.refresh(document)
    return _to_out(document, used_by_count=0)


@router.patch("/{document_id}", response_model=DocumentOut)
def rename_document(
    document_id: uuid.UUID,
    body: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentOut:
    document = _get_owned_document(db, document_id=document_id, user=current_user)
    document.label = body.label.strip()
    db.commit()
    db.refresh(document)

    count = db.scalar(
        select(func.count(Application.id)).where(
            or_(
                Application.resume_id == document.id,
                Application.cover_letter_id == document.id,
            )
        )
    )
    return _to_out(document, used_by_count=int(count or 0))


@router.get("/{document_id}/download")
def download_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: Storage = Depends(get_storage),
) -> FileResponse:
    document = _get_owned_document(db, document_id=document_id, user=current_user)
    try:
        path: Path = storage.open(document.storage_key)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file not found",
        ) from exc

    return FileResponse(
        path=path,
        media_type=document.mime_type,
        filename=document.original_filename,
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: Storage = Depends(get_storage),
) -> None:
    document = _get_owned_document(db, document_id=document_id, user=current_user)
    storage_key = document.storage_key
    db.delete(document)
    db.commit()
    storage.delete(storage_key)
