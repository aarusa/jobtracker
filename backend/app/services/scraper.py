from __future__ import annotations

import ipaddress
import json
import re
import socket
from dataclasses import dataclass, field
from datetime import date, datetime
from html import unescape
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup, Tag

from app.config import Settings, get_settings
from app.models.enums import ScrapeStatus, WorkType

USER_AGENT = "JobTrackerBot/0.1 (+https://github.com/local/jobtracker; personal job tracker)"

TRACKING_QUERY_PREFIXES = ("utm_",)
TRACKING_QUERY_KEYS = {
    "fbclid",
    "gclid",
    "gclsrc",
    "dclid",
    "msclkid",
    "mc_cid",
    "mc_eid",
    "igshid",
    "si",
    "ref",
    "ref_src",
    "source",
    "ncid",
    "cmpid",
}

BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "metadata",
}


class UnsafeUrlError(ValueError):
    """Raised when a URL is invalid or blocked by SSRF rules."""


@dataclass
class ScrapedJob:
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
    scrape_status: ScrapeStatus = ScrapeStatus.failed
    message: str | None = None
    existing_application_id: str | None = None
    # Internal helper so callers can fill remaining fields without overwriting.
    _filled: set[str] = field(default_factory=set, repr=False, compare=False)


def normalize_url(url: str) -> str:
    raw = url.strip()
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeUrlError("Only http and https URLs are allowed")
    if not parsed.hostname:
        raise UnsafeUrlError("URL must include a hostname")

    query_pairs = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() not in TRACKING_QUERY_KEYS
        and not any(key.lower().startswith(prefix) for prefix in TRACKING_QUERY_PREFIXES)
    ]
    normalized = parsed._replace(
        netloc=parsed.netloc.lower(),
        path=parsed.path or "/",
        params="",
        query=urlencode(query_pairs, doseq=True),
        fragment="",
    )
    return urlunparse(normalized)


def source_domain_from_url(url: str) -> str:
    hostname = urlparse(url).hostname or ""
    return hostname.lower().removeprefix("www.")


def assert_url_is_safe(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeUrlError("Only http and https URLs are allowed")
    hostname = parsed.hostname
    if not hostname:
        raise UnsafeUrlError("URL must include a hostname")
    if hostname.lower() in BLOCKED_HOSTNAMES or hostname.lower().endswith(".localhost"):
        raise UnsafeUrlError("URL host is not allowed")
    if parsed.username or parsed.password:
        raise UnsafeUrlError("URLs with credentials are not allowed")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        addrinfo = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeUrlError("Could not resolve hostname") from exc

    if not addrinfo:
        raise UnsafeUrlError("Could not resolve hostname")

    for info in addrinfo:
        ip_str = info[4][0]
        ip = ipaddress.ip_address(ip_str)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
            or not ip.is_global
        ):
            raise UnsafeUrlError("URL resolves to a blocked network address")


def _set_if_empty(job: ScrapedJob, field_name: str, value: Any) -> None:
    if value is None:
        return
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return
    current = getattr(job, field_name)
    if field_name == "work_type":
        if job.work_type != WorkType.unknown:
            return
        setattr(job, field_name, value)
        job._filled.add(field_name)
        return
    if current is None or current == "":
        setattr(job, field_name, value)
        job._filled.add(field_name)


