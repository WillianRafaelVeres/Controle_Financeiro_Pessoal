"""Testes da calculadora de distribuicao percentual.

Cobre o que o backend realmente possui: persistencia dos planos (semeadura
dos dois padroes, CRUD, ordem), a trava de soma = 100% e -- o mais
importante -- a garantia de isolamento: nada aqui pode criar lancamento,
movimento de investimento, caixinha ou conta. O calculo de "quanto vai pra
cada destino" e a correcao de centavos sao client-side (ver
frontend/src/lib/distribuicao.test.ts) e por isso nao estao aqui.
"""
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app import models  # noqa: F401
from app.models.cartao import Cartao
from app.models.caixinha import Caixinha
from app.models.conta import Conta
from app.models.extrato_dolar import ExtratoDolar
from app.models.investimento import Ativo, MovimentoInvestimento
from app.models.lancamento import Lancamento
from app.schemas.distribuicao_schema import DistribuicaoItem, DistribuicaoPlanoCreate, DistribuicaoPlanoUpdate
from app.services.distribuicao_service import atualizar_plano, criar_plano, excluir_plano, listar_planos


@pytest.fixture()
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


def test_listar_planos_semeia_os_dois_padroes_na_primeira_vez(session: Session):
    planos = listar_planos(session)

    assert [plano.nome for plano in planos] == ["Investimentos", "Renda Extra"]

    investimentos = planos[0]
    assert [item.nome for item in investimentos.itens] == ["Renda fixa", "FIIs", "Acoes BR", "Exterior", "Bitcoin"]
    assert [item.percentual for item in investimentos.itens] == [
        Decimal("25"), Decimal("15"), Decimal("20"), Decimal("25"), Decimal("15"),
    ]

    renda_extra = planos[1]
    assert [item.nome for item in renda_extra.itens] == [
        "Viagens", "Fundo carro/casa", "Investimentos", "Reserva de emergencia", "Previdencia PGBL",
    ]
    assert [item.percentual for item in renda_extra.itens] == [
        Decimal("50"), Decimal("15"), Decimal("15"), Decimal("10"), Decimal("10"),
    ]

    # O item "Investimentos" dentro de Renda Extra ja nasce ligado ao plano
    # Investimentos, pra poder ser expandido na tela.
    item_investimentos = next(item for item in renda_extra.itens if item.nome == "Investimentos")
    assert item_investimentos.subplano_id == investimentos.id


def test_investimentos_semeado_ja_vem_com_tipos_ativo_para_rebalanceamento(session: Session):
    """tipos_ativo e' o que liga cada classe do plano Investimentos ao valor
    real de carteira (calculo em si e' client-side -- ver
    frontend/src/lib/rebalanceamento.test.ts). So o plano Investimentos tem
    essa correspondencia; Renda Extra mistura metas que nao sao classes de
    ativo (Viagens, Reserva...) e por isso fica sem ela."""
    investimentos = listar_planos(session)[0]

    tipos_por_item = {item.nome: item.tipos_ativo for item in investimentos.itens}
    assert tipos_por_item == {
        "Renda fixa": ["RENDA_FIXA", "CAIXINHA_CDB"],
        "FIIs": ["FII"],
        "Acoes BR": ["ACAO_BR", "ETF_BR"],
        "Exterior": ["EXTERIOR", "ACAO_EXTERIOR", "ETF_EXTERIOR"],
        "Bitcoin": ["CRIPTO"],
    }

    renda_extra = listar_planos(session)[1]
    assert all(item.tipos_ativo is None for item in renda_extra.itens)


def test_plano_existente_sem_tipos_ativo_ganha_mapeamento_na_leitura(session: Session):
    """Simula um plano "Investimentos" criado antes dessa funcionalidade
    existir (tipos_ativo nunca setado). A primeira listagem depois do deploy
    precisa preencher pelo nome, sem exigir migracao nem intervencao manual --
    senao quem ja usava a Distribuicao nunca ganharia o rebalanceamento."""
    listar_planos(session)  # semeia os padroes (e' descartado a seguir)
    criado = criar_plano(
        session,
        DistribuicaoPlanoCreate(
            nome="Investimentos velho",
            itens=[
                DistribuicaoItem(id="a", nome="Renda fixa", percentual=Decimal("50")),
                DistribuicaoItem(id="b", nome="FIIs", percentual=Decimal("30")),
                DistribuicaoItem(id="c", nome="Algo sem mapeamento", percentual=Decimal("20")),
            ],
        ),
    )
    assert all(item.tipos_ativo is None for item in criado.itens)

    recarregado = next(p for p in listar_planos(session) if p.id == criado.id)
    tipos_por_item = {item.nome: item.tipos_ativo for item in recarregado.itens}
    assert tipos_por_item["Renda fixa"] == ["RENDA_FIXA", "CAIXINHA_CDB"]
    assert tipos_por_item["FIIs"] == ["FII"]
    assert tipos_por_item["Algo sem mapeamento"] is None

    # Idempotente: ler de novo nao muda nada (nem quebra) o que ja foi preenchido.
    outra_leitura = next(p for p in listar_planos(session) if p.id == criado.id)
    assert {item.nome: item.tipos_ativo for item in outra_leitura.itens} == tipos_por_item


