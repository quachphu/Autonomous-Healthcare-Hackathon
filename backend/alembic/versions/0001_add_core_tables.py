"""add core tables: user_profiles, health_records, checkup_sessions, messaging

Revision ID: 0001_add_core_tables
Revises: 560a072cb656
Create Date: 2026-05-16

Tables created:
  - user_profiles        (mascot_health, timestamps)
  - health_records       (JSONB data, user FK)
  - checkup_sessions     (status enum, stats JSONB, brownie_points, rppg_raw)
  - message_threads      (type enum, last_message_at)
  - thread_participants  (thread_id + user_id composite PK)
  - messages             (sender_type enum, content, read_at)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_add_core_tables"
down_revision: Union[str, None] = "560a072cb656"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

session_status_enum = postgresql.ENUM(
    "pending", "in_progress", "completed", "cancelled",
    name="session_status",
    create_type=False,
)
thread_type_enum = postgresql.ENUM(
    "user", "agent",
    name="thread_type",
    create_type=False,
)
sender_type_enum = postgresql.ENUM(
    "user", "agent",
    name="sender_type",
    create_type=False,
)


def _create_enums() -> None:
    bind = op.get_bind()
    for enum in (
        postgresql.ENUM(
            "pending", "in_progress", "completed", "cancelled",
            name="session_status",
            create_type=True,
        ),
        postgresql.ENUM("user", "agent", name="thread_type", create_type=True),
        postgresql.ENUM("user", "agent", name="sender_type", create_type=True),
    ):
        enum.create(bind, checkfirst=True)


def upgrade() -> None:
    _create_enums()

    op.create_table(
        "user_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
                  comment="Mirrors auth.users.id from Supabase"),
        sa.Column("mascot_health", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        if_not_exists=True,
    )

    op.create_table(
        "health_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        if_not_exists=True,
    )
    op.create_index(
        "ix_health_records_user_id", "health_records", ["user_id"], if_not_exists=True
    )

    op.create_table(
        "checkup_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "status",
            session_status_enum,
            nullable=False,
            server_default="pending",
        ),
        sa.Column("stats", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("rppg_raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("brownie_points", sa.Float(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        if_not_exists=True,
    )
    op.create_index(
        "ix_checkup_sessions_user_completed",
        "checkup_sessions",
        ["user_id", "completed_at"],
        if_not_exists=True,
    )

    op.create_table(
        "message_threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("type", thread_type_enum, nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        if_not_exists=True,
    )

    op.create_table(
        "thread_participants",
        sa.Column("thread_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("message_threads.id", ondelete="CASCADE"),
                  primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        if_not_exists=True,
    )
    op.create_index(
        "ix_thread_participants_user", "thread_participants", ["user_id"], if_not_exists=True
    )

    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("thread_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("message_threads.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("sender_id", postgresql.UUID(as_uuid=True), nullable=True,
                  comment="Null when sender_type is agent"),
        sa.Column("sender_type", sender_type_enum, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        if_not_exists=True,
    )
    op.create_index("ix_messages_thread_id", "messages", ["thread_id"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_messages_thread_id", table_name="messages", if_exists=True)
    op.drop_table("messages", if_exists=True)
    op.drop_index("ix_thread_participants_user", table_name="thread_participants", if_exists=True)
    op.drop_table("thread_participants", if_exists=True)
    op.drop_table("message_threads", if_exists=True)
    op.drop_index("ix_checkup_sessions_user_completed", table_name="checkup_sessions", if_exists=True)
    op.drop_table("checkup_sessions", if_exists=True)
    op.drop_index("ix_health_records_user_id", table_name="health_records", if_exists=True)
    op.drop_table("health_records", if_exists=True)
    op.drop_table("user_profiles", if_exists=True)

    bind = op.get_bind()
    sender_type_enum.drop(bind, checkfirst=True)
    thread_type_enum.drop(bind, checkfirst=True)
    session_status_enum.drop(bind, checkfirst=True)
