"""Initial local schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-09
"""
from alembic import op
from sqlmodel import SQLModel

from app.models import *  # noqa: F401,F403

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    SQLModel.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    SQLModel.metadata.drop_all(bind=op.get_bind())
