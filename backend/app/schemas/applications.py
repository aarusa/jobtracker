from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, HttpUrl

from app.models.enums import ApplicationStatus, ScrapeStatus, WorkType


class DocumentRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str


class StatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    from_status: ApplicationStatus | None
    to_status: ApplicationStatus
    note: str | None
    changed_at: datetime


class ApplicationCreate(BaseModel):
    job_url: HttpUrl
    title: str | None = None
    company: str | None = None
    location: str | None = None
    work_type: WorkType = WorkType.unknown
    employment_type: str | None = None
    salary_text: str | None = None
    description: str | None = None
    date_posted: date | None = None
    applied_at: date | None = None
    resume_id: UUID | None = None
    cover_letter_id: UUID | None = None
    scrape_status: ScrapeStatus | None = None
    notes: str | None = None


class ApplicationUpdate(BaseModel):
    job_url: HttpUrl | None = None
    title: str | None = None
    company: str | None = None
    location: str | None = None
    work_type: WorkType | None = None
    employment_type: str | None = None
    salary_text: str | None = None
    description: str | None = None
    date_posted: date | None = None
    applied_at: date | None = None
    resume_id: UUID | None = None
    cover_letter_id: UUID | None = None
    scrape_status: ScrapeStatus | None = None
    notes: str | None = None
    status: ApplicationStatus | None = None
    status_note: str | None = None


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    job_url: str
    title: str | None = None
    company: str | None = None
    location: str | None = None
    work_type: WorkType
    employment_type: str | None = None
    salary_text: str | None = None
    description: str | None = None
    date_posted: date | None = None
    source_domain: str | None = None
    status: ApplicationStatus
    applied_at: date
    resume: DocumentRef | None = None
    cover_letter: DocumentRef | None = None
    scrape_status: ScrapeStatus | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    status_history: list[StatusHistoryOut] | None = None


class ApplicationListItem(BaseModel):
    """List payload omits description and status_history."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    job_url: str
    title: str | None = None
    company: str | None = None
    location: str | None = None
    work_type: WorkType
    employment_type: str | None = None
    salary_text: str | None = None
    date_posted: date | None = None
    source_domain: str | None = None
    status: ApplicationStatus
    applied_at: date
    resume: DocumentRef | None = None
    cover_letter: DocumentRef | None = None
    scrape_status: ScrapeStatus | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class ApplicationListOut(BaseModel):
    items: list[ApplicationListItem]
    total: int


class ApplicationStatsOut(BaseModel):
    applied: int = 0
    screening: int = 0
    interviewing: int = 0
    offer: int = 0
    accepted: int = 0
    rejected: int = 0
    withdrawn: int = 0
    total: int = 0
