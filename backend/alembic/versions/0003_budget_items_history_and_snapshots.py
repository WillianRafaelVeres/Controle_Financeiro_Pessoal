"""Budget item history, inactive metadata and snapshots.

Revision ID: 0003_budget_items_history
Revises: 0002_add_natureza_and_investments
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa
from sqlmodel import SQLModel

from app.models import *  # noqa: F401,F403

revision = "0003_budget_items_history"
down_revision = "0002_add_natureza_and_investments"
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

    for table_name in ["categorias", "subcategorias"]:
        _add_column(bind, table_name, sa.Column("natureza", sa.String(), nullable=False, server_default="GASTO"))
        active_name = "ativa"
        _add_column(bind, table_name, sa.Column(active_name, sa.Boolean(), nullable=False, server_default=sa.true()))
        _add_column(bind, table_name, sa.Column("inativado_em", sa.DateTime(), nullable=True))
        _add_column(bind, table_name, sa.Column("motivo_inativacao", sa.String(length=250), nullable=True))

    for table_name in ["metodos_pagamento", "cartoes"]:
        _add_column(bind, table_name, sa.Column("inativado_em", sa.DateTime(), nullable=True))
        _add_column(bind, table_name, sa.Column("motivo_inativacao", sa.String(length=250), nullable=True))

    for table_name in ["lancamentos", "orcamento_itens", "orcamento_itens_padrao"]:
        _add_column(bind, table_name, sa.Column("categoria_nome_snapshot", sa.String(length=120), nullable=True))
        _add_column(bind, table_name, sa.Column("subcategoria_nome_snapshot", sa.String(length=120), nullable=True))

    if _has_table(bind, "orcamento_itens"):
        _add_column(bind, "orcamento_itens", sa.Column("natureza", sa.String(), nullable=False, server_default="GASTO"))
        _add_column(bind, "orcamento_itens", sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()))
        _add_column(bind, "orcamento_itens", sa.Column("inativado_em", sa.DateTime(), nullable=True))
        _add_column(bind, "orcamento_itens", sa.Column("motivo_inativacao", sa.String(length=250), nullable=True))

    bind.execute(
        sa.text(
            """
            UPDATE categorias
            SET natureza = 'INVESTIMENTO', ativa = 1, inativado_em = NULL, motivo_inativacao = NULL
            WHERE nome = 'Investimentos'
            """
        )
    )
    exists = bind.execute(sa.text("SELECT id FROM categorias WHERE nome = 'Investimentos' LIMIT 1")).fetchone()
    if not exists:
        bind.execute(
            sa.text(
                """
                INSERT INTO categorias (id, nome, natureza, ativa, criado_em, atualizado_em)
                VALUES (:id, 'Investimentos', 'INVESTIMENTO', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """
            ),
            {"id": "00000000-0000-0000-0000-000000000001"},
        )


def downgrade() -> None:
    pass