def test_listar_planos_persiste_entre_chamadas_sem_recriar(session: Session):
    primeira_chamada = listar_planos(session)
    segunda_chamada = listar_planos(session)

    assert [plano.id for plano in primeira_chamada] == [plano.id for plano in segunda_chamada]


def test_criar_plano_bloqueia_quando_falta_percentual(session: Session):
    payload = DistribuicaoPlanoCreate(
        nome="Teste",
        itens=[
            DistribuicaoItem(id="a", nome="A", percentual=Decimal("60")),
            DistribuicaoItem(id="b", nome="B", percentual=Decimal("35")),
        ],
    )

    with pytest.raises(HTTPException) as exc:
        criar_plano(session, payload)

    assert exc.value.status_code == 422
    assert "Total atual: 95%" in exc.value.detail
    assert "faltam 5%" in exc.value.detail


def test_criar_plano_bloqueia_quando_excede_percentual(session: Session):
    payload = DistribuicaoPlanoCreate(
        nome="Teste",
        itens=[
            DistribuicaoItem(id="a", nome="A", percentual=Decimal("60")),
            DistribuicaoItem(id="b", nome="B", percentual=Decimal("45")),
        ],
    )

    with pytest.raises(HTTPException) as exc:
        criar_plano(session, payload)

    assert exc.value.status_code == 422
    assert "Total atual: 105%" in exc.value.detail
    assert "excedem 5%" in exc.value.detail


def test_criar_plano_com_soma_100_e_listado_depois(session: Session):
    payload = DistribuicaoPlanoCreate(
        nome="Ferias",
        itens=[
            DistribuicaoItem(id="a", nome="Passagem", percentual=Decimal("40")),
            DistribuicaoItem(id="b", nome="Hospedagem", percentual=Decimal("40")),
            DistribuicaoItem(id="c", nome="Passeios", percentual=Decimal("20")),
        ],
    )

    criado = criar_plano(session, payload)
    planos = listar_planos(session)

    assert criado.nome == "Ferias"
    assert any(plano.id == criado.id for plano in planos)


def test_atualizar_plano_renomeia_e_reordena_itens(session: Session):
    planos = listar_planos(session)
    investimentos = planos[0]

    atualizado = atualizar_plano(
        session,
        investimentos.id,
        DistribuicaoPlanoUpdate(
            nome="Investimentos (revisado)",
            itens=[
                DistribuicaoItem(id="novo-1", nome="Bitcoin", percentual=Decimal("15")),
                DistribuicaoItem(id="novo-2", nome="Renda fixa", percentual=Decimal("85")),
            ],
        ),
    )

    assert atualizado.nome == "Investimentos (revisado)"
    assert [item.nome for item in atualizado.itens] == ["Bitcoin", "Renda fixa"]
    assert [item.percentual for item in atualizado.itens] == [Decimal("15"), Decimal("85")]

    recarregado = next(p for p in listar_planos(session) if p.id == investimentos.id)
    assert recarregado.nome == "Investimentos (revisado)"


def test_atualizar_plano_bloqueia_quando_soma_invalida(session: Session):
    planos = listar_planos(session)
    investimentos = planos[0]

    with pytest.raises(HTTPException) as exc:
        atualizar_plano(
            session,
            investimentos.id,
            DistribuicaoPlanoUpdate(itens=[DistribuicaoItem(id="x", nome="X", percentual=Decimal("50"))]),
        )

    assert exc.value.status_code == 422
    assert "faltam 50%" in exc.value.detail


def test_excluir_plano_remove_so_o_plano_escolhido(session: Session):
    planos = listar_planos(session)
    investimentos, renda_extra = planos[0], planos[1]

    excluir_plano(session, investimentos.id)
    restantes = listar_planos(session)

    assert [plano.id for plano in restantes] == [renda_extra.id]


def test_distribuicao_nunca_cria_lancamento_ou_movimentacao_financeira(session: Session):
    """A garantia central da funcionalidade: e' so uma calculadora. Nenhuma
    operacao do CRUD de planos pode, direta ou indiretamente, criar
    lancamento, movimento de investimento, caixinha, conta ou extrato dolar."""

    def contagens() -> dict[str, int]:
        return {
            "lancamentos": len(session.exec(select(Lancamento)).all()),
            "movimentos_investimento": len(session.exec(select(MovimentoInvestimento)).all()),
            "ativos": len(session.exec(select(Ativo)).all()),
            "caixinhas": len(session.exec(select(Caixinha)).all()),
            "contas": len(session.exec(select(Conta)).all()),
            "cartoes": len(session.exec(select(Cartao)).all()),
            "extrato_dolar": len(session.exec(select(ExtratoDolar)).all()),
        }

    antes = contagens()

    planos = listar_planos(session)  # semeia os padroes
    criado = criar_plano(
        session,
        DistribuicaoPlanoCreate(
            nome="Teste isolamento",
            itens=[DistribuicaoItem(id="a", nome="A", percentual=Decimal("100"))],
        ),
    )
    atualizar_plano(
        session,
        criado.id,
        DistribuicaoPlanoUpdate(itens=[
            DistribuicaoItem(id="a", nome="A", percentual=Decimal("50")),
            DistribuicaoItem(id="b", nome="B", percentual=Decimal("50")),
        ]),
    )
    excluir_plano(session, planos[0].id)

    assert contagens() == antes
