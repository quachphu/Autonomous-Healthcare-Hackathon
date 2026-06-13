"""add first_name, last_name, emergency_contact_name, emergency_contact_phone to user_profiles

Revision ID: 0004_name_emergency
Revises: 0003_users_table
Create Date: 2026-05-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_name_emergency"
down_revision: Union[str, None] = "0003_users_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in sa.inspect(bind).get_columns("user_profiles")}

    for col_name, col_def in [
        ("first_name", sa.Column("first_name", sa.String(100), nullable=True)),
        ("last_name", sa.Column("last_name", sa.String(100), nullable=True)),
        ("emergency_contact_name", sa.Column("emergency_contact_name", sa.String(200), nullable=True)),
        ("emergency_contact_phone", sa.Column("emergency_contact_phone", sa.String(30), nullable=True)),
    ]:
        if col_name not in columns:
            op.add_column("user_profiles", col_def)


def downgrade() -> None:
    for col_name in ("emergency_contact_phone", "emergency_contact_name", "last_name", "first_name"):
        op.drop_column("user_profiles", col_name)
