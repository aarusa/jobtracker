from io import BytesIO
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.conftest import make_docx_bytes, make_pdf_bytes, register_and_login, upload_pdf

from app.config import get_settings
from app.models import Application, Document
from app.models.enums import ApplicationStatus
from app.services.storage import LocalDiskStorage


def test_upload_list_download_rename_delete(
    client: TestClient,
    storage: LocalDiskStorage,
) -> None:
    register_and_login(client, email="docs@example.com")

    upload = upload_pdf(client)
    assert upload.status_code == 201, upload.text
    body = upload.json()
    assert body["kind"] == "resume"
    assert body["label"] == "Backend resume"
    assert body["original_filename"] == "resume.pdf"
    assert body["mime_type"] == "application/pdf"
    assert body["size_bytes"] > 0
    assert body["used_by_count"] == 0
    document_id = body["id"]

    listed = client.get("/api/documents")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == document_id

    resumes = client.get("/api/documents", params={"kind": "resume"})
    assert resumes.status_code == 200
    assert len(resumes.json()) == 1

    cover_letters = client.get("/api/documents", params={"kind": "cover_letter"})
    assert cover_letters.status_code == 200
    assert cover_letters.json() == []

    download = client.get(f"/api/documents/{document_id}/download")
    assert download.status_code == 200
    assert download.content.startswith(b"%PDF")
    assert "attachment" in download.headers.get("content-disposition", "").lower()
    assert "resume.pdf" in download.headers.get("content-disposition", "")

    preview = client.get(f"/api/documents/{document_id}/view")
    assert preview.status_code == 200
    assert preview.content.startswith(b"%PDF")
    assert "inline" in preview.headers.get("content-disposition", "").lower()

    renamed = client.patch(
        f"/api/documents/{document_id}",
        json={"label": "Backend resume v2"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["label"] == "Backend resume v2"

    deleted = client.delete(f"/api/documents/{document_id}")
    assert deleted.status_code == 204
    assert client.get("/api/documents").json() == []
    assert list(storage.root.iterdir()) == []


def test_upload_rejects_bad_extension(client: TestClient) -> None:
    register_and_login(client, email="badext@example.com")
    response = client.post(
        "/api/documents",
        data={"kind": "resume", "label": "Nope"},
        files={"file": ("notes.txt", BytesIO(b"hello"), "text/plain")},
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "PDF" in detail or "DOCX" in detail


def test_upload_rejects_bad_magic_bytes(client: TestClient) -> None:
    register_and_login(client, email="badmagic@example.com")
    response = client.post(
        "/api/documents",
        data={"kind": "resume", "label": "Fake PDF"},
        files={"file": ("fake.pdf", BytesIO(b"not-a-pdf"), "application/pdf")},
    )
    assert response.status_code == 400
    assert "PDF" in response.json()["detail"]


def test_upload_rejects_too_large_file(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_and_login(client, email="toolarge@example.com")
    settings = get_settings()
    monkeypatch.setattr(settings, "max_upload_mb", 0)

    response = upload_pdf(client, content=make_pdf_bytes())
    assert response.status_code == 413


def test_other_user_cannot_access_document(client: TestClient) -> None:
    register_and_login(client, email="owner@example.com", name="Owner")
    upload = upload_pdf(client)
    assert upload.status_code == 201
    document_id = upload.json()["id"]

    client.cookies.clear()
    register_and_login(client, email="intruder@example.com", name="Intruder")

    assert client.get(f"/api/documents/{document_id}/download").status_code == 404
    assert client.get(f"/api/documents/{document_id}/view").status_code == 404
    assert (
        client.patch(
            f"/api/documents/{document_id}",
            json={"label": "Hacked"},
        ).status_code
        == 404
    )
    assert client.delete(f"/api/documents/{document_id}").status_code == 404
    assert client.get("/api/documents").json() == []


def test_delete_clears_application_links(
    client: TestClient,
    db: Session,
) -> None:
    register_and_login(client, email="linked@example.com")
    upload = upload_pdf(client)
    assert upload.status_code == 201
    document_id = UUID(upload.json()["id"])

    document = db.get(Document, document_id)
    assert document is not None

    application = Application(
        user_id=document.user_id,
        job_url="https://example.com/jobs/1",
        job_url_normalized="https://example.com/jobs/1",
        title="Engineer",
        company="Example",
        status=ApplicationStatus.applied,
        resume_id=document.id,
    )
    db.add(application)
    db.commit()
    db.refresh(application)

    listed = client.get("/api/documents")
    assert listed.status_code == 200
    assert listed.json()[0]["used_by_count"] == 1

    assert client.delete(f"/api/documents/{document_id}").status_code == 204

    db.refresh(application)
    assert application.resume_id is None


def test_upload_docx(client: TestClient) -> None:
    register_and_login(client, email="docx@example.com")
    response = client.post(
        "/api/documents",
        data={"kind": "cover_letter"},
        files={
            "file": (
                "cover.docx",
                BytesIO(make_docx_bytes()),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["kind"] == "cover_letter"
    assert body["label"] == "cover"
    assert body["mime_type"].endswith("document.wordprocessingml.document")
