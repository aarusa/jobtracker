from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Root of the monorepo (jobtracker/), one level above backend/
ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://jobtracker:jobtracker@localhost:5432/jobtracker"
    secret_key: str = "change-me-to-a-long-random-string"
    access_token_expire_minutes: int = 60
    cookie_secure: bool = False
    cors_origins: str = "http://localhost:5173"
    upload_dir: str = "./uploads"
    max_upload_mb: int = 5
    scrape_timeout_seconds: int = 10
    scrape_max_bytes: int = 2_097_152

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
