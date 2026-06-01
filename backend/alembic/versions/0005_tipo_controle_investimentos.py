"""Add investment control type and allow value-only movements.

Revision ID: 0005_tipo_controle_investimentos
Revises: 0004_financeiro_integrado
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_tipo_controle_investimentos"
down_revision = "0004_financeiro_integrado"
branch_labels = None
depends_on = None


TIPOS_CONTROLE_VALOR = (
    "CAIXINHA_CDB",
    "RESERVA_EMERGENCIA",
    "RENDA_FIXA",
    "PREVIDENCIA",
    "OUTRO",
)


def _has_table(conn, table_name: str) -> bool:
    inspector = sa.inspect(conn)
    return table_name in inspector.get_table_names()


def _column(conn, table_name: str, column_name: str) -> dict | None:
    inspector = sa.inspect(conn)
    for item in inspector.get_columns(table_name):
        if item["name"] == column_name:
            return item
    return None


def upgrade() -> None:
    bind = op.get_bind()

    if _has_table(bind, "ativos") and not _column(bind, "ativos", "tipo_controle"):
        op.add_column(
            "ativos",
            sa.Column("tipo_controle", sa.String(), nullable=False, server_default="QUANTIDADE"),
        )

    if _has_table(bind, "ativos") and _column(bind, "ativos", "tipo_controle"):
        bind.execute(
            sa.text(
                """
                UPDATE ativos
                SET tipo_controle = 'VALOR'
                WHERE tipo_ativo IN :tipos
                """
            ).bindparams(sa.bindparam("tipos", expanding=True)),
            {"tipos": TIPOS_CONTROLE_VALOR},
        )
        bind.execute(
            sa.text(
                """
                UPDATE ativos
                SET tipo_controle = 'QUANTIDADE'
                WHERE tipo_controle IS NULL
                """
            )
        )

    if _has_table(bind, "movimentos_investimento"):
        quantidade = _column(bind, "movimentos_investimento", "quantidade")
        preco_unitario = _column(bind, "movimentos_investimento", "preco_unitario")
        precisa_alterar = bool(
            (quantidade and not quantidade.get("nullable")) or
            (preco_unitario and not preco_unitario.get("nullable"))
        )
        if precisa_alterar:
            with op.batch_alter_table("movimentos_investimento") as batch_op:
                if quantidade and not quantidade.get("nullable"):
                    batch_op.alter_column(
                        "quantidade",
                        existing_type=sa.Numeric(14, 2),
                        nullable=True,
                    )
                if preco_unitario and not preco_unitario.get("nullable"):
                    batch_op.alter_column(
                        "preco_unitario",
                        existing_type=sa.Numeric(14, 2),
                        nullable=True,
                    )


def downgrade() -> None:
    pass
