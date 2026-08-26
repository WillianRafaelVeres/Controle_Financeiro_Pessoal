from datetime import date
from decimal import Decimal
import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401
from app.models.base import Moeda, TipoAtivo, TipoMovimentoInvestimento, TipoProvento
from app.models.dividendo import Dividendo
from app.models.historico_benchmark import HistoricoBenchmark
from app.models.investimento import Ativo, MovimentoInvestimento
from app.services.performance_investimento_service import (
    calcular_evolucao_categorias,
    calcular_rentabilidade_comparada,
)


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


def test_rentabilidade_sem_aporte_intermediario(session: Session):
    ativo = Ativo(ticker="PETR4", nome="Petrobras", tipo_ativo=TipoAtivo.ACAO_BR, moeda=Moeda.BRL)
    session.add(ativo)
    session.flush()

    # Compra 100 acoes a R$ 10 em 05/01/2026 (Total R$ 1000)
    mov = MovimentoInvestimento(
        ativo_id=ativo.id,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=date(2026, 1, 5),
        quantidade=Decimal("100"),
        preco_unitario=Decimal("10.00"),
        valor_total=Decimal("1000.00"),
    )
    session.add(mov)
    session.commit()

    res = calcular_rentabilidade_comparada(
        session,
        escopo_codigo="ACAO_BR",
        periodo_codigo="desde_inicio",
        data_fim_custom=date(2026, 1, 31),
    )

    assert res["escopo"]["codigo"] == "ACAO_BR"
    assert len(res["serie"]) >= 1
    # No primeiro mes sem variacao de cotacao externa, retorno = 0%
    assert res["serie"][0]["carteira"] == 0.0


def test_rentabilidade_neutraliza_aporte_intermediario(session: Session):
    ativo = Ativo(ticker="VALE3", nome="Vale", tipo_ativo=TipoAtivo.ACAO_BR, moeda=Moeda.BRL)
    session.add(ativo)
    session.flush()

    # Compra inicial em 05/01/2026 de R$ 1.000
    m1 = MovimentoInvestimento(
        ativo_id=ativo.id,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=date(2026, 1, 5),
        quantidade=Decimal("10"),
        preco_unitario=Decimal("100.00"),
        valor_total=Decimal("1000.00"),
    )
    # Aporte grande no meio do mês de R$ 10.000 em 15/01/2026
    m2 = MovimentoInvestimento(
        ativo_id=ativo.id,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=date(2026, 1, 15),
        quantidade=Decimal("100"),
        preco_unitario=Decimal("100.00"),
        valor_total=Decimal("10000.00"),
    )
    session.add(m1)
    session.add(m2)
    session.commit()

    res = calcular_rentabilidade_comparada(
        session,
        escopo_codigo="ACAO_BR",
        periodo_codigo="desde_inicio",
        data_fim_custom=date(2026, 1, 31),
    )

    # O aporte de 10.000 nao pode virar rentabilidade de +1000%
    assert res["serie"][0]["carteira"] < 5.0


def test_rentabilidade_considera_proventos(session: Session):
    ativo = Ativo(ticker="BBAS3", nome="Banco do Brasil", tipo_ativo=TipoAtivo.ACAO_BR, moeda=Moeda.BRL)
    session.add(ativo)
    session.flush()

    # Compra R$ 1.000 em 05/01/2026
    m1 = MovimentoInvestimento(
        ativo_id=ativo.id,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=date(2026, 1, 5),
        quantidade=Decimal("100"),
        preco_unitario=Decimal("10.00"),
        valor_total=Decimal("1000.00"),
    )
    # Provento de R$ 100 em 20/01/2026
    div = Dividendo(
        ativo_id=ativo.id,
        tipo_provento=TipoProvento.DIVIDENDO,
        data_recebimento=date(2026, 1, 20),
        valor=Decimal("100.00"),
        valor_brl=Decimal("100.00"),
    )
    session.add(m1)
    session.add(div)
    session.commit()

    res_com_proventos = calcular_rentabilidade_comparada(
        session, escopo_codigo="ACAO_BR", periodo_codigo="desde_inicio", incluir_proventos=True, data_fim_custom=date(2026, 1, 31)
    )
    res_sem_proventos = calcular_rentabilidade_comparada(
        session, escopo_codigo="ACAO_BR", periodo_codigo="desde_inicio", incluir_proventos=False, data_fim_custom=date(2026, 1, 31)
    )

    assert res_com_proventos["serie"][0]["carteira"] > res_sem_proventos["serie"][0]["carteira"]


def test_evolucao_categorias_soma(session: Session):
    a1 = Ativo(ticker="BBAS3", nome="Banco do Brasil", tipo_ativo=TipoAtivo.ACAO_BR, moeda=Moeda.BRL)
    a2 = Ativo(ticker="HGLG11", nome="CSHG Logistica", tipo_ativo=TipoAtivo.FII, moeda=Moeda.BRL)
    session.add(a1)
    session.add(a2)
    session.flush()

    m1 = MovimentoInvestimento(
        ativo_id=a1.id,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=date(2026, 1, 10),
        quantidade=Decimal("100"),
        preco_unitario=Decimal("30.00"),
        valor_total=Decimal("3000.00"),
    )
    m2 = MovimentoInvestimento(
        ativo_id=a2.id,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=date(2026, 1, 15),
        quantidade=Decimal("10"),
        preco_unitario=Decimal("160.00"),
        valor_total=Decimal("1600.00"),
    )
    session.add(m1)
    session.add(m2)
    session.commit()

    res = calcular_evolucao_categorias(session, modo="mensal", data_fim_custom=date(2026, 1, 31))

    assert len(res["periodos"]) >= 1
    p = res["periodos"][-1]
    total_patrimonio = p["patrimonio_total_brl"]
    soma_cats = sum(c["valor_brl"] for c in p["categorias"])
    soma_pcts = sum(c["percentual_carteira"] for c in p["categorias"])

    assert total_patrimonio == pytest.approx(4600.0, 0.1)
    assert soma_cats == pytest.approx(total_patrimonio, 0.1)
    assert soma_pcts == pytest.approx(100.0, 0.5)
