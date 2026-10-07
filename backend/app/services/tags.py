"""Application tag normalisation and query helpers."""

from __future__ import annotations

import uuid

from sqlalchemy import bindparam, select, text
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import TextClause

from app.models import Application

MAX_TAGS = 10
MAX_TAG_LENGTH = 40


def normalize_tags(tags: list[str] | None) -> list[str]:
    """Trim, drop empties, case-insensitive dedupe; preserve first spelling."""
    if not tags:
        return []
    seen: set[str] = set()
    result: list[str] = []
    for raw in tags:
        cleaned = " ".join(raw.split())
        if not cleaned:
            continue
        if len(cleaned) > MAX_TAG_LENGTH:
            cleaned = cleaned[:MAX_TAG_LENGTH].rstrip()
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(cleaned)
        if len(result) >= MAX_TAGS:
            break
    return result


def tags_overlap_filter(filter_tags: list[str]) -> TextClause | None:
    """Case-insensitive: application has at least one of the given tags."""
    lowered = [tag.casefold() for tag in normalize_tags(filter_tags)]
    if not lowered:
        return None
    return text(
        "EXISTS ("
        "SELECT 1 FROM unnest(applications.tags) AS tag_item "
        "WHERE lower(tag_item) IN :tag_filters"
        ")"
    ).bindparams(bindparam("tag_filters", value=lowered, expanding=True))


def collect_user_tags(db: Session, *, user_id: uuid.UUID) -> list[str]:
    rows = db.scalars(
        select(Application.tags).where(Application.user_id == user_id)
    ).all()
    seen: set[str] = set()
    result: list[str] = []
    for tags in rows:
        for tag in tags or []:
            key = tag.casefold()
            if key in seen:
                continue
            seen.add(key)
            result.append(tag)
    result.sort(key=str.casefold)
    return result
