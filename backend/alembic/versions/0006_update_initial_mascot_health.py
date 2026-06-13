"""update initial mascot health to 80

Revision ID: 0006_health_80
Revises: 0005, d3af7b4be86f
Create Date: 2026-05-17 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0006_health_80'
down_revision: Union[str, Sequence[str], None] = ('0005', 'd3af7b4be86f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Update existing users who are still at initial default (50)
    op.execute(
        "UPDATE user_profiles SET mascot_health = 80 WHERE mascot_health = 50"
    )


def downgrade() -> None:
    # Revert to 50 for users at 80 (note: this is imperfect if users naturally reached 80)
    op.execute(
        "UPDATE user_profiles SET mascot_health = 50 WHERE mascot_health = 80"
    )
