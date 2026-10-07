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


class SiteBlockedError(RuntimeError):
    """Raised when the remote site refuses the request (bot protection / auth wall)."""

    def __init__(self, status_code: int, *, domain: str) -> None:
        self.status_code = status_code
        self.domain = domain
        super().__init__(f"{domain} returned HTTP {status_code}")


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
    if isinstance(value, list):
        for item in value:
            mapped = _map_work_type(item)
            if mapped:
                return mapped
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


def _schema_type_name(value: Any) -> str:
    text = str(value or "").strip().lower()
    if "/" in text:
        text = text.rsplit("/", 1)[-1]
    if ":" in text:
        text = text.rsplit(":", 1)[-1]
    return text


def _schema_text(value: Any) -> str | None:
    """Coerce schema.org string-or-object values to plain text."""
    if value is None:
        return None
    if isinstance(value, list):
        parts = [_schema_text(item) for item in value]
        joined = ", ".join(part for part in parts if part)
        return joined or None
    if isinstance(value, dict):
        for key in ("name", "@value", "value", "text"):
            nested = _schema_text(value.get(key))
            if nested:
                return nested
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)
    text = str(value).strip()
    return text or None


def _format_employment_type(value: Any) -> str | None:
    text = _schema_text(value)
    if not text:
        return None
    labels = {
        "full_time": "Full-time",
        "full-time": "Full-time",
        "fulltime": "Full-time",
        "part_time": "Part-time",
        "part-time": "Part-time",
        "parttime": "Part-time",
        "contractor": "Contract",
        "contract": "Contract",
        "temporary": "Temporary",
        "intern": "Internship",
        "internship": "Internship",
        "volunteer": "Volunteer",
        "per_diem": "Per diem",
        "other": "Other",
    }
    parts: list[str] = []
    for raw in re.split(r"\s*,\s*", text):
        key = raw.strip().lower().replace(" ", "_")
        parts.append(labels.get(key, raw.strip().replace("_", " ").title()))
    # Preserve order, drop duplicates.
    seen: set[str] = set()
    unique: list[str] = []
    for part in parts:
        if part and part not in seen:
            seen.add(part)
            unique.append(part)
    return ", ".join(unique) if unique else None


def _company_from_jsonld(node: dict[str, Any]) -> str | None:
    org = node.get("hiringOrganization") or node.get("hiringOrganisation")
    if isinstance(org, list) and org:
        org = org[0]
    if isinstance(org, dict):
        return _schema_text(org.get("name") or org)
    return _schema_text(org)


def _address_parts(address: dict[str, Any]) -> list[str]:
    parts: list[str] = []
    for key in (
        "streetAddress",
        "addressLocality",
        "addressRegion",
        "postalCode",
        "addressCountry",
    ):
        text = _schema_text(address.get(key))
        if text:
            parts.append(text)
    return parts


def _format_single_location(loc: Any) -> str | None:
    if isinstance(loc, str):
        return loc.strip() or None
    if not isinstance(loc, dict):
        return _schema_text(loc)
    address = loc.get("address")
    if isinstance(address, str) and address.strip():
        return address.strip()
    if isinstance(address, dict):
        parts = _address_parts(address)
        if parts:
            return ", ".join(parts)
    return _schema_text(loc.get("name") or loc)


def _job_location_from_jsonld(node: dict[str, Any]) -> str | None:
    loc = node.get("jobLocation") or node.get("location")
    if isinstance(loc, list):
        parts = [_format_single_location(item) for item in loc]
        joined = "; ".join(part for part in parts if part)
        if joined:
            return joined
    else:
        formatted = _format_single_location(loc)
        if formatted:
            return formatted

    # Remote / applicant-location fallbacks used by Google job posting markup.
    requirements = node.get("applicantLocationRequirements")
    if isinstance(requirements, list):
        names = [_schema_text(item) for item in requirements]
        joined = ", ".join(name for name in names if name)
        if joined:
            return joined
    req_text = _schema_text(requirements)
    if req_text:
        return req_text
    return None


_CURRENCY_SYMBOLS = {
    "AUD": "A$",
    "USD": "$",
    "GBP": "£",
    "EUR": "€",
    "NZD": "NZ$",
    "CAD": "C$",
    "SGD": "S$",
    "INR": "₹",
}


def _format_money_amount(amount: Any, currency: str | None) -> str | None:
    if amount is None or isinstance(amount, bool):
        return None
    try:
        number = float(amount)
    except (TypeError, ValueError):
        text = _schema_text(amount)
        if not text:
            return None
        symbol = _CURRENCY_SYMBOLS.get((currency or "").upper(), currency or "")
        return f"{symbol}{text}".strip() if symbol else text

    formatted = f"{int(number):,}" if number.is_integer() else f"{number:,.2f}"
    symbol = _CURRENCY_SYMBOLS.get((currency or "").upper(), currency or "")
    if symbol:
        return f"{symbol}{formatted}"
    return formatted


def _unit_label(unit: Any) -> str | None:
    text = _schema_text(unit)
    if not text:
        return None
    labels = {
        "HOUR": "per hour",
        "DAY": "per day",
        "WEEK": "per week",
        "MONTH": "per month",
        "YEAR": "per year",
    }
    return labels.get(text.upper(), text.lower())


