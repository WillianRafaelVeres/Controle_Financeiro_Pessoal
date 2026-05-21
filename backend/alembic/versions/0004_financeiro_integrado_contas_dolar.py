"""Integrated finance engine, manual accounts and dollar BRL trace.

Revision ID: 0004_financeiro_integrado
Revises: 0003_budget_items_history
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa
from sqlmodel import SQLModel

from app.models import *  # noqa: F401,F403

revision = "0004_financeiro_integrado"
down_revision = "0003_budget_items_history"
branch_labels = None
depends_on = None


def _has_table(conn, table_name: str) -> bool:
    inspector = sa.inspect(conn)
    return table_name in inspector.get_table_names()


def _has_column(conn, table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(conn)
    return column_name in {item["name"] for item in inspector.get_columns(table_name)}


def _add_column(conn, table_name: str, column: sa.Column) -> None:
    if _has_table(conn, table_name) and not _has_column(conn, table_name, column.name):
        op.add_column(table_name, column)


def upgrade() -> None:
    bind = op.get_bind()
    SQLModel.metadata.create_all(bind=bind)

    if _has_table(bind, "contas"):
        _add_column(bind, "contas", sa.Column("instituicao", sa.String(length=120), nullable=True))
        _add_column(bind, "contas", sa.Column("tipo_conta", sa.String(), nullable=False, server_default="CONTA_CORRENTE"))
        _add_column(bind, "contas", sa.Column("moeda", sa.String(), nullable=False, server_default="BRL"))
        _add_column(
            bind,
            "contas",
            sa.Column("saldo_atual_informado", sa.Numeric(14, 2), nullable=False, server_default="0"),
        )
        _add_column(
            bind,
            "contas",
            sa.Column("entra_no_saldo_em_contas", sa.Boolean(), nullable=False, server_default=sa.true()),
        )
        _add_column(bind, "contas", sa.Column("inativado_em", sa.DateTime(), nullable=True))
        bind.execute(
            sa.text(
                """
                UPDATE contas
                SET instituicao = COALESCE(instituicao, banco),
                    saldo_atual_informado = CASE
                        WHEN saldo_atual_informado IS NULL OR saldo_atual_informado = 0
                        THEN saldo_inicial
                        ELSE saldo_atual_informado
                    END
                """
            )
        )

    if _has_table(bind, "extrato_dolar"):
        _add_column(bind, "extrato_dolar", sa.Column("valor_brl", sa.Numeric(14, 2), nullable=False, server_default="0"))
        _add_column(
            bind,
            "extrato_dolar",
            sa.Column("cotacao_efetiva", sa.Numeric(14, 2), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    pass
