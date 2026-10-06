from datetime import date
from uuid import UUID

from pydantic import BaseModel, HttpUrl

from app.models.enums import ScrapeStatus, WorkType


class ScrapePreviewRequest(BaseModel):
    url: HttpUrl


class ScrapePreviewResponse(BaseModel):
    job_url: str
    job_url_normalized: str
    source_domain: str
    title: str | None = None
    company: str | None = None
    location: str | None = None
    work_type: WorkType = WorkType.unknown
    employment_type: str | None = None
    salary_text: str | None = None
    description: str | None = None
    date_posted: date | None = None
    scrape_status: ScrapeStatus
    message: str | None = None
    existing_application_id: UUID | None = None
