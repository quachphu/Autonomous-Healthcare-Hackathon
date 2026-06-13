"""add user_role enum, role column to user_profiles, and doctor_patients table

Revision ID: 0002_roles_doctors
Revises: 0001_add_core_tables
Create Date: 2026-05-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_roles_doctors"
down_revision: Union[str, None] = "0001_add_core_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

user_role_enum = postgresql.ENUM("patient", "doctor", name="user_role", create_type=False)


def upgrade() -> None:
    postgresql.ENUM("patient", "doctor", name="user_role", create_type=True).create(
        op.get_bind(), checkfirst=True
    )

    bind = op.get_bind()
    columns = {col["name"] for col in sa.inspect(bind).get_columns("user_profiles")}
    if "role" not in columns:
        op.add_column(
            "user_profiles",
            sa.Column("role", user_role_enum, nullable=True),
        )

    op.create_table(
        "doctor_patients",
        sa.Column("doctor_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user_profiles.id", ondelete="CASCADE"),
                  primary_key=True, nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user_profiles.id", ondelete="CASCADE"),
                  primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        if_not_exists=True,
    )
    op.create_index(
        "ix_doctor_patients_patient_id", "doctor_patients", ["patient_id"], if_not_exists=True
    )


def downgrade() -> None:
    op.drop_index(
        "ix_doctor_patients_patient_id", table_name="doctor_patients", if_exists=True
    )
    op.drop_table("doctor_patients", if_exists=True)
    bind = op.get_bind()
    columns = {col["name"] for col in sa.inspect(bind).get_columns("user_profiles")}
    if "role" in columns:
        op.drop_column("user_profiles", "role")
    user_role_enum.drop(bind, checkfirst=True)
