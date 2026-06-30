"""Enable user-owned isolation and RLS policies.

Revision ID: 0006_multi_user_isolation_rls
Revises: 0005_tipo_controle_investimentos
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_multi_user_isolation_rls"
down_revision = "0005_tipo_controle_investimentos"
branch_labels = None
depends_on = None


USER_OWNED_TABLES = (
    "ativos",
    "caixinhas",
    "cartoes",
    "categorias",
    "compras_dolar",
    "compromissos_cartao",
    "configuracoes",
    "conta_saldos",
    "contas",
    "contas_futuras",
    "cotacoes",
    "dividendos",
    "extrato_dolar",
    "historico_investimentos_mensal",
    "lancamentos",
    "metas",
    "metodos_pagamento",
    "movimentos_investimento",
    "orcamento_itens",
    "orcamento_itens_padrao",
    "orcamento_padrao",
    "orcamentos_mensais",
    "pagamentos_fatura",
    "subcategorias",
)


def _has_table(conn, table_name: str) -> bool:
    inspector = sa.inspect(conn)
    return table_name in inspector.get_table_names()


def _has_column(conn, table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(conn)
    return column_name in {item["name"] for item in inspector.get_columns(table_name)}


def _quoted(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def upgrade() -> None:
    bind = op.get_bind()

    if _has_table(bind, "caixinhas") and not _has_column(bind, "caixinhas", "user_id"):
        op.add_column("caixinhas", sa.Column("user_id", sa.String(length=64), nullable=True))
        op.create_index("ix_caixinhas_user_id", "caixinhas", ["user_id"])

    if bind.dialect.name != "postgresql":
        return

    for table_name in USER_OWNED_TABLES:
        if not _has_table(bind, table_name) or not _has_column(bind, table_name, "user_id"):
            continue
        quoted_table = _quoted(table_name)
        index_name = _quoted(f"ix_{table_name}_user_id")
        bind.execute(sa.text(f"alter table public.{quoted_table} enable row level security"))
        bind.execute(sa.text(f'drop policy if exists "user_owned_rows_all" on public.{quoted_table}'))
        bind.execute(
            sa.text(
                f"""
                create policy "user_owned_rows_all"
                on public.{quoted_table}
                for all
                to authenticated
                using ((select auth.uid())::text = user_id)
                with check ((select auth.uid())::text = user_id)
                """
            )
        )
        bind.execute(sa.text(f"create index if not exists {index_name} on public.{quoted_table} (user_id)"))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for table_name in USER_OWNED_TABLES:
            if _has_table(bind, table_name):
                bind.execute(sa.text(f'drop policy if exists "user_owned_rows_all" on public.{_quoted(table_name)}'))
