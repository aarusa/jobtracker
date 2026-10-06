"""create initial schema

Revision ID: 9a12f9e96dc6
Revises:
Create Date: 2026-10-06 11:33:56.319696

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "9a12f9e96dc6"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

document_kind = postgresql.ENUM("resume", "cover_letter", name="document_kind", create_type=False)
work_type = postgresql.ENUM(
    "remote", "hybrid", "onsite", "unknown", name="work_type", create_type=False
)
application_status = postgresql.ENUM(
    "applied",
    "screening",
    "interviewing",
    "offer",
    "accepted",
    "rejected",
    "withdrawn",
    name="application_status",
    create_type=False,
)
scrape_status = postgresql.ENUM(
    "success", "partial", "failed", "manual", name="scrape_status", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    postgresql.ENUM("resume", "cover_letter", name="document_kind").create(bind, checkfirst=True)
    postgresql.ENUM("remote", "hybrid", "onsite", "unknown", name="work_type").create(
        bind, checkfirst=True
    )
    postgresql.ENUM(
        "applied",
        "screening",
        "interviewing",
        "offer",
        "accepted",
        "rejected",
        "withdrawn",
        name="application_status",
    ).create(bind, checkfirst=True)
    postgresql.ENUM("success", "partial", "failed", "manual", name="scrape_status").create(
        bind, checkfirst=True
    )

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "documents",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("kind", document_kind, nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("original_filename", sa.Text(), nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.Text(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index(op.f("ix_documents_user_id"), "documents", ["user_id"], unique=False)
    op.create_table(
        "applications",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("job_url", sa.Text(), nullable=False),
        sa.Column("job_url_normalized", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("company", sa.Text(), nullable=True),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("work_type", work_type, server_default="unknown", nullable=False),
        sa.Column("employment_type", sa.Text(), nullable=True),
        sa.Column("salary_text", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("date_posted", sa.Date(), nullable=True),
        sa.Column("source_domain", sa.Text(), nullable=True),
        sa.Column("status", application_status, server_default="applied", nullable=False),
        sa.Column("applied_at", sa.Date(), server_default=sa.text("CURRENT_DATE"), nullable=False),
        sa.Column("resume_id", sa.UUID(), nullable=True),
        sa.Column("cover_letter_id", sa.UUID(), nullable=True),
        sa.Column("scrape_status", scrape_status, nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["cover_letter_id"], ["documents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["resume_id"], ["documents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "job_url_normalized", name="uq_applications_user_url"),
    )
    op.create_index(op.f("ix_applications_user_id"), "applications", ["user_id"], unique=False)
    op.create_index(
        "ix_applications_user_id_applied_at",
        "applications",
        ["user_id", sa.literal_column("applied_at DESC")],
        unique=False,
    )
    op.create_index(
        "ix_applications_user_id_status",
        "applications",
        ["user_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_applications_user_id_updated_at",
        "applications",
        ["user_id", sa.literal_column("updated_at DESC")],
        unique=False,
    )
    op.create_table(
        "status_history",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("application_id", sa.UUID(), nullable=False),
        sa.Column("from_status", application_status, nullable=True),
        sa.Column("to_status", application_status, nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_status_history_application_id"),
        "status_history",
        ["application_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_status_history_application_id"), table_name="status_history")
    op.drop_table("status_history")
    op.drop_index("ix_applications_user_id_updated_at", table_name="applications")
    op.drop_index("ix_applications_user_id_status", table_name="applications")
    op.drop_index("ix_applications_user_id_applied_at", table_name="applications")
    op.drop_index(op.f("ix_applications_user_id"), table_name="applications")
    op.drop_table("applications")
    op.drop_index(op.f("ix_documents_user_id"), table_name="documents")
    op.drop_table("documents")
    op.drop_table("users")

    bind = op.get_bind()
    postgresql.ENUM(name="scrape_status").drop(bind, checkfirst=True)
    postgresql.ENUM(name="application_status").drop(bind, checkfirst=True)
    postgresql.ENUM(name="work_type").drop(bind, checkfirst=True)
    postgresql.ENUM(name="document_kind").drop(bind, checkfirst=True)
