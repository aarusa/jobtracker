from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Root of the monorepo (jobtracker/), one level above backend/
ROOT_DIR = Path(__file__).resolve().parents[2]

CookieSameSite = Literal["lax", "strict", "none"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://jobtracker:jobtracker@localhost:5432/jobtracker"
    secret_key: str = "change-me-to-a-long-random-string"
    access_token_expire_minutes: int = 60
    remember_me_expire_days: int = 30
    # When true, forgot-password responses may include a one-time reset URL for local testing
    # (no email provider configured yet). Keep false in production.
    expose_dev_reset_link: bool = False
    frontend_base_url: str = "http://localhost:5173"
    cookie_secure: bool = False
    # Use "none" (with COOKIE_SECURE=true) when the frontend is on a different origin.
    cookie_samesite: CookieSameSite = "lax"
    cors_origins: str = "http://localhost:5173"
    upload_dir: str = "./uploads"
    max_upload_mb: int = 5
    scrape_timeout_seconds: int = 10
    scrape_max_bytes: int = 2_097_152

    @field_validator("cookie_samesite", mode="before")
    @classmethod
    def normalize_cookie_samesite(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