def _plain_text_from_html(html_fragment: str) -> str:
    soup = BeautifulSoup(html_fragment, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    blocks: list[str] = []
    for element in soup.find_all(["p", "li", "br", "h1", "h2", "h3", "h4", "div"]):
        if element.name == "br":
            blocks.append("")
            continue
        text = element.get_text(" ", strip=True)
        if text:
            prefix = "• " if element.name == "li" else ""
            blocks.append(f"{prefix}{text}")

    if not blocks:
        text = soup.get_text("\n", strip=True)
        return _normalize_whitespace(text)

    # Deduplicate consecutive identical lines from nested divs.
    cleaned: list[str] = []
    for line in blocks:
        if cleaned and cleaned[-1] == line:
            continue
        cleaned.append(line)
    return _normalize_whitespace("\n".join(cleaned))


def _normalize_whitespace(text: str) -> str:
    text = unescape(text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def _parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    raw = raw.replace("Z", "+00:00")
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        pass
    try:
        return datetime.fromisoformat(raw).date()
    except ValueError:
        return None


def _map_work_type(value: Any) -> WorkType | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text:
        return None
    if "remote" in text or text in {"telecommute", "work from home", "wfh"}:
        return WorkType.remote
    if "hybrid" in text:
        return WorkType.hybrid
    if any(token in text for token in ("onsite", "on-site", "on site", "in office", "office")):
        return WorkType.onsite
    return None


def _job_location_from_jsonld(node: dict[str, Any]) -> str | None:
    loc = node.get("jobLocation") or node.get("location")
    if isinstance(loc, list) and loc:
        loc = loc[0]
    if isinstance(loc, str):
        return loc
    if not isinstance(loc, dict):
        return None
    address = loc.get("address")
    if isinstance(address, str):
        return address
    if isinstance(address, dict):
        parts = [
            address.get("streetAddress"),
            address.get("addressLocality"),
            address.get("addressRegion"),
            address.get("postalCode"),
            address.get("addressCountry"),
        ]
        return ", ".join(str(p) for p in parts if p)
    name = loc.get("name")
    return str(name) if name else None


def _salary_from_jsonld(node: dict[str, Any]) -> str | None:
    salary = node.get("baseSalary") or node.get("estimatedSalary")
    if isinstance(salary, str):
        return salary
    if not isinstance(salary, dict):
        return None
    value = salary.get("value")
    currency = salary.get("currency") or ""
    if isinstance(value, dict):
        minimum = value.get("minValue")
        maximum = value.get("maxValue")
        unit = value.get("unitText") or salary.get("unitText")
        if minimum and maximum:
            text = f"{currency}{minimum} - {currency}{maximum}".strip()
        elif minimum:
            text = f"{currency}{minimum}".strip()
        elif maximum:
            text = f"{currency}{maximum}".strip()
        else:
            text = str(value.get("value") or "").strip()
        if unit:
            text = f"{text} {unit}".strip()
        return text or None
    if value is not None:
        return f"{currency}{value}".strip()
    return None


def _iter_jsonld_nodes(payload: Any) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []

    def walk(item: Any) -> None:
        if isinstance(item, list):
            for child in item:
                walk(child)
            return
        if not isinstance(item, dict):
            return
        if "@graph" in item:
            walk(item["@graph"])
        nodes.append(item)

    walk(payload)
    return nodes


def _is_job_posting(node: dict[str, Any]) -> bool:
    type_value = node.get("@type")
    if isinstance(type_value, list):
        return any(str(t).lower() == "jobposting" for t in type_value)
    return str(type_value or "").lower() == "jobposting"


def _apply_jsonld(job: ScrapedJob, soup: BeautifulSoup) -> None:
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = script.string or script.get_text()
        if not raw or not raw.strip():
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for node in _iter_jsonld_nodes(payload):
            if not _is_job_posting(node):
                continue
            _set_if_empty(job, "title", node.get("title") or node.get("name"))
            org = node.get("hiringOrganization")
            if isinstance(org, dict):
                _set_if_empty(job, "company", org.get("name"))
            elif isinstance(org, str):
                _set_if_empty(job, "company", org)
            _set_if_empty(job, "location", _job_location_from_jsonld(node))
            _set_if_empty(job, "employment_type", node.get("employmentType"))
            _set_if_empty(job, "salary_text", _salary_from_jsonld(node))
            description = node.get("description")
            if isinstance(description, str):
                if "<" in description:
                    _set_if_empty(job, "description", _plain_text_from_html(description))
                else:
                    _set_if_empty(job, "description", _normalize_whitespace(description))
            _set_if_empty(job, "date_posted", _parse_date(node.get("datePosted")))
            work = _map_work_type(
                node.get("jobLocationType") or node.get("workHours") or node.get("employmentType")
            )
            if work:
                _set_if_empty(job, "work_type", work)


def _meta_content(soup: BeautifulSoup, *keys: str) -> str | None:
    for key in keys:
        tag = soup.find("meta", property=key) or soup.find("meta", attrs={"name": key})
        if isinstance(tag, Tag):
            content = tag.get("content")
            if content:
                return str(content).strip()
    return None


def _apply_opengraph(job: ScrapedJob, soup: BeautifulSoup) -> None:
    _set_if_empty(job, "title", _meta_content(soup, "og:title", "twitter:title"))
    _set_if_empty(job, "company", _meta_content(soup, "og:site_name"))
    description = _meta_content(soup, "og:description", "description", "twitter:description")
    if description:
        _set_if_empty(job, "description", _normalize_whitespace(description))
    title_tag = soup.find("title")
    if title_tag:
        _set_if_empty(job, "title", title_tag.get_text(" ", strip=True))


def _apply_heuristics(job: ScrapedJob, soup: BeautifulSoup) -> None:
    for selector in ("h1", "[class*='job-title']", "[class*='JobTitle']", "header h1"):
        node = soup.select_one(selector)
        if node:
            _set_if_empty(job, "title", node.get_text(" ", strip=True))
            if job.title:
                break

    for selector in (
        "[class*='company']",
        "[data-company]",
        "[class*='employer']",
        "a[href*='company']",
    ):
        node = soup.select_one(selector)
        if node:
            text = node.get("data-company") if isinstance(node, Tag) else None
            _set_if_empty(job, "company", text or node.get_text(" ", strip=True))
            if job.company:
                break

    for selector in (
        "[class*='description']",
        "[id*='description']",
        "article",
        "main",
    ):
        node = soup.select_one(selector)
        if node:
            _set_if_empty(job, "description", _plain_text_from_html(str(node)))
            if job.description:
                break

    page_text = soup.get_text(" ", strip=True).lower()
    mapped = _map_work_type(page_text)
    if mapped:
        _set_if_empty(job, "work_type", mapped)


def _finalize_status(job: ScrapedJob) -> ScrapedJob:
    has_title = bool(job.title)
    has_company = bool(job.company)
    has_description = bool(job.description)
    useful_count = sum([has_title, has_company, has_description, bool(job.location)])

    if has_title and has_company:
        job.scrape_status = ScrapeStatus.success
        job.message = None
    elif useful_count > 0:
        job.scrape_status = ScrapeStatus.partial
        job.message = "Only some details could be extracted. Please review and fill in the rest."
    else:
        job.scrape_status = ScrapeStatus.failed
        job.message = (
            "Could not extract job details from this page. Please fill in the details manually."
        )
    return job


def parse_job_html(html: str, url: str) -> ScrapedJob:
    """Pure parser: extract job fields from HTML. No network access."""
    normalized = normalize_url(url)
    job = ScrapedJob(
        job_url=url.strip(),
        job_url_normalized=normalized,
        source_domain=source_domain_from_url(normalized),
    )
    soup = BeautifulSoup(html, "lxml")
    _apply_jsonld(job, soup)
    _apply_opengraph(job, soup)
    _apply_heuristics(job, soup)
    return _finalize_status(job)


def fetch_job_html(
    url: str,
    *,
    settings: Settings | None = None,
    client: httpx.Client | None = None,
) -> str:
    """Fetch HTML with SSRF checks, redirect re-validation, timeout and size limits."""
    settings = settings or get_settings()
    current = normalize_url(url)
    assert_url_is_safe(current)

    owns_client = client is None
    http_client = client or httpx.Client(
        timeout=settings.scrape_timeout_seconds,
        follow_redirects=False,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
        cookies={},
    )

    try:
        for _ in range(5):
            assert_url_is_safe(current)
            with http_client.stream("GET", current) as response:
                if response.is_redirect or response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise UnsafeUrlError("Redirect missing Location header")
                    current = normalize_url(urljoin(str(response.url), location))
                    continue
                response.raise_for_status()

                content_type = response.headers.get("content-type", "")
                if content_type and any(
                    token in content_type.lower()
                    for token in ("image/", "audio/", "video/", "application/pdf")
                ):
                    raise httpx.HTTPError("URL did not return HTML")

                chunks: list[bytes] = []
                total = 0
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > settings.scrape_max_bytes:
                        raise httpx.HTTPError("Response exceeded maximum size")
                    chunks.append(chunk)
                return b"".join(chunks).decode(response.encoding or "utf-8", errors="replace")

        raise UnsafeUrlError("Too many redirects")
    finally:
        if owns_client:
            http_client.close()


def scrape_job_url(
    url: str,
    *,
    settings: Settings | None = None,
    client: httpx.Client | None = None,
) -> ScrapedJob:
    """Validate, fetch, and parse a job URL. Network failures become scrape_status=failed."""
    settings = settings or get_settings()
    original = url.strip()
    try:
        normalized = normalize_url(original)
        assert_url_is_safe(normalized)
    except UnsafeUrlError:
        raise

    try:
        html = fetch_job_html(normalized, settings=settings, client=client)
    except UnsafeUrlError:
        raise
    except Exception:
        return ScrapedJob(
            job_url=original,
            job_url_normalized=normalized,
            source_domain=source_domain_from_url(normalized),
            scrape_status=ScrapeStatus.failed,
            message=("Could not reach this job page. Please fill in the details manually."),
        )

    job = parse_job_html(html, original)
    # Preserve the URL the user pasted.
    job.job_url = original
    job.job_url_normalized = normalized
    if job.scrape_status == ScrapeStatus.failed and not job.message:
        job.message = "This site may block automated access. Please fill in the details manually."
    return job
