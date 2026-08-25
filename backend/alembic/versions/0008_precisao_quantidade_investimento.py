"""Widen movimentos_investimento.quantidade precision for fractional crypto units.

Numeric(14, 2) rounded small crypto purchases (e.g. 0.0047 BTC) down to 0.00,
which silently dropped the position from every net worth calculation. Widens
the column to Numeric(20, 8) and recovers already-truncated rows from
valor_total / preco_unitario, which were not affected by the same rounding.

Revision ID: 0008_precisao_quantidade_investimento
Revises: 0007_dividendos_juros_conta
Create Date: 2026-08-25
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_precisao_quantidade_investimento"
down_revision = "0007_dividendos_juros_conta"
branch_labels = None
depends_on = None


def _has_table(conn, table_name: str) -> bool:
    inspector = sa.inspect(conn)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "movimentos_investimento"):
        return

    with op.batch_alter_table("movimentos_investimento") as batch_op:
        batch_op.alter_column(
            "quantidade",
            existing_type=sa.Numeric(14, 2),
            type_=sa.Numeric(20, 8),
        )

    op.execute(
        sa.text(
            """
            UPDATE movimentos_investimento
            SET quantidade = valor_total / preco_unitario
            WHERE quantidade = 0
              AND preco_unitario IS NOT NULL AND preco_unitario > 0
              AND valor_total IS NOT NULL AND valor_total > 0
            """
        )
    )


def downgrade() -> None:
    pass