def _salary_from_jsonld(node: dict[str, Any]) -> str | None:
    salary = node.get("baseSalary") or node.get("estimatedSalary")
    currency = _schema_text(node.get("salaryCurrency"))

    if isinstance(salary, (int, float)) and not isinstance(salary, bool):
        amount = _format_money_amount(salary, currency)
        return amount

    if isinstance(salary, str):
        amount = _format_money_amount(salary, currency) if currency else salary.strip()
        return amount or None

    if not isinstance(salary, dict):
        return None

    currency = _schema_text(salary.get("currency")) or currency
    value = salary.get("value")
    unit = salary.get("unitText")

    if isinstance(value, dict):
        minimum = value.get("minValue")
        maximum = value.get("maxValue")
        single = value.get("value")
        unit = value.get("unitText") or unit
        if minimum is not None and maximum is not None:
            low = _format_money_amount(minimum, currency)
            high = _format_money_amount(maximum, currency)
            text = f"{low} - {high}" if low and high else (low or high)
        elif minimum is not None:
            text = _format_money_amount(minimum, currency)
        elif maximum is not None:
            text = _format_money_amount(maximum, currency)
        else:
            text = _format_money_amount(single, currency)
    else:
        text = _format_money_amount(value, currency)

    if not text:
        return None
    unit_text = _unit_label(unit)
    if unit_text:
        return f"{text} {unit_text}"
    return text


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
    values = type_value if isinstance(type_value, list) else [type_value]
    return any(_schema_type_name(t) == "jobposting" for t in values)


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
            _set_if_empty(job, "title", _schema_text(node.get("title") or node.get("name")))
            _set_if_empty(job, "company", _company_from_jsonld(node))
            _set_if_empty(job, "location", _job_location_from_jsonld(node))
            _set_if_empty(
                job,
                "employment_type",
                _format_employment_type(node.get("employmentType")),
            )
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
    _set_if_empty(
        job,
        "location",
        _meta_content(
            soup,
            "og:locality",
            "geo.placename",
            "job:location",
            "twitter:data1",
        ),
    )
    _set_if_empty(
        job,
        "employment_type",
        _format_employment_type(
            _meta_content(soup, "job:employment_type", "employmentType")
        ),
    )
    _set_if_empty(
        job,
        "salary_text",
        _meta_content(soup, "job:salary", "salary", "twitter:data2"),
    )
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
        "[itemprop='hiringOrganization']",
        "[class*='company']",
        "[data-company]",
        "[class*='employer']",
        "a[href*='company']",
    ):
        node = soup.select_one(selector)
        if node:
            text = None
            if isinstance(node, Tag):
                text = node.get("data-company") or node.get("content")
            _set_if_empty(job, "company", text or node.get_text(" ", strip=True))
            if job.company:
                break

    for selector in (
        "[itemprop='jobLocation']",
        "[itemprop='address']",
        "[class*='location']",
        "[data-location]",
    ):
        node = soup.select_one(selector)
        if node:
            text = None
            if isinstance(node, Tag):
                text = node.get("data-location") or node.get("content")
            _set_if_empty(job, "location", text or node.get_text(" ", strip=True))
            if job.location:
                break

    for selector in (
        "[itemprop='employmentType']",
        "[class*='employment']",
        "[data-employment-type]",
    ):
        node = soup.select_one(selector)
        if node:
            text = None
            if isinstance(node, Tag):
                text = node.get("content") or node.get("data-employment-type")
            _set_if_empty(
                job,
                "employment_type",
                _format_employment_type(text or node.get_text(" ", strip=True)),
            )
            if job.employment_type:
                break

    for selector in (
        "[itemprop='baseSalary']",
        "[class*='salary']",
        "[data-salary]",
        "[class*='compensation']",
    ):
        node = soup.select_one(selector)
        if node:
            text = None
            if isinstance(node, Tag):
                text = node.get("content") or node.get("data-salary")
            _set_if_empty(job, "salary_text", text or node.get_text(" ", strip=True))
            if job.salary_text:
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


def _looks_like_bot_challenge(html: str) -> bool:
    """Detect Cloudflare / captcha interstitial pages (e.g. Indeed Security Check)."""
    sample = html[:20_000].lower()
    markers = (
        "security check",
        "cf-browser-verification",
        "cf-challenge",
        "attention required",
        "captcha",
        "indeed_cloudflare_static_page",
        "enable javascript and cookies to continue",
        "unusual traffic",
        "verify you are human",
    )
    return any(marker in sample for marker in markers)


def blocked_site_message(domain: str) -> str:
    return (
        f"{domain} blocks automated access (bot protection or a login wall). "
        "Fill in the details manually — the form still works."
    )


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
    if _looks_like_bot_challenge(html):
        job.scrape_status = ScrapeStatus.failed
        job.message = blocked_site_message(job.source_domain)
        return job

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
                body = b"".join(chunks).decode(
                    response.encoding or "utf-8", errors="replace"
                )

                if response.status_code in {401, 403, 429, 503}:
                    raise SiteBlockedError(
                        response.status_code,
                        domain=source_domain_from_url(current),
                    )

                if response.status_code >= 400:
                    response.raise_for_status()

                return body

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

    domain = source_domain_from_url(normalized)
    try:
        html = fetch_job_html(normalized, settings=settings, client=client)
    except UnsafeUrlError:
        raise
    except SiteBlockedError as exc:
        return ScrapedJob(
            job_url=original,
            job_url_normalized=normalized,
            source_domain=exc.domain or domain,
            scrape_status=ScrapeStatus.failed,
            message=blocked_site_message(exc.domain or domain),
        )
    except Exception:
        return ScrapedJob(
            job_url=original,
            job_url_normalized=normalized,
            source_domain=domain,
            scrape_status=ScrapeStatus.failed,
            message="Could not reach this job page. Please fill in the details manually.",
        )

    job = parse_job_html(html, original)
    # Preserve the URL the user pasted.
    job.job_url = original
    job.job_url_normalized = normalized
    if job.scrape_status == ScrapeStatus.failed and not job.message:
        job.message = blocked_site_message(domain)
    return job
