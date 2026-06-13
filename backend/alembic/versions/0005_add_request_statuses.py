"""add_request_statuses

Revision ID: 0005
Revises: add29834da46
Create Date: 2026-05-17 03:07:33.430556

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: Union[str, None] = 'add29834da46'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum types
    thread_status = sa.Enum('pending', 'accepted', 'rejected', 'blocked', name='thread_status')
    connection_status = sa.Enum('pending', 'accepted', 'rejected', name='connection_status')

    thread_status.create(op.get_bind())
    connection_status.create(op.get_bind())

    # Add columns to message_threads
    op.add_column('message_threads',
        sa.Column('status', thread_status, nullable=False, server_default='accepted'))
    op.add_column('message_threads',
        sa.Column('initiator_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))

    # Add columns to doctor_patients
    op.add_column('doctor_patients',
        sa.Column('status', connection_status, nullable=False, server_default='accepted'))
    op.add_column('doctor_patients',
        sa.Column('initiator_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))

    # Set initiator_id to doctor_id for existing rows
    op.execute('UPDATE doctor_patients SET initiator_id = doctor_id WHERE initiator_id IS NULL')

    # Make initiator_id not null after backfilling
    op.alter_column('doctor_patients', 'initiator_id', nullable=False)

    # Create indexes
    op.create_index('ix_message_threads_status', 'message_threads', ['status'])
    op.create_index('ix_doctor_patients_status', 'doctor_patients', ['status'])
    op.create_index('ix_doctor_patients_initiator', 'doctor_patients', ['initiator_id'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_doctor_patients_initiator')
    op.drop_index('ix_doctor_patients_status')
    op.drop_index('ix_message_threads_status')

    # Drop columns
    op.drop_column('doctor_patients', 'initiator_id')
    op.drop_column('doctor_patients', 'status')
    op.drop_column('message_threads', 'initiator_id')
    op.drop_column('message_threads', 'status')

    # Drop enum types
    sa.Enum(name='connection_status').drop(op.get_bind())
    sa.Enum(name='thread_status').drop(op.get_bind())
