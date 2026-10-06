from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from uuid import uuid4

from fastapi import Depends

from app.config import ROOT_DIR, Settings, get_settings


class Storage(ABC):
    """File storage interface. Swap LocalDiskStorage for an S3 implementation later."""

    @abstractmethod
    def save(self, data: bytes, *, extension: str) -> str:
        """Persist bytes and return a storage key (never derived from a client filename)."""

    @abstractmethod
    def open(self, storage_key: str) -> Path:
        """Return a readable path for the stored object."""

    @abstractmethod
    def delete(self, storage_key: str) -> None:
        """Remove the object if it exists. No-op if missing."""


class LocalDiskStorage(Storage):
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, data: bytes, *, extension: str) -> str:
        ext = extension if extension.startswith(".") else f".{extension}"
        storage_key = f"{uuid4().hex}{ext}"
        path = self._path_for(storage_key)
        path.write_bytes(data)
        return storage_key

    def open(self, storage_key: str) -> Path:
        path = self._path_for(storage_key)
        if not path.is_file():
            raise FileNotFoundError(storage_key)
        return path

    def delete(self, storage_key: str) -> None:
        path = self._path_for(storage_key)
        if path.is_file():
            path.unlink()

    def _path_for(self, storage_key: str) -> Path:
        # Reject path traversal; keys are always flat UUID-based names.
        if "/" in storage_key or "\\" in storage_key or ".." in storage_key:
            raise ValueError("Invalid storage key")
        return self.root / storage_key


def resolve_upload_dir(settings: Settings) -> Path:
    path = Path(settings.upload_dir)
    if not path.is_absolute():
        path = ROOT_DIR / path
    return path.resolve()


def get_storage(settings: Settings = Depends(get_settings)) -> Storage:
    return LocalDiskStorage(resolve_upload_dir(settings))
