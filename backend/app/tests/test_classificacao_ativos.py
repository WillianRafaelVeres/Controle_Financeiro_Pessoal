from datetime import date
from decimal import Decimal
import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401
from app.models.base import Moeda, TipoAtivo, TipoMovimentoInvestimento
from app.models.investimento import Ativo
from app.schemas.investimento_schema import MovimentoInvestimentoCreate
from app.services.investimento_service import comprar, _obter_ou_criar_ativo


@pytest.fixture()
def session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


def test_criar_fii_novo(session: Session):
    payload = MovimentoInvestimentoCreate(
        ticker="CPTS11",
        nome="Capitania Securities II",
        tipo_ativo=TipoAtivo.FII,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=date(2026, 8, 1),
        quantidade=Decimal("10"),
        preco_unitario=Decimal("8.50"),
        valor_total=Decimal("85.00"),
    )
    mov = comprar(session, payload)
    ativo = session.get(Ativo, mov.ativo_id)

    assert ativo is not None
    assert ativo.ticker == "CPTS11"
    assert ativo.tipo_ativo == TipoAtivo.FII


def test_comprar_fii_ja_existente(session: Session):
    # Primeira compra
    p1 = MovimentoInvestimentoCreate(
        ticker="CPTS11",
        tipo_ativo=TipoAtivo.FII,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=date(2026, 8, 1),
        quantidade=Decimal("10"),
        preco_unitario=Decimal("8.50"),
        valor_total=Decimal("85.00"),
    )
    mov1 = comprar(session, p1)

    # Segunda compra
    p2 = MovimentoInvestimentoCreate(
        ticker="CPTS11",
        tipo_ativo=TipoAtivo.FII,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=date(2026, 8, 15),
        quantidade=Decimal("5"),
        preco_unitario=Decimal("8.60"),
        valor_total=Decimal("43.00"),
    )
    mov2 = comprar(session, p2)

    assert mov1.ativo_id == mov2.ativo_id
    ativo = session.get(Ativo, mov2.ativo_id)
    assert ativo.tipo_ativo == TipoAtivo.FII


def test_reclassificar_ticker_existente_com_tipo_incorreto(session: Session):
    # Simula situacao onde CPTS11 havia sido criado como ACAO_BR por engano
    ativo_antigo = Ativo(
        ticker="CPTS11",
        nome="Capitania Securities",
        tipo_ativo=TipoAtivo.ACAO_BR,
        moeda=Moeda.BRL,
    )
    session.add(ativo_antigo)
    session.commit()
    session.refresh(ativo_antigo)

    # Nova compra informando explicitamente tipo_ativo = FII
    payload = MovimentoInvestimentoCreate(
        ticker="CPTS11",
        tipo_ativo=TipoAtivo.FII,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=date(2026, 8, 20),
        quantidade=Decimal("20"),
        preco_unitario=Decimal("8.50"),
        valor_total=Decimal("170.00"),
    )
    mov = comprar(session, payload)
    ativo_atualizado = session.get(Ativo, mov.ativo_id)

    assert ativo_atualizado.id == ativo_antigo.id
    assert ativo_atualizado.tipo_ativo == TipoAtivo.FII


def test_acao_normal_permanece_acao_br(session: Session):
    payload = MovimentoInvestimentoCreate(
        ticker="PETR4",
        nome="Petrobras PN",
        tipo_ativo=TipoAtivo.ACAO_BR,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=date(2026, 8, 1),
        quantidade=Decimal("100"),
        preco_unitario=Decimal("38.00"),
        valor_total=Decimal("3800.00"),
    )
    mov = comprar(session, payload)
    ativo = session.get(Ativo, mov.ativo_id)

    assert ativo.ticker == "PETR4"
    assert ativo.tipo_ativo == TipoAtivo.ACAO_BR


def test_etf_br_com_final_11_nao_e_convertido_para_fii(session: Session):
    payload = MovimentoInvestimentoCreate(
        ticker="BOVA11",
        nome="iShares Ibovespa ETF",
        tipo_ativo=TipoAtivo.ETF_BR,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=date(2026, 8, 1),
        quantidade=Decimal("10"),
        preco_unitario=Decimal("120.00"),
        valor_total=Decimal("1200.00"),
    )
    mov = comprar(session, payload)
    ativo = session.get(Ativo, mov.ativo_id)

    assert ativo.ticker == "BOVA11"
    assert ativo.tipo_ativo == TipoAtivo.ETF_BR
