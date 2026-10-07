from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Application, Document, User
from app.schemas.auth import (
    DeleteAccountRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UpdateProfileRequest,
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
    title_case_name,
    verify_password,
)
from app.services.storage import Storage, get_storage

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
    token = create_access_token(
        user.id,
        session_version=user.session_version,
        settings=settings,
        expires_minutes=expire_minutes,
    )
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

    token = create_access_token(
        user.id,
        session_version=user.session_version,
        settings=settings,
        expires_minutes=expire_minutes,
    )
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

    token_hash = hash_password_reset_token(body.token)
    matched = db.scalar(
        select(User).where(User.password_reset_token_hash == token_hash)
    )

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
    matched.session_version += 1
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


@router.patch("/me", response_model=UserOut)
def update_me(
    body: UpdateProfileRequest,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> User:
    if body.name is None and body.new_password is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide a new name and/or a new password",
        )

    password_changed = False
    if body.new_password is not None:
        if not body.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required to set a new password",
            )
        if not verify_password(body.current_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current password is incorrect",
            )
        current_user.password_hash = hash_password(body.new_password)
        current_user.session_version += 1
        password_changed = True

    if body.name is not None:
        current_user.name = title_case_name(body.name)

    db.commit()
    db.refresh(current_user)
    if password_changed:
        # Invalidate this browser session; other sessions fail via session_version.
        _clear_access_cookie(response, settings)
    return current_user


def _delete_current_user_account(
    *,
    body: DeleteAccountRequest,
    response: Response,
    db: Session,
    current_user: User,
    settings: Settings,
    storage: Storage,
) -> None:
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password is incorrect",
        )

    storage_keys = list(
        db.scalars(
            select(Document.storage_key).where(Document.user_id == current_user.id)
        ).all()
    )

    # Delete children explicitly so SQLAlchemy does not NULL out required FKs.
    applications = db.scalars(
        select(Application).where(Application.user_id == current_user.id)
    ).all()
    for application in applications:
        db.delete(application)

    documents = db.scalars(
        select(Document).where(Document.user_id == current_user.id)
    ).all()
    for document in documents:
        db.delete(document)

    db.delete(current_user)
    db.commit()

    for key in storage_keys:
        storage.delete(key)
    _clear_access_cookie(response, settings)


@router.post("/delete-account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    body: DeleteAccountRequest,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_storage),
) -> None:
    """Preferred delete endpoint (POST body is reliably proxied by Vite)."""
    _delete_current_user_account(
        body=body,
        response=response,
        db=db,
        current_user=current_user,
        settings=settings,
        storage=storage,
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    body: DeleteAccountRequest,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_storage),
) -> None:
    _delete_current_user_account(
        body=body,
        response=response,
        db=db,
        current_user=current_user,
        settings=settings,
        storage=storage,
    )
