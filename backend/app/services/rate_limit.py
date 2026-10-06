from __future__ import annotations

from collections import defaultdict
from time import monotonic

from fastapi import HTTPException, Request, status

# IP -> timestamps of recent attempts (login/register)
_attempts: dict[str, list[float]] = defaultdict(list)


def reset_rate_limits() -> None:
    _attempts.clear()


def rate_limit(
    request: Request,
    *,
    limit: int = 20,
    window_seconds: int = 60,
) -> None:
    """Simple in-memory rate limit by client IP for auth endpoints."""
    client_host = request.client.host if request.client else "unknown"
    now = monotonic()
    recent = [t for t in _attempts[client_host] if now - t < window_seconds]
    if len(recent) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
    recent.append(now)
    _attempts[client_host] = recent
