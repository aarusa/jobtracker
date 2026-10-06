from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserOut,
)
from app.services.rate_limit import rate_limit
from app.services.security import (
    COOKIE_NAME,
    create_access_token,
    generate_password_reset_token,
    hash_password,
    hash_password_reset_token,
    normalize_email,
    password_reset_tokens_match,
    title_case_name,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

GENERIC_FORGOT_DETAIL = (
    "If an account exists for that email, password reset instructions are ready."
)


def _set_access_cookie(
    response: Response,
    token: str,
    settings: Settings,
    *,
    max_age_seconds: int,
) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=max_age_seconds,
        path="/",
    )


def _clear_access_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    rate_limit(request)

    email = normalize_email(str(body.email))
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        name=title_case_name(body.name),
        email=email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    expire_minutes = settings.access_token_expire_minutes
    token = create_access_token(user.id, settings=settings, expires_minutes=expire_minutes)
    _set_access_cookie(response, token, settings, max_age_seconds=expire_minutes * 60)
    return user


@router.post("/login", response_model=UserOut)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    rate_limit(request)

    email = normalize_email(str(body.email))
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if body.remember_me:
        expire_minutes = settings.remember_me_expire_days * 24 * 60
    else:
        expire_minutes = settings.access_token_expire_minutes

    token = create_access_token(user.id, settings=settings, expires_minutes=expire_minutes)
    _set_access_cookie(response, token, settings, max_age_seconds=expire_minutes * 60)
    return user


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ForgotPasswordResponse:
    rate_limit(request)

    email = normalize_email(str(body.email))
    user = db.scalar(select(User).where(User.email == email))
    dev_reset_url: str | None = None

    if user is not None:
        raw_token = generate_password_reset_token()
        user.password_reset_token_hash = hash_password_reset_token(raw_token)
        user.password_reset_expires_at = datetime.now(UTC) + timedelta(hours=1)
        db.commit()
        if settings.expose_dev_reset_link:
            base = settings.frontend_base_url.rstrip("/")
            dev_reset_url = f"{base}/reset-password?token={raw_token}"

    return ForgotPasswordResponse(detail=GENERIC_FORGOT_DETAIL, dev_reset_url=dev_reset_url)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> None:
    rate_limit(request)

    users = db.scalars(
        select(User).where(User.password_reset_token_hash.is_not(None))
    ).all()
    matched: User | None = None
    for user in users:
        if user.password_reset_token_hash and password_reset_tokens_match(
            body.token, user.password_reset_token_hash
        ):
            matched = user
            break

    if matched is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired",
        )

    expires = matched.password_reset_expires_at
    if expires is None or expires < datetime.now(UTC):
        matched.password_reset_token_hash = None
        matched.password_reset_expires_at = None
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired",
        )

    matched.password_hash = hash_password(body.password)
    matched.password_reset_token_hash = None
    matched.password_reset_expires_at = None
    db.commit()


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    _current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> None:
    _clear_access_cookie(response, settings)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
