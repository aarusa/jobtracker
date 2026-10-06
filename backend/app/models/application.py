from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import ApplicationStatus, ScrapeStatus, WorkType

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.status_history import StatusHistory
    from app.models.user import User


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("user_id", "job_url_normalized", name="uq_applications_user_url"),
        Index("ix_applications_user_id_status", "user_id", "status"),
        Index("ix_applications_user_id_applied_at", "user_id", text("applied_at DESC")),
        Index("ix_applications_user_id_updated_at", "user_id", text("updated_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_url: Mapped[str] = mapped_column(Text, nullable=False)
    job_url_normalized: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    company: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(Text, nullable=True)
    work_type: Mapped[WorkType] = mapped_column(
        Enum(WorkType, name="work_type", native_enum=True),
        nullable=False,
        server_default=WorkType.unknown.value,
    )
    employment_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    salary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_posted: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_domain: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, name="application_status", native_enum=True),
        nullable=False,
        server_default=ApplicationStatus.applied.value,
    )
    applied_at: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        server_default=func.current_date(),
    )
    resume_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
    )
    cover_letter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
    )
    scrape_status: Mapped[ScrapeStatus | None] = mapped_column(
        Enum(ScrapeStatus, name="scrape_status", native_enum=True),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped[User] = relationship(back_populates="applications")
    resume: Mapped[Document | None] = relationship(
        back_populates="applications_as_resume",
        foreign_keys=[resume_id],
    )
    cover_letter: Mapped[Document | None] = relationship(
        back_populates="applications_as_cover_letter",
        foreign_keys=[cover_letter_id],
    )
    status_history: Mapped[list[StatusHistory]] = relationship(
        back_populates="application",
        cascade="all, delete-orphan",
    )
