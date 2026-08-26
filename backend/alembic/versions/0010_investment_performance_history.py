"""Add investment performance history tables (historico_benchmarks and historico_posicoes_investimentos_mensal).

Revision ID: 0010_investment_performance_history
Revises: 0009_finalidade_ativo
Create Date: 2026-08-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_investment_performance_history"
down_revision = "0009_finalidade_ativo"
branch_labels = None
depends_on = None


def _has_table(conn, table_name: str) -> bool:
    inspector = sa.inspect(conn)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "historico_benchmarks"):
        op.create_table(
            "historico_benchmarks",
            sa.Column("id", sa.String(), nullable=False, primary_key=True),
            sa.Column("user_id", sa.String(length=64), nullable=True),
            sa.Column("codigo", sa.String(length=50), nullable=False),
            sa.Column("data_referencia", sa.Date(), nullable=False),
            sa.Column("valor", sa.Numeric(14, 6), nullable=False),
            sa.Column("moeda", sa.String(), nullable=False, server_default="BRL"),
            sa.Column("tipo_retorno", sa.String(length=40), nullable=False, server_default="TOTAL_RETURN"),
            sa.Column("fonte", sa.String(length=80), nullable=False, server_default="SGS"),
            sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
            sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("codigo", "data_referencia", name="uq_historico_benchmarks_codigo_data"),
        )
        op.create_index("ix_historico_benchmarks_codigo", "historico_benchmarks", ["codigo"])
        op.create_index("ix_historico_benchmarks_data_referencia", "historico_benchmarks", ["data_referencia"])
        op.create_index("ix_historico_benchmarks_user_id", "historico_benchmarks", ["user_id"])

    if not _has_table(bind, "historico_posicoes_investimentos_mensal"):
        op.create_table(
            "historico_posicoes_investimentos_mensal",
            sa.Column("id", sa.String(), nullable=False, primary_key=True),
            sa.Column("user_id", sa.String(length=64), nullable=True),
            sa.Column("ativo_id", sa.String(), sa.ForeignKey("ativos.id"), nullable=False),
            sa.Column("ano", sa.Integer(), nullable=False),
            sa.Column("mes", sa.Integer(), nullable=False),
            sa.Column("data_referencia", sa.Date(), nullable=False),
            sa.Column("quantidade_fim", sa.Numeric(20, 8), nullable=True),
            sa.Column("preco_fim_original", sa.Numeric(14, 4), nullable=True),
            sa.Column("moeda", sa.String(), nullable=False, server_default="BRL"),
            sa.Column("cotacao_brl", sa.Numeric(14, 6), nullable=False, server_default="1.00"),
            sa.Column("valor_fim_brl", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
            sa.Column("aportes_periodo_brl", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
            sa.Column("retiradas_periodo_brl", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
            sa.Column("proventos_periodo_brl", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
            sa.Column("fonte_valor", sa.String(length=80), nullable=False, server_default="RECONSTRUCAO"),
            sa.Column("qualidade_dado", sa.String(length=40), nullable=False, server_default="COMPLETO"),
            sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
            sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("user_id", "ativo_id", "ano", "mes", name="uq_historico_posicoes_ativo_periodo"),
        )
        op.create_index("ix_historico_posicoes_ativo_id", "historico_posicoes_investimentos_mensal", ["ativo_id"])
        op.create_index("ix_historico_posicoes_ano", "historico_posicoes_investimentos_mensal", ["ano"])
        op.create_index("ix_historico_posicoes_mes", "historico_posicoes_investimentos_mensal", ["mes"])
        op.create_index("ix_historico_posicoes_data_ref", "historico_posicoes_investimentos_mensal", ["data_referencia"])
        op.create_index("ix_historico_posicoes_user_id", "historico_posicoes_investimentos_mensal", ["user_id"])


def downgrade() -> None:
    pass
