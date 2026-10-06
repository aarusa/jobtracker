from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Application, User
from app.schemas.scrape import ScrapePreviewRequest, ScrapePreviewResponse
from app.services.scraper import UnsafeUrlError, scrape_job_url

router = APIRouter(prefix="/scrape", tags=["scrape"])


@router.post("/preview", response_model=ScrapePreviewResponse)
def scrape_preview(
    body: ScrapePreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ScrapePreviewResponse:
    url = str(body.url)
    try:
        scraped = scrape_job_url(url, settings=settings)
    except UnsafeUrlError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc) or "Invalid or blocked URL",
        ) from exc

    existing_id = db.scalar(
        select(Application.id).where(
            Application.user_id == current_user.id,
            Application.job_url_normalized == scraped.job_url_normalized,
        )
    )

    return ScrapePreviewResponse(
        job_url=scraped.job_url,
        job_url_normalized=scraped.job_url_normalized,
        source_domain=scraped.source_domain,
        title=scraped.title,
        company=scraped.company,
        location=scraped.location,
        work_type=scraped.work_type,
        employment_type=scraped.employment_type,
        salary_text=scraped.salary_text,
        description=scraped.description,
        date_posted=scraped.date_posted,
        scrape_status=scraped.scrape_status,
        message=scraped.message,
        existing_application_id=existing_id,
    )
