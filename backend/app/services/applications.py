from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Application, Document, StatusHistory, User
from app.models.enums import ApplicationStatus, DocumentKind
from app.schemas.applications import ApplicationOut, DocumentRef, StatusHistoryOut
from app.services.scraper import UnsafeUrlError, normalize_url, source_domain_from_url


class DuplicateApplicationError(Exception):
    def __init__(self, existing_id: uuid.UUID) -> None:
        self.existing_id = existing_id
        super().__init__("An application with this URL already exists")


def get_owned_application(
    db: Session,
    *,
    application_id: uuid.UUID,
    user: User,
    with_history: bool = False,
) -> Application:
    stmt = select(Application).where(
        Application.id == application_id,
        Application.user_id == user.id,
    )
    stmt = stmt.options(
        selectinload(Application.resume),
        selectinload(Application.cover_letter),
    )
    if with_history:
        stmt = stmt.options(selectinload(Application.status_history))

    application = db.scalar(stmt)
    if application is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return application


def validate_document_link(
    db: Session,
    *,
    user: User,
    document_id: uuid.UUID | None,
    expected_kind: DocumentKind,
    field_name: str,
) -> None:
    if document_id is None:
        return
    document = db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == user.id)
    )
    if document is None or document.kind != expected_kind:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}: must be one of your {expected_kind.value} documents",
        )


def normalize_job_url(url: str) -> tuple[str, str, str]:
    """Return (original, normalized, source_domain)."""
    original = url.strip()
    try:
        normalized = normalize_url(original)
    except UnsafeUrlError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc) or "Invalid job URL",
        ) from exc
    return original, normalized, source_domain_from_url(normalized)


def find_duplicate(
    db: Session,
    *,
    user_id: uuid.UUID,
    job_url_normalized: str,
    exclude_id: uuid.UUID | None = None,
) -> Application | None:
    stmt = select(Application).where(
        Application.user_id == user_id,
        Application.job_url_normalized == job_url_normalized,
    )
    if exclude_id is not None:
        stmt = stmt.where(Application.id != exclude_id)
    return db.scalar(stmt)


def touch_updated_at(application: Application) -> None:
    application.updated_at = datetime.now(UTC)


def add_status_history(
    db: Session,
    *,
    application: Application,
    from_status: ApplicationStatus | None,
    to_status: ApplicationStatus,
    note: str | None = None,
) -> StatusHistory:
    row = StatusHistory(
        from_status=from_status,
        to_status=to_status,
        note=note,
    )
    # Append via relationship so cascade/delete-orphan does not drop the row.
    application.status_history.append(row)
    db.add(row)
    return row


def to_application_out(
    application: Application,
    *,
    include_description: bool = True,
    include_history: bool = False,
) -> ApplicationOut:
    history: list[StatusHistoryOut] | None = None
    if include_history:
        rows = sorted(application.status_history, key=lambda item: item.changed_at)
        history = [
            StatusHistoryOut(
                from_status=row.from_status,
                to_status=row.to_status,
                note=row.note,
                changed_at=row.changed_at,
            )
            for row in rows
        ]

    return ApplicationOut(
        id=application.id,
        job_url=application.job_url,
        title=application.title,
        company=application.company,
        location=application.location,
        work_type=application.work_type,
        employment_type=application.employment_type,
        salary_text=application.salary_text,
        description=application.description if include_description else None,
        date_posted=application.date_posted,
        source_domain=application.source_domain,
        status=application.status,
        applied_at=application.applied_at,
        resume=DocumentRef.model_validate(application.resume) if application.resume else None,
        cover_letter=(
            DocumentRef.model_validate(application.cover_letter)
            if application.cover_letter
            else None
        ),
        scrape_status=application.scrape_status,
        notes=application.notes,
        tags=list(application.tags or []),
        created_at=application.created_at,
        updated_at=application.updated_at,
        status_history=history,
    )


def default_applied_at(value: date | None) -> date:
    return value or date.today()
