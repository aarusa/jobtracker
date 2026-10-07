from __future__ import annotations

import socket
from pathlib import Path

import httpx
import pytest

from app.models.enums import ScrapeStatus, WorkType
from app.services.scraper import (
    SiteBlockedError,
    UnsafeUrlError,
    assert_url_is_safe,
    fetch_job_html,
    normalize_url,
    parse_job_html,
    scrape_job_url,
)

FIXTURES = Path(__file__).parent / "fixtures"


def test_normalize_url_strips_tracking_and_fragment() -> None:
    url = "https://Example.com/jobs/123?utm_source=x&utm_medium=email&fbclid=abc&keep=1#section"
    assert normalize_url(url) == "https://example.com/jobs/123?keep=1"


def test_normalize_url_rejects_non_http() -> None:
    with pytest.raises(UnsafeUrlError):
        normalize_url("ftp://example.com/job")


def test_assert_url_blocks_loopback_hostname() -> None:
    with pytest.raises(UnsafeUrlError):
        assert_url_is_safe("http://localhost/jobs/1")


def test_assert_url_blocks_private_ip() -> None:
    with pytest.raises(UnsafeUrlError):
        assert_url_is_safe("http://127.0.0.1/jobs/1")
    with pytest.raises(UnsafeUrlError):
        assert_url_is_safe("http://192.168.1.10/jobs/1")
    with pytest.raises(UnsafeUrlError):
        assert_url_is_safe("http://10.0.0.5/jobs/1")


def test_parse_jsonld_fixture() -> None:
    html = (FIXTURES / "job_jsonld.html").read_text(encoding="utf-8")
    job = parse_job_html(html, "https://example.com/jobs/123?utm_source=x")

    assert job.job_url_normalized == "https://example.com/jobs/123"
    assert job.source_domain == "example.com"
    assert job.title == "Senior Backend Engineer"
    assert job.company == "Example Pty Ltd"
    assert job.location is not None
    assert "Melbourne" in job.location
    assert job.employment_type == "Full-time"
    assert job.salary_text is not None
    assert "140,000" in job.salary_text
    assert "160,000" in job.salary_text
    assert "per year" in job.salary_text
    assert job.description is not None
    assert "Build APIs" in job.description
    assert "Python" in job.description
    assert "<p>" not in job.description
    assert job.date_posted is not None
    assert job.date_posted.isoformat() == "2026-10-01"
    assert job.work_type == WorkType.remote
    assert job.scrape_status == ScrapeStatus.success
    assert job.message is None


def test_parse_jsonld_uri_type_and_variant_shapes() -> None:
    html = (FIXTURES / "job_jsonld_variants.html").read_text(encoding="utf-8")
    job = parse_job_html(html, "https://jobs.example.com/roles/42")

    assert job.title == "Platform Engineer"
    assert job.company == "Northwind Analytics"
    assert job.location == "Sydney, NSW, Australia"
    assert job.employment_type == "Full-time, Contract"
    assert job.salary_text == "A$145,000"
    assert job.scrape_status == ScrapeStatus.success


def test_parse_opengraph_fixture() -> None:
    html = (FIXTURES / "job_opengraph.html").read_text(encoding="utf-8")
    job = parse_job_html(html, "https://jobs.example.org/role/99")

    assert job.title == "Product Designer"
    assert job.company == "Acme Jobs"
    assert job.description == "Design delightful product experiences."
    assert job.scrape_status == ScrapeStatus.success


def test_parse_empty_fixture_fails() -> None:
    html = (FIXTURES / "job_empty.html").read_text(encoding="utf-8")
    job = parse_job_html(html, "https://example.com/empty")

    assert job.title is None
    assert job.company is None
    assert job.scrape_status == ScrapeStatus.failed
    assert job.message is not None


def test_fetch_rechecks_redirect_target(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_getaddrinfo(host: str, port: int, *args: object, **kwargs: object):
        if host in {"127.0.0.1", "localhost"} or str(host).startswith("127."):
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 0))]
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]

    monkeypatch.setattr("app.services.scraper.socket.getaddrinfo", fake_getaddrinfo)

    class FakeResponse:
        def __init__(self, status_code: int, location: str | None = None) -> None:
            self.status_code = status_code
            self.headers = {"location": location} if location else {}
            self.is_redirect = status_code in {301, 302, 303, 307, 308}
            self.url = "https://example.com/start"

        def raise_for_status(self) -> None:
            return None

        def iter_bytes(self):
            yield b"<html></html>"
            return
            yield

        @property
        def encoding(self) -> str:
            return "utf-8"

        def __enter__(self) -> FakeResponse:
            return self

        def __exit__(self, *args: object) -> None:
            return None

    class FakeClient:
        def stream(self, method: str, url: str):
            calls.append(url)
            if url.startswith("https://example.com/start"):
                return FakeResponse(302, "http://127.0.0.1/secret")
            return FakeResponse(200)

        def close(self) -> None:
            return None

    with pytest.raises(UnsafeUrlError):
        fetch_job_html("https://example.com/start", client=FakeClient())  # type: ignore[arg-type]

    assert calls[0].startswith("https://example.com/start")


def test_scrape_job_url_network_error_returns_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.scraper.socket.getaddrinfo",
        lambda *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))
        ],
    )

    def boom(*args: object, **kwargs: object) -> str:
        raise httpx.ConnectError("nope")

    monkeypatch.setattr("app.services.scraper.fetch_job_html", boom)
    job = scrape_job_url("https://example.com/jobs/1")
    assert job.scrape_status == ScrapeStatus.failed
    assert job.message is not None


def test_parse_bot_challenge_fixture() -> None:
    html = (FIXTURES / "indeed_security_check.html").read_text(encoding="utf-8")
    job = parse_job_html(html, "https://au.indeed.com/viewjob?jk=abc")
    assert job.scrape_status == ScrapeStatus.failed
    assert job.title is None
    assert job.message is not None
    assert "blocks automated access" in job.message
    assert "indeed.com" in job.message


def test_fetch_403_raises_site_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.scraper.socket.getaddrinfo",
        lambda *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))
        ],
    )

    class FakeResponse:
        status_code = 403
        is_redirect = False
        headers = {"content-type": "text/html"}
        url = "https://au.indeed.com/viewjob?jk=abc"
        encoding = "utf-8"

        def iter_bytes(self):
            yield b"<html><title>Security Check</title></html>"

        def __enter__(self) -> FakeResponse:
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def raise_for_status(self) -> None:
            raise httpx.HTTPStatusError(
                "403", request=httpx.Request("GET", self.url), response=httpx.Response(403)
            )

    class FakeClient:
        def stream(self, method: str, url: str):
            return FakeResponse()

        def close(self) -> None:
            return None

    with pytest.raises(SiteBlockedError) as exc_info:
        fetch_job_html(
            "https://au.indeed.com/viewjob?jk=abc",
            client=FakeClient(),  # type: ignore[arg-type]
        )
    assert exc_info.value.status_code == 403


def test_scrape_job_url_site_blocked_message(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.scraper.socket.getaddrinfo",
        lambda *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))
        ],
    )

    def blocked(*args: object, **kwargs: object) -> str:
        raise SiteBlockedError(403, domain="au.indeed.com")

    monkeypatch.setattr("app.services.scraper.fetch_job_html", blocked)
    job = scrape_job_url("https://au.indeed.com/viewjob?jk=0a7d303e7a90deae")
    assert job.scrape_status == ScrapeStatus.failed
    assert "au.indeed.com" in (job.message or "")
    assert "blocks automated access" in (job.message or "")
