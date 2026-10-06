from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserOut
from app.services.rate_limit import rate_limit
from app.services.security import (
    COOKIE_NAME,
    create_access_token,
    hash_password,
    normalize_email,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_access_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.access_token_expire_minutes * 60,
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
        name=body.name.strip(),
        email=email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, settings=settings)
    _set_access_cookie(response, token, settings)
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

    token = create_access_token(user.id, settings=settings)
    _set_access_cookie(response, token, settings)
    return user


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
