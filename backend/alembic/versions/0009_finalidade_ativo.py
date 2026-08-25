"""Add Ativo.finalidade (INVESTIMENTO vs GUARDADO), separate from tipo_ativo.

Caixinha CDB, Reserva de emergencia, Previdencia e Outro use tipo_controle=VALOR
(saldo unico, sem cotacao de mercado) -- mas isso nao diz se o dinheiro esta
sendo investido pra crescer ou apenas guardado pra um objetivo (ex.: uma
Caixinha CDB "Casa - Mycon"). Sem essa distincao, patrimonio investido,
rentabilidade e projecoes ficavam inflados/diluidos por dinheiro que nunca foi
pensado como investimento. Backfill: ativos dos quatro tipos VALOR nascem como
GUARDADO (o caso mais comum hoje); os demais, INVESTIMENTO.

Revision ID: 0009_finalidade_ativo
Revises: 0008_precisao_quantidade_investimento
Create Date: 2026-08-25
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_finalidade_ativo"
down_revision = "0008_precisao_quantidade_investimento"
branch_labels = None
depends_on = None


def _has_table(conn, table_name: str) -> bool:
    inspector = sa.inspect(conn)
    return table_name in inspector.get_table_names()


def _has_column(conn, table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(conn)
    return any(item["name"] == column_name for item in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "ativos"):
        return
    if _has_column(bind, "ativos", "finalidade"):
        return

    op.add_column(
        "ativos",
        sa.Column("finalidade", sa.String(), nullable=False, server_default="INVESTIMENTO"),
    )
    op.execute(
        sa.text(
            """
            UPDATE ativos
            SET finalidade = 'GUARDADO'
            WHERE tipo_ativo IN ('CAIXINHA_CDB', 'RESERVA_EMERGENCIA', 'PREVIDENCIA', 'OUTRO')
            """
        )
    )


def downgrade() -> None:
    pass
