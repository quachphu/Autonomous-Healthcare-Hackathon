"""add users table for table-based auth

Revision ID: 0003_users_table
Revises: 0002_roles_doctors
Create Date: 2026-05-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_users_table"
down_revision: Union[str, None] = "0002_roles_doctors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(320), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        if_not_exists=True,
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True, if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_users_email", table_name="users", if_exists=True)
    op.drop_table("users", if_exists=True)
