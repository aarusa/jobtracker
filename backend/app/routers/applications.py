from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.deps import get_current_user
from app.models import Application, User
from app.models.enums import ApplicationStatus, DocumentKind
from app.schemas.applications import (
    ApplicationCreate,
    ApplicationListItem,
    ApplicationListOut,
    ApplicationOut,
    ApplicationStatsOut,
    ApplicationUpdate,
)
from app.services.applications import (
    DuplicateApplicationError,
    add_status_history,
    default_applied_at,
    find_duplicate,
    get_owned_application,
    normalize_job_url,
    to_application_out,
    touch_updated_at,
    validate_document_link,
)

router = APIRouter(prefix="/applications", tags=["applications"])


def _parse_sort(sort: str) -> tuple[str, bool]:
    descending = sort.startswith("-")
    field = sort[1:] if descending else sort
    if field not in {"applied_at", "updated_at"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sort must be applied_at or updated_at, optionally prefixed with -",
        )
    return field, descending


@router.get("/stats", response_model=ApplicationStatsOut)
def application_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApplicationStatsOut:
    rows = db.execute(
        select(Application.status, func.count())
        .where(Application.user_id == current_user.id)
        .group_by(Application.status)
    ).all()
    counts = {status_value.value: 0 for status_value in ApplicationStatus}
    total = 0
    for status_value, count in rows:
        key = status_value.value if hasattr(status_value, "value") else str(status_value)
        counts[key] = int(count)
        total += int(count)
    return ApplicationStatsOut(**counts, total=total)


@router.get("", response_model=ApplicationListOut)
def list_applications(
    q: str | None = None,
    status_filter: Annotated[
        list[ApplicationStatus] | None,
        Query(alias="status"),
    ] = None,
    sort: str = "-applied_at",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApplicationListOut:
    sort_field, descending = _parse_sort(sort)
    filters = [Application.user_id == current_user.id]
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(or_(Application.company.ilike(pattern), Application.title.ilike(pattern)))
    if status_filter:
        filters.append(Application.status.in_(status_filter))

    total = db.scalar(select(func.count()).select_from(Application).where(*filters)) or 0

    order_column = getattr(Application, sort_field)
    order_by = order_column.desc() if descending else order_column.asc()

    items = db.scalars(
        select(Application)
        .where(*filters)
        .options(
            selectinload(Application.resume),
            selectinload(Application.cover_letter),
        )
        .order_by(order_by, Application.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return ApplicationListOut(
        items=[
            ApplicationListItem.model_validate(
                to_application_out(item, include_description=False, include_history=False)
            )
            for item in items
        ],
        total=int(total),
    )


@router.post("", response_model=ApplicationOut, status_code=status.HTTP_201_CREATED)
def create_application(
    body: ApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApplicationOut:
    original, normalized, source_domain = normalize_job_url(str(body.job_url))

    duplicate = find_duplicate(db, user_id=current_user.id, job_url_normalized=normalized)
    if duplicate is not None:
        raise DuplicateApplicationError(duplicate.id)

    validate_document_link(
        db,
        user=current_user,
        document_id=body.resume_id,
        expected_kind=DocumentKind.resume,
        field_name="resume_id",
    )
    validate_document_link(
        db,
        user=current_user,
        document_id=body.cover_letter_id,
        expected_kind=DocumentKind.cover_letter,
        field_name="cover_letter_id",
    )

    application = Application(
        user_id=current_user.id,
        job_url=original,
        job_url_normalized=normalized,
        title=body.title,
        company=body.company,
        location=body.location,
        work_type=body.work_type,
        employment_type=body.employment_type,
        salary_text=body.salary_text,
        description=body.description,
        date_posted=body.date_posted,
        source_domain=source_domain,
        status=ApplicationStatus.applied,
        applied_at=default_applied_at(body.applied_at),
        resume_id=body.resume_id,
        cover_letter_id=body.cover_letter_id,
        scrape_status=body.scrape_status,
        notes=body.notes,
    )
    db.add(application)
    db.flush()
    add_status_history(
        db,
        application=application,
        from_status=None,
        to_status=ApplicationStatus.applied,
    )
    db.commit()

    loaded = get_owned_application(
        db, application_id=application.id, user=current_user, with_history=True
    )
    return to_application_out(loaded, include_description=True, include_history=True)


@router.get("/{application_id}", response_model=ApplicationOut)
def get_application(
    application_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApplicationOut:
    application = get_owned_application(
        db, application_id=application_id, user=current_user, with_history=True
    )
    return to_application_out(application, include_description=True, include_history=True)


@router.patch("/{application_id}", response_model=ApplicationOut)
def update_application(
    application_id: uuid.UUID,
    body: ApplicationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApplicationOut:
    application = get_owned_application(
        db, application_id=application_id, user=current_user, with_history=True
    )
    data = body.model_dump(exclude_unset=True)
    status_note = data.pop("status_note", None)
    new_status = data.pop("status", None)

    if "job_url" in data and data["job_url"] is not None:
        original, normalized, source_domain = normalize_job_url(str(data["job_url"]))
        duplicate = find_duplicate(
            db,
            user_id=current_user.id,
            job_url_normalized=normalized,
            exclude_id=application.id,
        )
        if duplicate is not None:
            raise DuplicateApplicationError(duplicate.id)
        application.job_url = original
        application.job_url_normalized = normalized
        application.source_domain = source_domain
        data.pop("job_url", None)

    if "resume_id" in data:
        validate_document_link(
            db,
            user=current_user,
            document_id=data["resume_id"],
            expected_kind=DocumentKind.resume,
            field_name="resume_id",
        )
        application.resume_id = data.pop("resume_id")
        if application.resume_id is None:
            application.resume = None
    if "cover_letter_id" in data:
        validate_document_link(
            db,
            user=current_user,
            document_id=data["cover_letter_id"],
            expected_kind=DocumentKind.cover_letter,
            field_name="cover_letter_id",
        )
        application.cover_letter_id = data.pop("cover_letter_id")
        if application.cover_letter_id is None:
            application.cover_letter = None

    for field_name, value in data.items():
        setattr(application, field_name, value)

    if new_status is not None and new_status != application.status:
        add_status_history(
            db,
            application=application,
            from_status=application.status,
            to_status=new_status,
            note=status_note,
        )
        application.status = new_status

    touch_updated_at(application)
    db.commit()

    loaded = get_owned_application(
        db, application_id=application.id, user=current_user, with_history=True
    )
    return to_application_out(loaded, include_description=True, include_history=True)


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(
    application_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    application = get_owned_application(
        db, application_id=application_id, user=current_user, with_history=False
    )
    db.delete(application)
    db.commit()
