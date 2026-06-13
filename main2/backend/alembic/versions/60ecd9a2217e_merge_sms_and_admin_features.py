"""merge sms and admin features

Revision ID: 60ecd9a2217e
Revises: c8dac45692b1, 814e9d9bd422
Create Date: 2026-05-17 10:53:42.657345

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '60ecd9a2217e'
down_revision: Union[str, None] = ('c8dac45692b1', '814e9d9bd422')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
