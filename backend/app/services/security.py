from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import Settings, get_settings

COOKIE_NAME = "access_token"
ALGORITHM = "HS256"

_password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


def create_access_token(
    user_id: uuid.UUID,
    *,
    settings: Settings | None = None,
) -> str:
    settings = settings or get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(
    token: str,
    *,
    settings: Settings | None = None,
) -> uuid.UUID | None:
    settings = settings or get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None

    subject = payload.get("sub")
    if not isinstance(subject, str):
        return None

    try:
        return uuid.UUID(subject)
    except ValueError:
        return None


def normalize_email(email: str) -> str:
    return email.strip().lower()
