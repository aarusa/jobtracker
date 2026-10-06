from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import DocumentKind


class DocumentUpdate(BaseModel):
    label: str = Field(min_length=1, max_length=200)


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: DocumentKind
    label: str
    original_filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime
    used_by_count: int = 0
