from __future__ import annotations

from collections.abc import Generator
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import engine, get_db
from app.main import app
from app.services.rate_limit import reset_rate_limits
from app.services.storage import LocalDiskStorage, get_storage


@pytest.fixture(autouse=True)
def _clear_rate_limits() -> None:
    reset_rate_limits()


@pytest.fixture
def db() -> Generator[Session, None, None]:
    """Provide a DB session that rolls back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def storage(tmp_path: Path) -> Generator[LocalDiskStorage, None, None]:
    local = LocalDiskStorage(tmp_path / "uploads")
    app.dependency_overrides[get_storage] = lambda: local
    try:
        yield local
    finally:
        app.dependency_overrides.pop(get_storage, None)


@pytest.fixture
def client(db: Session, storage: LocalDiskStorage) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


def register_and_login(
    client: TestClient,
    *,
    email: str,
    password: str = "password123",
    name: str = "Test User",
) -> None:
    response = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert response.status_code == 201, response.text


def make_pdf_bytes(content: bytes = b"%PDF-1.4 minimal test file") -> bytes:
    return content


def make_docx_bytes() -> bytes:
    # Minimal ZIP local-file header so magic-byte check passes.
    return b"PK\x03\x04" + b"\x00" * 30


def upload_pdf(
    client: TestClient,
    *,
    filename: str = "resume.pdf",
    kind: str = "resume",
    label: str | None = "Backend resume",
    content: bytes | None = None,
) -> object:
    data = {"kind": kind}
    if label is not None:
        data["label"] = label
    files = {
        "file": (filename, BytesIO(content or make_pdf_bytes()), "application/pdf"),
    }
    return client.post("/api/documents", data=data, files=files)
