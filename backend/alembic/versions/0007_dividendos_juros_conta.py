"""Allow account interest entries without an investment asset.

Revision ID: 0007_dividendos_juros_conta
Revises: 0006_multi_user_isolation_rls
Create Date: 2026-07-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_dividendos_juros_conta"
down_revision = "0006_multi_user_isolation_rls"
branch_labels = None
depends_on = None


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
    if not _has_table(bind, "dividendos"):
        return
    if not _column(bind, "dividendos", "conta_destino_id"):
        op.add_column("dividendos", sa.Column("conta_destino_id", sa.String(), nullable=True))
        op.create_index("ix_dividendos_conta_destino_id", "dividendos", ["conta_destino_id"])
    ativo_id = _column(bind, "dividendos", "ativo_id")
    if ativo_id and not ativo_id.get("nullable"):
        with op.batch_alter_table("dividendos") as batch_op:
            batch_op.alter_column("ativo_id", existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    pass
