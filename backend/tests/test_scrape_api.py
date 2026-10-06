from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.conftest import register_and_login

from app.models import Application
from app.models.enums import ApplicationStatus, ScrapeStatus
from app.services.scraper import ScrapedJob, UnsafeUrlError


def test_scrape_preview_requires_auth(client: TestClient) -> None:
    response = client.post("/api/scrape/preview", json={"url": "https://example.com/jobs/1"})
    assert response.status_code == 401


def test_scrape_preview_rejects_private_url(client: TestClient) -> None:
    register_and_login(client, email="scrape-private@example.com")
    response = client.post("/api/scrape/preview", json={"url": "http://127.0.0.1/jobs/1"})
    assert response.status_code == 400


def test_scrape_preview_success(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_and_login(client, email="scrape-ok@example.com")

    def fake_scrape(url: str, **kwargs: object) -> ScrapedJob:
        return ScrapedJob(
            job_url=url,
            job_url_normalized="https://example.com/jobs/123",
            source_domain="example.com",
            title="Senior Backend Engineer",
            company="Example Pty Ltd",
            location="Melbourne, VIC",
            scrape_status=ScrapeStatus.success,
        )

    monkeypatch.setattr("app.routers.scrape.scrape_job_url", fake_scrape)
    response = client.post(
        "/api/scrape/preview",
        json={"url": "https://example.com/jobs/123?utm_source=x"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["title"] == "Senior Backend Engineer"
    assert body["company"] == "Example Pty Ltd"
    assert body["scrape_status"] == "success"
    assert body["existing_application_id"] is None


def test_scrape_preview_includes_existing_application_id(
    client: TestClient,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_and_login(client, email="scrape-dup@example.com")
    me = client.get("/api/auth/me").json()

    application = Application(
        user_id=UUID(me["id"]),
        job_url="https://example.com/jobs/123",
        job_url_normalized="https://example.com/jobs/123",
        title="Existing",
        status=ApplicationStatus.applied,
    )
    db.add(application)
    db.commit()
    db.refresh(application)

    def fake_scrape(url: str, **kwargs: object) -> ScrapedJob:
        return ScrapedJob(
            job_url=url,
            job_url_normalized="https://example.com/jobs/123",
            source_domain="example.com",
            title="Senior Backend Engineer",
            company="Example Pty Ltd",
            scrape_status=ScrapeStatus.success,
        )

    monkeypatch.setattr("app.routers.scrape.scrape_job_url", fake_scrape)
    response = client.post(
        "/api/scrape/preview",
        json={"url": "https://example.com/jobs/123"},
    )
    assert response.status_code == 200
    assert response.json()["existing_application_id"] == str(application.id)


def test_scrape_preview_unsafe_url_maps_to_400(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_and_login(client, email="scrape-unsafe@example.com")

    def boom(url: str, **kwargs: object) -> ScrapedJob:
        raise UnsafeUrlError("URL resolves to a blocked network address")

    monkeypatch.setattr("app.routers.scrape.scrape_job_url", boom)
    response = client.post("/api/scrape/preview", json={"url": "https://example.com/x"})
    assert response.status_code == 400
