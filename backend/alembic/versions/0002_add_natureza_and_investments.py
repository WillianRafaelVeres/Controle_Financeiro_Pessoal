"""Add category nature and system Investments category.

Revision ID: 0002_add_natureza_and_investments
Revises: 0001_initial
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa
from sqlmodel import SQLModel

from app.models import *  # noqa: F401,F403

revision = "0002_add_natureza_and_investments"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    SQLModel.metadata.create_all(bind=op.get_bind())

    conn = op.get_bind()
    existing = conn.execute(sa.text("SELECT id FROM categorias WHERE nome = 'Investimentos' LIMIT 1")).fetchone()

    if existing:
        conn.execute(
            sa.text(
                """
                UPDATE categorias
                SET natureza = 'INVESTIMENTO', ativa = 1, inativado_em = NULL, motivo_inativacao = NULL
                WHERE nome = 'Investimentos'
                """
            )
        )
        return

    investimentos_id = "00000000-0000-0000-0000-000000000001"
    conn.execute(
        sa.text(
            """
            INSERT INTO categorias (id, nome, natureza, ativa, criado_em, atualizado_em)
            VALUES (:id, 'Investimentos', 'INVESTIMENTO', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
        ),
        {"id": investimentos_id},
    )


def downgrade() -> None:
    pass
