from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import Settings, get_settings

COOKIE_NAME = "access_token"
ALGORITHM = "HS256"

_password_hash = PasswordHash.recommended()


@dataclass(frozen=True)
class AccessTokenClaims:
    user_id: uuid.UUID
    session_version: int


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


def create_access_token(
    user_id: uuid.UUID,
    *,
    session_version: int = 0,
    settings: Settings | None = None,
    expires_minutes: int | None = None,
) -> str:
    settings = settings or get_settings()
    minutes = (
        expires_minutes
        if expires_minutes is not None
        else settings.access_token_expire_minutes
    )
    expire = datetime.now(UTC) + timedelta(minutes=minutes)
    payload = {
        "sub": str(user_id),
        "sv": int(session_version),
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def generate_password_reset_token() -> str:
    return secrets.token_urlsafe(32)


def hash_password_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def password_reset_tokens_match(token: str, token_hash: str) -> bool:
    return hmac.compare_digest(hash_password_reset_token(token), token_hash)


def title_case_name(name: str) -> str:
    return " ".join(part.capitalize() for part in name.strip().split() if part)


def decode_access_token(
    token: str,
    *,
    settings: Settings | None = None,
) -> AccessTokenClaims | None:
    settings = settings or get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None

    subject = payload.get("sub")
    if not isinstance(subject, str):
        return None

    try:
        user_id = uuid.UUID(subject)
    except ValueError:
        return None

    raw_sv = payload.get("sv", 0)
    try:
        session_version = int(raw_sv)
    except (TypeError, ValueError):
        return None

    return AccessTokenClaims(user_id=user_id, session_version=session_version)


def normalize_email(email: str) -> str:
    return email.strip().lower()
