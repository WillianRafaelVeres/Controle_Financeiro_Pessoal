from collections.abc import Generator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from app.core.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False},
)


def create_db_and_tables() -> None:
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_schema_compatibility()
    _seed_system_categories()


def _ensure_schema_compatibility() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    def add_column_if_missing(table: str, column: str, ddl: str) -> None:
        if table not in tables:
            return
        columns = {item["name"] for item in inspector.get_columns(table)}
        if column in columns:
            return
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))

    for table, active_column in [("categorias", "ativa"), ("subcategorias", "ativa")]:
        add_column_if_missing(table, "natureza", "VARCHAR DEFAULT 'GASTO' NOT NULL")
        add_column_if_missing(table, active_column, "BOOLEAN DEFAULT 1 NOT NULL")
        add_column_if_missing(table, "inativado_em", "DATETIME")
        add_column_if_missing(table, "motivo_inativacao", "VARCHAR(250)")

    for table in ["metodos_pagamento", "cartoes"]:
        add_column_if_missing(table, "inativado_em", "DATETIME")
        add_column_if_missing(table, "motivo_inativacao", "VARCHAR(250)")

    if "contas" in tables:
        add_column_if_missing("contas", "instituicao", "VARCHAR(120)")
        add_column_if_missing("contas", "tipo_conta", "VARCHAR DEFAULT 'CONTA_CORRENTE' NOT NULL")
        add_column_if_missing("contas", "moeda", "VARCHAR DEFAULT 'BRL' NOT NULL")
        add_column_if_missing("contas", "saldo_atual_informado", "NUMERIC(14, 2) DEFAULT 0 NOT NULL")
        add_column_if_missing("contas", "entra_no_saldo_em_contas", "BOOLEAN DEFAULT 1 NOT NULL")
        add_column_if_missing("contas", "inativado_em", "DATETIME")

    if "extrato_dolar" in tables:
        add_column_if_missing("extrato_dolar", "valor_brl", "NUMERIC(14, 2) DEFAULT 0 NOT NULL")
        add_column_if_missing("extrato_dolar", "cotacao_efetiva", "NUMERIC(14, 2) DEFAULT 0 NOT NULL")

    if "dividendos" in tables:
        add_column_if_missing("dividendos", "valor_brl", "NUMERIC(14, 2) DEFAULT 0 NOT NULL")
        add_column_if_missing("dividendos", "cotacao_brl", "NUMERIC(14, 6)")
        add_column_if_missing("dividendos", "data_cotacao", "DATE")
        add_column_if_missing("dividendos", "fonte_cotacao", "VARCHAR(80)")

    if "contas_futuras" in tables:
        add_column_if_missing("contas_futuras", "metodo_pagamento_id", "VARCHAR")
        add_column_if_missing("contas_futuras", "conta_id", "VARCHAR")

    if "caixinhas" in tables:
        add_column_if_missing("caixinhas", "categoria_id", "VARCHAR")
        add_column_if_missing("caixinhas", "subcategoria_id", "VARCHAR")
        add_column_if_missing("caixinhas", "metodo_pagamento_id", "VARCHAR")
        add_column_if_missing("caixinhas", "conta_id", "VARCHAR")

    if "ativos" in tables:
        add_column_if_missing("ativos", "corretora", "VARCHAR(120)")

    for table in ["lancamentos", "orcamento_itens", "orcamento_itens_padrao"]:
        add_column_if_missing(table, "categoria_nome_snapshot", "VARCHAR(120)")
        add_column_if_missing(table, "subcategoria_nome_snapshot", "VARCHAR(120)")

    if "lancamentos" in tables:
        add_column_if_missing("lancamentos", "caixinha_id", "VARCHAR")
        add_column_if_missing("lancamentos", "origem_sistema", "VARCHAR(80)")
        add_column_if_missing("lancamentos", "referencia_id", "VARCHAR")

    if "orcamento_itens" in tables:
        add_column_if_missing("orcamento_itens", "natureza", "VARCHAR DEFAULT 'GASTO' NOT NULL")
        add_column_if_missing("orcamento_itens", "ativo", "BOOLEAN DEFAULT 1 NOT NULL")
        add_column_if_missing("orcamento_itens", "inativado_em", "DATETIME")
        add_column_if_missing("orcamento_itens", "motivo_inativacao", "VARCHAR(250)")

    with engine.begin() as conn:
        if "categorias" in tables:
            conn.execute(
                text(
                    """
                    UPDATE categorias
                    SET natureza = 'RECEITA'
                    WHERE lower(nome) IN ('receita', 'receitas', 'salario', 'salario fixo', 'extra', 'reembolso')
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE categorias
                    SET natureza = 'INVESTIMENTO'
                    WHERE lower(nome) IN ('investimento', 'investimentos', 'previdencia')
                       OR lower(nome) LIKE '%invest%'
                    """
                )
            )
        if "subcategorias" in tables and "categorias" in tables:
            conn.execute(
                text(
                    """
                    UPDATE subcategorias
                    SET natureza = (
                        SELECT categorias.natureza
                        FROM categorias
                        WHERE categorias.id = subcategorias.categoria_id
                    )
                    WHERE categoria_id IS NOT NULL
                    """
                )
            )
        if "contas" in tables:
            conn.execute(
                text(
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
        if "lancamentos" in tables:
            conn.execute(
                text(
                    """
                    UPDATE lancamentos
                    SET origem_sistema = 'DOLAR_ENVIO'
                    WHERE origem_sistema IS NULL
                      AND tipo = 'INVESTIMENTO'
                      AND categoria_id IS NULL
                      AND subcategoria_id IS NULL
                      AND metodo_pagamento_id IS NULL
                      AND cartao_id IS NULL
                      AND caixinha_id IS NULL
                      AND (
                        lower(COALESCE(observacao, '')) LIKE '%dolar%'
                        OR lower(COALESCE(observacao, '')) LIKE '%exterior%'
                      )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE lancamentos
                    SET origem_sistema = 'DOLAR_RETIRADA'
                    WHERE origem_sistema IS NULL
                      AND tipo = 'RECEITA'
                      AND categoria_id IS NULL
                      AND subcategoria_id IS NULL
                      AND metodo_pagamento_id IS NULL
                      AND cartao_id IS NULL
                      AND caixinha_id IS NULL
                      AND (
                        lower(COALESCE(observacao, '')) LIKE '%dolar%'
                        OR lower(COALESCE(observacao, '')) LIKE '%exterior%'
                      )
                    """
                )
            )


def _seed_system_categories() -> None:
    from app.models.base import NaturezaCategoria
    from app.models.categoria import Categoria

    with Session(engine) as session:
        categoria = session.exec(select(Categoria).where(Categoria.nome == "Investimentos")).first()
        if not categoria:
            categoria = Categoria(nome="Investimentos", natureza=NaturezaCategoria.INVESTIMENTO)
            session.add(categoria)
        else:
            categoria.natureza = NaturezaCategoria.INVESTIMENTO
            categoria.ativa = True
            categoria.inativado_em = None
            categoria.motivo_inativacao = None
            session.add(categoria)
        session.commit()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
