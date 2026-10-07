from __future__ import annotations

from datetime import date
from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient
from tests.conftest import make_pdf_bytes, register_and_login


def _create_doc(client: TestClient, *, kind: str = "resume", label: str = "Doc") -> str:
    response = client.post(
        "/api/documents",
        data={"kind": kind, "label": label},
        files={"file": ("file.pdf", BytesIO(make_pdf_bytes()), "application/pdf")},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_application(
    client: TestClient,
    *,
    url: str = "https://example.com/jobs/1",
    title: str = "Engineer",
    company: str = "Example",
    resume_id: str | None = None,
    cover_letter_id: str | None = None,
    tags: list[str] | None = None,
) -> dict:
    payload: dict = {
        "job_url": url,
        "title": title,
        "company": company,
        "scrape_status": "manual",
    }
    if resume_id is not None:
        payload["resume_id"] = resume_id
    if cover_letter_id is not None:
        payload["cover_letter_id"] = cover_letter_id
    if tags is not None:
        payload["tags"] = tags
    response = client.post("/api/applications", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_list_detail_stats_delete(client: TestClient) -> None:
    register_and_login(client, email="apps@example.com")
    created = _create_application(
        client,
        url="https://example.com/jobs/abc?utm_source=x",
        title="Backend Engineer",
        company="Example Pty Ltd",
    )
    assert created["status"] == "applied"
    assert created["job_url"].startswith("https://example.com/jobs/abc")
    assert created["source_domain"] == "example.com"
    assert created["status_history"] is not None
    assert len(created["status_history"]) == 1
    assert created["status_history"][0]["from_status"] is None
    assert created["status_history"][0]["to_status"] == "applied"

    listed = client.get("/api/applications")
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert "description" not in body["items"][0]
    assert "status_history" not in body["items"][0]

    detail = client.get(f"/api/applications/{created['id']}")
    assert detail.status_code == 200
    assert detail.json()["status_history"][0]["to_status"] == "applied"

    stats = client.get("/api/applications/stats")
    assert stats.status_code == 200
    assert stats.json()["applied"] == 1
    assert stats.json()["total"] == 1

    deleted = client.delete(f"/api/applications/{created['id']}")
    assert deleted.status_code == 204
    assert client.get("/api/applications").json()["total"] == 0


def test_duplicate_url_returns_409(client: TestClient) -> None:
    register_and_login(client, email="dup-app@example.com")
    first = _create_application(client, url="https://example.com/jobs/dup")
    response = client.post(
        "/api/applications",
        json={"job_url": "https://example.com/jobs/dup?utm_campaign=1"},
    )
    assert response.status_code == 409
    body = response.json()
    assert body["existing_application_id"] == first["id"]
    assert "detail" in body


def test_invalid_document_links(client: TestClient) -> None:
    register_and_login(client, email="bad-docs@example.com")
    resume_id = _create_doc(client, kind="resume", label="Resume")
    cover_id = _create_doc(client, kind="cover_letter", label="Cover")

    bad_resume = client.post(
        "/api/applications",
        json={
            "job_url": "https://example.com/jobs/r1",
            "resume_id": cover_id,  # wrong kind
        },
    )
    assert bad_resume.status_code == 400

    bad_cover = client.post(
        "/api/applications",
        json={
            "job_url": "https://example.com/jobs/r2",
            "cover_letter_id": resume_id,  # wrong kind
        },
    )
    assert bad_cover.status_code == 400

    missing = client.post(
        "/api/applications",
        json={
            "job_url": "https://example.com/jobs/r3",
            "resume_id": str(uuid4()),
        },
    )
    assert missing.status_code == 400


def test_patch_status_adds_history(client: TestClient) -> None:
    register_and_login(client, email="status@example.com")
    created = _create_application(client, url="https://example.com/jobs/status")
    response = client.patch(
        f"/api/applications/{created['id']}",
        json={"status": "interviewing", "status_note": "Phone screen booked"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "interviewing"
    assert len(body["status_history"]) == 2
    assert body["status_history"][-1]["from_status"] == "applied"
    assert body["status_history"][-1]["to_status"] == "interviewing"
    assert body["status_history"][-1]["note"] == "Phone screen booked"

    stats = client.get("/api/applications/stats").json()
    assert stats["applied"] == 0
    assert stats["interviewing"] == 1


def test_list_filters_search_and_sort(client: TestClient) -> None:
    register_and_login(client, email="filter@example.com")
    _create_application(
        client,
        url="https://example.com/jobs/a",
        title="Python Engineer",
        company="Alpha",
    )
    second = _create_application(
        client,
        url="https://example.com/jobs/b",
        title="Designer",
        company="Beta Corp",
    )
    client.patch(
        f"/api/applications/{second['id']}",
        json={"status": "screening", "applied_at": "2026-01-01"},
    )

    by_q = client.get("/api/applications", params={"q": "python"})
    assert by_q.status_code == 200
    assert by_q.json()["total"] == 1
    assert by_q.json()["items"][0]["title"] == "Python Engineer"

    by_status = client.get("/api/applications", params=[("status", "screening")])
    assert by_status.json()["total"] == 1
    assert by_status.json()["items"][0]["company"] == "Beta Corp"

    sorted_asc = client.get("/api/applications", params={"sort": "applied_at"})
    assert sorted_asc.status_code == 200
    dates = [item["applied_at"] for item in sorted_asc.json()["items"]]
    assert dates == sorted(dates)


def test_ownership_isolation(client: TestClient) -> None:
    register_and_login(client, email="owner-app@example.com", name="Owner")
    created = _create_application(client, url="https://example.com/jobs/mine")

    client.cookies.clear()
    register_and_login(client, email="other-app@example.com", name="Other")
    assert client.get(f"/api/applications/{created['id']}").status_code == 404
    assert (
        client.patch(
            f"/api/applications/{created['id']}",
            json={"title": "Hacked"},
        ).status_code
        == 404
    )
    assert client.delete(f"/api/applications/{created['id']}").status_code == 404
    assert client.get("/api/applications").json()["total"] == 0


def test_create_with_documents_and_defaults(client: TestClient) -> None:
    register_and_login(client, email="with-docs@example.com")
    resume_id = _create_doc(client, kind="resume", label="Backend resume")
    cover_id = _create_doc(client, kind="cover_letter", label="Cover")
    created = _create_application(
        client,
        url="https://example.com/jobs/docs",
        resume_id=resume_id,
        cover_letter_id=cover_id,
    )
    assert created["resume"]["id"] == resume_id
    assert created["resume"]["label"] == "Backend resume"
    assert created["cover_letter"]["id"] == cover_id
    assert created["applied_at"] == date.today().isoformat()


def test_update_clears_resume_link(client: TestClient) -> None:
    register_and_login(client, email="clear-resume@example.com")
    resume_id = _create_doc(client, kind="resume", label="Resume")
    created = _create_application(
        client,
        url="https://example.com/jobs/clear",
        resume_id=resume_id,
    )
    response = client.patch(
        f"/api/applications/{created['id']}",
        json={"resume_id": None, "notes": "Updated notes"},
    )
    assert response.status_code == 200
    assert response.json()["resume"] is None
    assert response.json()["notes"] == "Updated notes"


def test_application_tags_create_filter_and_update(client: TestClient) -> None:
    register_and_login(client, email="tags@example.com")
    it_role = _create_application(
        client,
        url="https://example.com/jobs/it",
        title="Backend Engineer",
        company="Tech Co",
        tags=["IT Role", "  admin  ", "it role"],
    )
    assert it_role["tags"] == ["IT Role", "admin"]

    hospitality = _create_application(
        client,
        url="https://example.com/jobs/hospo",
        title="Barista",
        company="Cafe",
        tags=["Hospitality"],
    )
    assert hospitality["tags"] == ["Hospitality"]

    tags_list = client.get("/api/applications/tags")
    assert tags_list.status_code == 200
    assert tags_list.json()["tags"] == ["admin", "Hospitality", "IT Role"]

    by_tag = client.get(
        "/api/applications",
        params=[("tag", "it role"), ("tag", "missing")],
    )
    assert by_tag.status_code == 200
    assert by_tag.json()["total"] == 1
    assert by_tag.json()["items"][0]["id"] == it_role["id"]

    by_hospo = client.get("/api/applications", params={"tag": "Hospitality"})
    assert by_hospo.json()["total"] == 1
    assert by_hospo.json()["items"][0]["id"] == hospitality["id"]

    cleared = client.patch(
        f"/api/applications/{hospitality['id']}",
        json={"tags": []},
    )
    assert cleared.status_code == 200
    assert cleared.json()["tags"] == []
    assert client.get("/api/applications", params={"tag": "Hospitality"}).json()["total"] == 0
