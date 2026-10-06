from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Application, ApplicationStatus, StatusHistory, User


def test_create_user_application_and_status_history(db: Session) -> None:
    user = User(
        email="test@example.com",
        password_hash="not-a-real-hash",
        name="Test User",
    )
    db.add(user)
    db.flush()

    application = Application(
        user_id=user.id,
        job_url="https://example.com/jobs/123?utm_source=x",
        job_url_normalized="https://example.com/jobs/123",
        title="Backend Engineer",
        company="Example Pty Ltd",
        source_domain="example.com",
        status=ApplicationStatus.applied,
        applied_at=date(2026, 10, 6),
    )
    db.add(application)
    db.flush()

    history = StatusHistory(
        application_id=application.id,
        from_status=None,
        to_status=ApplicationStatus.applied,
        note=None,
    )
    db.add(history)
    db.flush()

    loaded = db.scalar(select(Application).where(Application.id == application.id))
    assert loaded is not None
    assert loaded.user_id == user.id
    assert loaded.status == ApplicationStatus.applied
    assert loaded.title == "Backend Engineer"

    history_rows = db.scalars(
        select(StatusHistory).where(StatusHistory.application_id == application.id)
    ).all()
    assert len(history_rows) == 1
    assert history_rows[0].from_status is None
    assert history_rows[0].to_status == ApplicationStatus.applied
