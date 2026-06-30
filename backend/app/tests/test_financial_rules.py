from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app import models  # noqa: F401
from app.models.base import (
    EscopoOrcamento,
    Moeda,
    NaturezaCategoria,
    StatusContaFutura,
    TipoConta,
    TipoAtivo,
    TipoControleInvestimento,
    TipoItemOrcamento,
    TipoLancamento,
    TipoMetodo,
    TipoMovimentoDolar,
    TipoMovimentoInvestimento,
    TipoProvento,
)
from app.core.tenancy import SESSION_USER_KEY
from app.models.caixinha import Caixinha
from app.models.cartao import Cartao
from app.models.categoria import Categoria
from app.models.compromisso_cartao import CompromissoCartao
from app.models.conta import Conta
from app.models.lancamento import Lancamento
from app.models.dividendo import Dividendo
from app.models.investimento import Ativo, MovimentoInvestimento
from app.models.metodo_pagamento import MetodoPagamento
from app.models.orcamento import OrcamentoItem, OrcamentoMensal
from app.models.subcategoria import Subcategoria
from app.schemas.cartao_schema import PagarFatura
from app.schemas.caixinha_schema import UsarCaixinha
from app.schemas.compromisso_cartao_schema import SepararCompromisso
from app.schemas.dividendo_schema import DividendoCreate
from app.schemas.investimento_schema import MovimentoInvestimentoCreate, MovimentoInvestimentoUpdate
from app.schemas.lancamento_schema import CartaoLancamentoInput, LancamentoCreate, LancamentoUpdate
from app.schemas.orcamento_schema import OrcamentoAlterar, OrcamentoCreate, OrcamentoItemCreate
from app.schemas.conta_schema import ContaCreate, ContaSaldoCreate
from app.schemas.conta_futura_schema import ContaFuturaCreate, PagarContaFutura
from app.schemas.exterior_dolar_schema import MovimentoDolarCreate, MovimentoDolarUpdate
from app.api.routes.contas import criar as criar_conta_route, atualizar_saldo as atualizar_saldo_conta_route
from app.api.routes.dividendos import criar as criar_dividendo_route
from app.services.cartao_service import pagar_fatura, separar_compromisso
from app.services.caixinha_service import listar_caixinhas, usar_caixinha
from app.services.conta_futura_service import criar_conta_futura, pagar_conta_futura
from app.services.investimento_service import (
    TIPOS_COTACAO_AUTOMATICA,
    TIPOS_COTACAO_AUTOMATICA_BR,
    _TESOURO_CACHE,
    _buscar_preco_tesouro,
    _tokens_tesouro,
    ativos_para_dividendos,
    atualizar_cotacao_automatica,
    atualizar_movimento,
    calcular_desempenho,
    calcular_posicao,
    comprar,
    excluir_movimento,
    listar_historico_desempenho,
    listar_movimentos,
    listar_posicoes,
    registrar_cotacao,
    sincronizar_lancamentos_investimentos_brl_pendentes,
    vender,
)
from app.services.lancamento_service import atualizar_lancamento, criar_lancamento
from app.services.financeiro_service import resumo_painel, resumo_planejamento
from app.services.relatorio_service import gastos_por_metodo
from app.services.orcamento_service import (
    adicionar_item_orcamento,
    alterar_orcamento,
    atualizar_item_orcamento,
    copiar_itens_mes_anterior,
    listar_itens_orcamento_mes,
    listar_nao_planejados_mes,
    remover_item_orcamento,
    upsert_orcamento,
)
from app.services.saldo_service import (
    calcular_compromisso_futuro_cartao,
    calcular_gasto_real_mes,
    calcular_reservado_cartao,
    calcular_reservado_caixinhas,
    calcular_reservado_contas_futuras,
    calcular_saldo_em_contas,
    calcular_saldo_livre,
    conciliacao,
)
from app.services.exterior_dolar_service import (
    atualizar_manual,
    buscar_cotacao_dolar_atual,
    excluir_manual,
    listar_extrato,
    registrar_manual,
    resumo_dolar,
    saldo_teorico_usd,
)
from app.services.dividendo_service import listar_historico_proventos, sincronizar_movimentos_dolar_dividendos_pendentes


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


def seed_basico(session: Session):
    conta = Conta(nome="Conta principal", saldo_inicial=Decimal("1000.00"), saldo_atual_informado=Decimal("1000.00"))
    categoria = Categoria(nome="Mercado")
    session.add(conta)
    session.add(categoria)
    session.flush()
    subcategoria = Subcategoria(nome="Supermercado", categoria_id=categoria.id)
    pix = MetodoPagamento(nome="Pix", tipo_metodo=TipoMetodo.PIX)
    cartao_metodo = MetodoPagamento(nome="Cartao XP", tipo_metodo=TipoMetodo.CARTAO_CREDITO)
    cartao = Cartao(nome="XP", limite_total=Decimal("5000.00"))
    session.add(subcategoria)
    session.add(pix)
    session.add(cartao_metodo)
    session.add(cartao)
    session.commit()
    return conta, categoria, subcategoria, pix, cartao_metodo, cartao


def test_tenancy_isola_caixinhas_por_usuario():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session_a:
        session_a.info[SESSION_USER_KEY] = "user-a"
        caixinha_a = Caixinha(nome="Reserva A")
        session_a.add(caixinha_a)
        session_a.commit()
        session_a.refresh(caixinha_a)
        assert caixinha_a.user_id == "user-a"

    with Session(engine) as session_b:
        session_b.info[SESSION_USER_KEY] = "user-b"
        caixinha_b = Caixinha(nome="Reserva B")
        session_b.add(caixinha_b)
        session_b.commit()
        session_b.refresh(caixinha_b)
        assert caixinha_b.user_id == "user-b"

    with Session(engine) as session_a:
        session_a.info[SESSION_USER_KEY] = "user-a"
        assert [item.nome for item in session_a.exec(select(Caixinha).order_by(Caixinha.nome)).all()] == ["Reserva A"]

    with Session(engine) as session_b:
        session_b.info[SESSION_USER_KEY] = "user-b"
        assert [item.nome for item in session_b.exec(select(Caixinha).order_by(Caixinha.nome)).all()] == ["Reserva B"]

    SQLModel.metadata.drop_all(engine)


def test_lancamento_pix_reduz_saldo_livre(session: Session):
    conta, categoria, subcategoria, pix, _, _ = seed_basico(session)

    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("100.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 9),
        ),
    )

    assert calcular_saldo_livre(session) == Decimal("900.00")
    assert calcular_gasto_real_mes(session, 2026, 5) == Decimal("100.00")


def test_separar_dinheiro_cria_caixinha_e_conta_no_orcamento(session: Session):
    _, categoria, subcategoria, _, _, _ = seed_basico(session)

    lancamento = criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("120.00"),
            tipo=TipoLancamento.SEPARAR,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            data_lancamento=date(2026, 5, 9),
            caixinha_nome="IPVA",
        ),
    )

    assert lancamento.metodo_pagamento_id is None
    assert lancamento.conta_id is None
    caixinhas = listar_caixinhas(session)
    assert len(caixinhas) == 1
    assert caixinhas[0].nome == "IPVA"
    assert caixinhas[0].valor_total == Decimal("120.00")
    assert calcular_reservado_caixinhas(session) == Decimal("120.00")
    assert calcular_saldo_livre(session) == Decimal("880.00")
    assert calcular_gasto_real_mes(session, 2026, 5) == Decimal("120.00")
    assert conciliacao(session)["diferenca_conciliacao"] == Decimal("0.00")


def test_conta_de_investimento_nao_entra_na_conciliacao(session: Session):
    conta_banco = Conta(
        nome="Conta corrente",
        saldo_inicial=Decimal("1000.00"),
        saldo_atual_informado=Decimal("1000.00"),
        tipo_conta=TipoConta.CONTA_CORRENTE,
        conta_gasto=True,
        entra_no_saldo_em_contas=True,
    )
    corretora = Conta(
        nome="Corretora",
        saldo_inicial=Decimal("5000.00"),
        saldo_atual_informado=Decimal("5000.00"),
        tipo_conta=TipoConta.CORRETORA,
        conta_gasto=True,
        entra_no_saldo_em_contas=True,
    )
    session.add(conta_banco)
    session.add(corretora)
    session.commit()

    assert calcular_saldo_livre(session) == Decimal("1000.00")
    assert calcular_saldo_em_contas(session) == Decimal("1000.00")


def test_usar_caixinha_reduz_reserva_sem_duplicar_gasto(session: Session):
    conta, categoria, subcategoria, pix, _, _ = seed_basico(session)
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("120.00"),
            tipo=TipoLancamento.SEPARAR,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 9),
            caixinha_nome="IPVA",
        ),
    )
    caixinha = listar_caixinhas(session)[0]

    usar_caixinha(
        session,
        caixinha.id,
        UsarCaixinha(valor=Decimal("50.00"), data_lancamento=date(2026, 5, 20), metodo_pagamento_id=pix.id),
    )

    atualizada = listar_caixinhas(session)[0]
    assert atualizada.valor_total == Decimal("70.00")
    assert calcular_reservado_caixinhas(session) == Decimal("70.00")
    assert calcular_saldo_livre(session) == Decimal("880.00")
    assert calcular_gasto_real_mes(session, 2026, 5) == Decimal("120.00")


def test_usar_caixinha_no_cartao_move_reserva_para_fatura(session: Session):
    _, categoria, subcategoria, _, _, cartao = seed_basico(session)
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("120.00"),
            tipo=TipoLancamento.SEPARAR,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            data_lancamento=date(2026, 5, 9),
            caixinha_nome="Livros",
        ),
    )
    caixinha = listar_caixinhas(session)[0]

    usar_caixinha(
        session,
        caixinha.id,
        UsarCaixinha(valor=Decimal("50.00"), data_lancamento=date(2026, 5, 20), cartao_id=cartao.id),
    )

    assert calcular_reservado_caixinhas(session) == Decimal("70.00")
    assert calcular_reservado_cartao(session, cartao.id) == Decimal("50.00")
    assert calcular_saldo_livre(session) == Decimal("880.00")
    assert calcular_gasto_real_mes(session, 2026, 5) == Decimal("120.00")


def test_editar_lancamento_comum_atualiza_valor_e_observacao(session: Session):
    conta, categoria, subcategoria, pix, _, _ = seed_basico(session)
    lancamento = criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("100.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 9),
        ),
    )

    atualizado = atualizar_lancamento(
        session,
        lancamento.id,
        LancamentoUpdate(valor=Decimal("80.00"), observacao="valor corrigido"),
    )

    assert atualizado.valor == Decimal("80.00")
    assert atualizado.valor_original == Decimal("80.00")
    assert atualizado.observacao == "valor corrigido"
    assert calcular_saldo_livre(session) == Decimal("920.00")


def test_cartao_separando_tudo_cria_reservado_sem_compromisso(session: Session):
    conta, categoria, subcategoria, _, cartao_metodo, cartao = seed_basico(session)

    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("1000.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=cartao_metodo.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 9),
            cartao=CartaoLancamentoInput(cartao_id=cartao.id, valor_separado_agora=Decimal("1000.00")),
        ),
    )

    assert calcular_saldo_livre(session) == Decimal("0.00")
    assert calcular_reservado_cartao(session, cartao.id) == Decimal("1000.00")
    assert calcular_compromisso_futuro_cartao(session, cartao.id) == Decimal("0.00")


def test_cartao_cadastrado_sem_metodo_cria_reserva_e_compromisso(session: Session):
    conta, categoria, subcategoria, _, _, cartao = seed_basico(session)

    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("1000.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 9),
            cartao=CartaoLancamentoInput(cartao_id=cartao.id, valor_separado_agora=Decimal("300.00")),
        ),
    )

    assert calcular_saldo_livre(session) == Decimal("700.00")
    assert calcular_reservado_cartao(session, cartao.id) == Decimal("300.00")
    assert calcular_compromisso_futuro_cartao(session, cartao.id) == Decimal("700.00")


def test_conta_futura_aberta_reduz_saldo_livre_e_concilia(session: Session):
    _, categoria, subcategoria, pix, *_ = seed_basico(session)

    conta_futura = criar_conta_futura(
        session,
        ContaFuturaCreate(
            descricao="Condominio",
            valor=Decimal("250.00"),
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=pix.id,
            data_vencimento=date(2026, 6, 10),
        ),
    )

    assert conta_futura.status == StatusContaFutura.ABERTA
    assert calcular_reservado_contas_futuras(session) == Decimal("250.00")
    assert calcular_saldo_livre(session) == Decimal("750.00")
    assert conciliacao(session)["diferenca_nao_explicada"] == Decimal("0.00")


def test_conta_futura_aberta_pode_ser_associada_a_uma_conta(session: Session):
    conta, categoria, subcategoria, pix, *_ = seed_basico(session)

    conta_futura = criar_conta_futura(
        session,
        ContaFuturaCreate(
            descricao="IPVA",
            valor=Decimal("300.00"),
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_vencimento=date(2027, 4, 20),
        ),
    )

    assert conta_futura.status == StatusContaFutura.ABERTA
    assert conta_futura.conta_id == conta.id
    assert calcular_reservado_contas_futuras(session) == Decimal("300.00")


def test_pagar_conta_futura_usa_conta_associada_por_padrao(session: Session):
    conta, categoria, subcategoria, pix, *_ = seed_basico(session)
    conta_futura = criar_conta_futura(
        session,
        ContaFuturaCreate(
            descricao="IPVA",
            valor=Decimal("300.00"),
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_vencimento=date(2027, 4, 20),
        ),
    )

    pagar_conta_futura(
        session,
        conta_futura.id,
        PagarContaFutura(
            metodo_pagamento_id=pix.id,
            data_pagamento=date(2027, 4, 20),
        ),
    )
    session.refresh(conta_futura)
    lancamento = session.get(Lancamento, conta_futura.lancamento_pagamento_id)

    assert conta_futura.status == StatusContaFutura.PAGA
    assert lancamento is not None
    assert lancamento.conta_id == conta.id


def test_pagar_conta_futura_vira_gasto_sem_descontar_duas_vezes(session: Session):
    conta, categoria, subcategoria, pix, *_ = seed_basico(session)
    conta_futura = criar_conta_futura(
        session,
        ContaFuturaCreate(
            descricao="Internet",
            valor=Decimal("120.00"),
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=pix.id,
            data_vencimento=date(2026, 6, 10),
        ),
    )

    pagar_conta_futura(
        session,
        conta_futura.id,
        PagarContaFutura(
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_pagamento=date(2026, 6, 10),
        ),
    )
    session.refresh(conta_futura)

    assert conta_futura.status == StatusContaFutura.PAGA
    assert calcular_reservado_contas_futuras(session) == Decimal("0.00")
    assert calcular_saldo_livre(session) == Decimal("880.00")
    assert calcular_gasto_real_mes(session, 2026, 6) == Decimal("120.00")


def test_cartao_separando_parte_cria_compromisso_futuro(session: Session):
    conta, categoria, subcategoria, _, cartao_metodo, cartao = seed_basico(session)

    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("1000.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=cartao_metodo.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 9),
            cartao=CartaoLancamentoInput(cartao_id=cartao.id, valor_separado_agora=Decimal("300.00")),
        ),
    )

    compromisso = session.exec(select(CompromissoCartao)).one()
    assert compromisso.valor_em_aberto == Decimal("700.00")
    assert calcular_saldo_livre(session) == Decimal("700.00")
    assert calcular_saldo_em_contas(session) == Decimal("1000.00")
    assert calcular_reservado_cartao(session, cartao.id) == Decimal("300.00")
    assert calcular_gasto_real_mes(session, 2026, 5) == Decimal("300.00")
    assert conciliacao(session)["diferenca_nao_explicada"] == Decimal("0.00")


def test_editar_valor_separado_de_compra_no_cartao_recalcula_futuro(session: Session):
    conta, categoria, subcategoria, _, cartao_metodo, cartao = seed_basico(session)
    lancamento = criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("1000.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=cartao_metodo.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 9),
            cartao=CartaoLancamentoInput(cartao_id=cartao.id, valor_separado_agora=Decimal("300.00")),
        ),
    )

    atualizar_lancamento(session, lancamento.id, LancamentoUpdate(valor=Decimal("400.00")))
    compromisso = session.exec(select(CompromissoCartao)).one()

    assert compromisso.valor_original == Decimal("600.00")
    assert compromisso.valor_em_aberto == Decimal("600.00")
    assert calcular_saldo_livre(session) == Decimal("600.00")
    assert calcular_reservado_cartao(session, cartao.id) == Decimal("400.00")
    assert calcular_compromisso_futuro_cartao(session, cartao.id) == Decimal("600.00")


def test_separar_parte_de_compromisso_reduz_aberto_e_afeta_orcamento(session: Session):
    conta, categoria, subcategoria, _, cartao_metodo, cartao = seed_basico(session)
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("1000.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=cartao_metodo.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 9),
            cartao=CartaoLancamentoInput(cartao_id=cartao.id, valor_separado_agora=Decimal("300.00")),
        ),
    )
    compromisso = session.exec(select(CompromissoCartao)).one()

    separar_compromisso(
        session,
        compromisso.id,
        SepararCompromisso(valor=Decimal("200.00"), data=date(2026, 5, 10)),
    )
    session.refresh(compromisso)

    assert compromisso.valor_em_aberto == Decimal("500.00")
    assert calcular_reservado_cartao(session, cartao.id) == Decimal("500.00")
    assert calcular_gasto_real_mes(session, 2026, 5) == Decimal("500.00")


def test_pagamento_de_fatura_nao_afeta_orcamento(session: Session):
    conta, categoria, subcategoria, _, cartao_metodo, cartao = seed_basico(session)
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("400.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=cartao_metodo.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 9),
            cartao=CartaoLancamentoInput(cartao_id=cartao.id, valor_separado_agora=Decimal("400.00")),
        ),
    )

    pagar_fatura(session, cartao.id, PagarFatura(valor_pago=Decimal("100.00")))

    assert calcular_saldo_em_contas(session) == Decimal("1000.00")
    assert calcular_reservado_cartao(session, cartao.id) == Decimal("300.00")
    assert calcular_gasto_real_mes(session, 2026, 5) == Decimal("400.00")


def test_categoria_generica_de_cartao_nao_conta_como_finalidade(session: Session):
    conta, categoria, subcategoria, _, cartao_metodo, cartao = seed_basico(session)
    categoria_generica = Categoria(nome="Compras no Cartão")
    session.add(categoria_generica)
    session.flush()
    sub_generica = Subcategoria(nome="Compras", categoria_id=categoria_generica.id)
    session.add(sub_generica)
    session.flush()
    session.add(
        Lancamento(
            data_lancamento=date(2026, 5, 22),
            tipo=TipoLancamento.GASTO,
            valor=Decimal("500.00"),
            valor_original=Decimal("500.00"),
            categoria_id=categoria_generica.id,
            subcategoria_id=sub_generica.id,
            cartao_id=cartao.id,
            afeta_saldo_livre=True,
            afeta_orcamento=True,
        )
    )
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("100.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=cartao_metodo.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 23),
            cartao=CartaoLancamentoInput(cartao_id=cartao.id, valor_separado_agora=Decimal("100.00")),
        ),
    )

    assert calcular_gasto_real_mes(session, 2026, 5) == Decimal("100.00")
    assert calcular_gasto_real_mes(session, 2026, 5, categoria_generica.id) == Decimal("0.00")
    assert resumo_painel(session, 2026, 5)["gasto_mes"] == Decimal("100.00")

    metodos = gastos_por_metodo(session, 2026, 5)
    assert metodos[0]["metodo"] == "XP"
    assert metodos[0]["tipo"] == "CARTAO"
    assert metodos[0]["valor"] == Decimal("600.00")


def test_orcamento_de_meses_anteriores_nao_muda(session: Session):
    _, categoria, *_ = seed_basico(session)
    upsert_orcamento(
        session,
        OrcamentoCreate(ano=2026, mes=1, categoria_id=categoria.id, valor_orcado=Decimal("250.00")),
    )

    alterar_orcamento(
        session,
        OrcamentoAlterar(
            categoria_id=categoria.id,
            ano=2026,
            mes=4,
            valor_orcado=Decimal("200.00"),
            escopo=EscopoOrcamento.DESTE_MES_EM_DIANTE,
        ),
    )

    janeiro = session.exec(
        select(OrcamentoMensal).where(OrcamentoMensal.ano == 2026, OrcamentoMensal.mes == 1)
    ).one()
    abril = session.exec(
        select(OrcamentoMensal).where(OrcamentoMensal.ano == 2026, OrcamentoMensal.mes == 4)
    ).one()
    assert janeiro.valor_orcado == Decimal("250.00")
    assert abril.valor_orcado == Decimal("200.00")


def test_ativo_zerado_nao_aparece_em_dividendos_e_venda_maior_bloqueia(session: Session):
    ativo = Ativo(ticker="BBAS3", nome="Banco do Brasil", tipo_ativo=TipoAtivo.ACAO_BR)
    session.add(ativo)
    session.commit()
    session.refresh(ativo)

    assert ativos_para_dividendos(session) == []
    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            data_movimento=date(2026, 5, 9),
            quantidade=Decimal("10.00"),
            preco_unitario=Decimal("20.00"),
        ),
    )
    assert [item.id for item in ativos_para_dividendos(session)] == [ativo.id]

    with pytest.raises(HTTPException):
        vender(
            session,
            MovimentoInvestimentoCreate(
                ativo_id=ativo.id,
                quantidade=Decimal("11.00"),
                preco_unitario=Decimal("20.00"),
            ),
        )

    vender(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            quantidade=Decimal("10.00"),
            preco_unitario=Decimal("20.00"),
        ),
    )
    assert ativos_para_dividendos(session) == []


def test_compra_por_ticker_cria_ativo_e_movimenta_dolar_exterior(session: Session):
    registrar_manual(
        session,
        MovimentoDolarCreate(
            tipo="ENVIO",
            data_movimento=date(2026, 5, 8),
            valor_brl=Decimal("1500.00"),
            valor_usd=Decimal("300.00"),
            descricao="Envio para compra exterior",
        ),
    )

    compra = comprar(
        session,
        MovimentoInvestimentoCreate(
            ticker="voo",
            nome="Vanguard S&P 500",
            tipo_ativo=TipoAtivo.ETF_EXTERIOR,
            moeda="USD",
            quantidade=Decimal("2.00"),
            preco_unitario=Decimal("100.00"),
            taxas=Decimal("1.00"),
            data_movimento=date(2026, 5, 9),
        ),
    )

    ativo = session.get(Ativo, compra.ativo_id)
    assert ativo is not None
    assert ativo.ticker == "VOO"
    assert saldo_teorico_usd(session) == Decimal("99.00")
    extrato = listar_extrato(session)
    assert extrato[0]["tipo"] == "COMPRA_EXTERIOR"
    assert extrato[0]["saida_usd"] == Decimal("201.00")

    vender(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            moeda="USD",
            quantidade=Decimal("1.00"),
            preco_unitario=Decimal("110.00"),
            taxas=Decimal("2.00"),
            data_movimento=date(2026, 5, 10),
        ),
    )

    assert saldo_teorico_usd(session) == Decimal("207.00")


def test_editar_e_excluir_movimento_investimento_brl_sincroniza_lancamento(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("1000.00"), saldo_atual_informado=Decimal("1000.00"))
    ativo = Ativo(ticker="BBAS3", nome="Banco do Brasil", tipo_ativo=TipoAtivo.ACAO_BR)
    session.add(conta)
    session.add(ativo)
    session.commit()
    session.refresh(ativo)

    compra = comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            quantidade=Decimal("10.00"),
            preco_unitario=Decimal("10.00"),
            conta_id=conta.id,
            data_movimento=date(2026, 5, 9),
        ),
    )
    lancamento = session.exec(select(Lancamento).where(Lancamento.referencia_id == compra.id)).one()

    atualizado = atualizar_movimento(
        session,
        compra.id,
        MovimentoInvestimentoUpdate(
            data_movimento=date(2026, 5, 10),
            quantidade=Decimal("10.00"),
            preco_unitario=Decimal("12.00"),
            corretora="Santander",
            observacao="preco corrigido",
        ),
    )
    session.refresh(lancamento)
    session.refresh(ativo)

    assert atualizado["valor_total"] == Decimal("120.0000")
    assert atualizado["corretora"] == "Santander"
    assert lancamento.ativo is True
    assert lancamento.valor == Decimal("120.0000")
    assert lancamento.data_lancamento == date(2026, 5, 10)
    assert lancamento.observacao == "preco corrigido"
    assert listar_movimentos(session)[0]["id"] == compra.id

    excluir_movimento(session, compra.id)
    session.refresh(lancamento)

    assert lancamento.ativo is False
    assert calcular_posicao(session, ativo.id)["quantidade_atual"] == Decimal("0.00")
    assert listar_movimentos(session) == []


def test_editar_e_excluir_compra_exterior_sincroniza_extrato_dolar(session: Session):
    registrar_manual(
        session,
        MovimentoDolarCreate(
            tipo="ENVIO",
            data_movimento=date(2026, 5, 8),
            valor_brl=Decimal("5000.00"),
            valor_usd=Decimal("1000.00"),
        ),
    )

    compra = comprar(
        session,
        MovimentoInvestimentoCreate(
            ticker="AAPL",
            nome="Apple",
            tipo_ativo=TipoAtivo.EXTERIOR,
            quantidade=Decimal("2.00"),
            preco_unitario=Decimal("100.00"),
            data_movimento=date(2026, 5, 9),
        ),
    )
    assert saldo_teorico_usd(session) == Decimal("800.00")

    atualizar_movimento(
        session,
        compra.id,
        MovimentoInvestimentoUpdate(
            quantidade=Decimal("2.00"),
            preco_unitario=Decimal("150.00"),
            observacao="Compra ajustada",
        ),
    )
    extrato_compra = next(item for item in listar_extrato(session) if item["tipo"] == "COMPRA_EXTERIOR")

    assert saldo_teorico_usd(session) == Decimal("700.00")
    assert extrato_compra["saida_usd"] == Decimal("300.0000")
    assert extrato_compra["descricao"] == "Compra ajustada"

    excluir_movimento(session, compra.id)

    assert saldo_teorico_usd(session) == Decimal("1000.00")
    assert calcular_posicao(session, compra.ativo_id)["quantidade_atual"] == Decimal("0.00")
    assert all(item["tipo"] != "COMPRA_EXTERIOR" for item in listar_extrato(session))


def test_compra_exterior_sem_saldo_usd_e_bloqueada(session: Session):
    with pytest.raises(HTTPException) as exc:
        comprar(
            session,
            MovimentoInvestimentoCreate(
                ticker="AAPL",
                tipo_ativo=TipoAtivo.EXTERIOR,
                quantidade=Decimal("1.00"),
                preco_unitario=Decimal("10.00"),
            ),
        )

    assert "Saldo USD insuficiente" in str(exc.value.detail)
    assert saldo_teorico_usd(session) == Decimal("0.00")


def test_cotacao_manual_altera_valor_atual_posicao(session: Session):
    ativo = Ativo(ticker="BBAS3", nome="Banco do Brasil", tipo_ativo=TipoAtivo.ACAO_BR)
    session.add(ativo)
    session.commit()
    session.refresh(ativo)

    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            quantidade=Decimal("10.00"),
            preco_unitario=Decimal("20.00"),
        ),
    )
    registrar_cotacao(session, ativo.id, Decimal("30.00"))

    posicao = listar_posicoes(session)[0]
    assert posicao["preco_atual"] == Decimal("30.00")
    assert posicao["valor_atual"] == Decimal("300.0000")
    assert posicao["lucro_prejuizo"] == Decimal("100.0000")


def test_preco_medio_ponderado_considera_compras_e_venda_parcial(session: Session):
    ativo = Ativo(ticker="BBAS3", nome="Banco do Brasil", tipo_ativo=TipoAtivo.ACAO_BR)
    session.add(ativo)
    session.commit()
    session.refresh(ativo)

    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            quantidade=Decimal("10.00"),
            preco_unitario=Decimal("10.00"),
            data_movimento=date(2026, 5, 1),
        ),
    )
    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            quantidade=Decimal("10.00"),
            preco_unitario=Decimal("20.00"),
            data_movimento=date(2026, 5, 2),
        ),
    )

    posicao = calcular_posicao(session, ativo.id)
    assert posicao["quantidade_atual"] == Decimal("20.00")
    assert posicao["valor_total_aportado"] == Decimal("300.0000")
    assert posicao["preco_medio"] == Decimal("15.0000")

    vender(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            quantidade=Decimal("5.00"),
            preco_unitario=Decimal("30.00"),
            data_movimento=date(2026, 5, 3),
        ),
    )

    posicao = calcular_posicao(session, ativo.id)
    assert posicao["quantidade_atual"] == Decimal("15.00")
    assert posicao["valor_total_aportado"] == Decimal("225.000000")
    assert posicao["preco_medio"] == Decimal("15.0000")


def test_venda_investimento_nacional_por_quantidade_aumenta_saldo_livre(session: Session):
    conta, *_ = seed_basico(session)
    ativo = Ativo(ticker="BBAS3", nome="Banco do Brasil", tipo_ativo=TipoAtivo.ACAO_BR)
    session.add(ativo)
    session.commit()
    session.refresh(ativo)

    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            quantidade=Decimal("2.00"),
            preco_unitario=Decimal("100.00"),
            conta_id=conta.id,
            data_movimento=date(2026, 5, 1),
        ),
    )
    assert calcular_saldo_livre(session) == Decimal("800.00")
    session.refresh(conta)
    assert conta.saldo_atual_informado == Decimal("1000.00")

    venda = vender(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            quantidade=Decimal("1.00"),
            preco_unitario=Decimal("120.00"),
            taxas=Decimal("5.00"),
            conta_id=conta.id,
            data_movimento=date(2026, 5, 2),
        ),
    )
    lancamento_venda = session.exec(
        select(Lancamento).where(Lancamento.referencia_id == venda.id, Lancamento.origem_sistema == "INVESTIMENTO_RESGATE")
    ).one()

    assert calcular_saldo_livre(session) == Decimal("915.00")
    session.refresh(conta)
    assert conta.saldo_atual_informado == Decimal("1000.00")
    assert lancamento_venda.tipo == TipoLancamento.AJUSTE
    assert lancamento_venda.valor == Decimal("115.00")
    assert lancamento_venda.afeta_orcamento is False


def test_posicao_inclui_dividendos_e_retorno_total(session: Session):
    ativo = Ativo(ticker="BBAS3", nome="Banco do Brasil", tipo_ativo=TipoAtivo.ACAO_BR)
    session.add(ativo)
    session.commit()
    session.refresh(ativo)

    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            quantidade=Decimal("10.00"),
            preco_unitario=Decimal("10.00"),
        ),
    )
    registrar_cotacao(session, ativo.id, Decimal("15.00"))
    session.add(
        Dividendo(
            ativo_id=ativo.id,
            tipo_provento=TipoProvento.DIVIDENDO,
            data_recebimento=date(2026, 5, 20),
            valor=Decimal("20.00"),
        )
    )
    session.commit()

    posicao = listar_posicoes(session)[0]

    assert posicao["tem_dividendos"] is True
    assert posicao["lucro_prejuizo"] == Decimal("50.0000")
    assert posicao["rentabilidade_percentual"] == Decimal("50.0")
    assert posicao["dividendos_recebidos"] == Decimal("20.00")
    assert posicao["lucro_prejuizo_com_dividendos"] == Decimal("70.0000")
    assert posicao["rentabilidade_com_dividendos_percentual"] == Decimal("70.0")


def test_proventos_usd_guardam_valor_brl_historico(session: Session, monkeypatch):
    monkeypatch.setattr(
        "app.services.dividendo_service.buscar_cotacao_dolar_data",
        lambda session, data_referencia: {
            "cotacao_brl": Decimal("4.90"),
            "data_cotacao": data_referencia,
            "fonte": "AwesomeAPI",
        },
    )
    acao = Ativo(ticker="BBAS3", nome="Banco do Brasil", tipo_ativo=TipoAtivo.ACAO_BR)
    exterior = Ativo(ticker="AAPL", nome="Apple", tipo_ativo=TipoAtivo.EXTERIOR)
    session.add(acao)
    session.add(exterior)
    session.commit()
    session.refresh(acao)
    session.refresh(exterior)

    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=acao.id,
            quantidade=Decimal("10.00"),
            preco_unitario=Decimal("10.00"),
        ),
    )
    registrar_manual(
        session,
        MovimentoDolarCreate(
            tipo="ENVIO",
            valor_brl=Decimal("1000.00"),
            valor_usd=Decimal("200.00"),
        ),
    )
    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=exterior.id,
            quantidade=Decimal("2.00"),
            preco_unitario=Decimal("20.00"),
        ),
    )

    criar_dividendo_route(
        DividendoCreate(
            ativo_id=acao.id,
            tipo_provento=TipoProvento.DIVIDENDO,
            data_recebimento=date(2026, 5, 5),
            valor=Decimal("20.00"),
            moeda=Moeda.BRL,
        ),
        session,
    )
    dividendo_usd = criar_dividendo_route(
        DividendoCreate(
            ativo_id=exterior.id,
            tipo_provento=TipoProvento.DIVIDENDO,
            data_recebimento=date(2026, 5, 10),
            valor=Decimal("10.00"),
            moeda=Moeda.USD,
        ),
        session,
    )

    assert dividendo_usd.valor_brl == Decimal("49.0000")
    assert dividendo_usd.cotacao_brl == Decimal("4.900000")

    historico = listar_historico_proventos(session, "mensal")
    assert historico["total_brl"] == Decimal("69.0000")
    assert historico["por_periodo"][0]["periodo"] == "05/2026"
    assert historico["por_periodo"][0]["total_brl"] == Decimal("69.0000")
    exterior_filtrado = listar_historico_proventos(session, "mensal", tipo_ativo=TipoAtivo.EXTERIOR)
    assert exterior_filtrado["total_brl"] == Decimal("49.0000")

    extrato = listar_extrato(session)
    movimento_dividendo = next(item for item in extrato if item["tipo"] == "DIVIDENDO_EXTERIOR")
    assert movimento_dividendo["valor_brl"] == Decimal("49.0000")
    assert movimento_dividendo["cotacao_efetiva"] == Decimal("4.9000")
    assert saldo_teorico_usd(session) == Decimal("170.00")


def test_sincronizacao_corrige_dividendo_usd_antigo_sem_extrato(session: Session):
    ativo = Ativo(ticker="IVV", nome="iShares Core S&P 500", tipo_ativo=TipoAtivo.EXTERIOR, moeda=Moeda.USD)
    session.add(ativo)
    session.flush()
    dividendo = Dividendo(
        ativo_id=ativo.id,
        tipo_provento=TipoProvento.DIVIDENDO,
        data_recebimento=date(2026, 6, 1),
        valor=Decimal("0.01"),
        moeda=Moeda.USD,
        valor_brl=Decimal("0.05"),
        cotacao_brl=Decimal("5.00"),
        data_cotacao=date(2026, 6, 1),
        fonte_cotacao="Manual",
    )
    session.add(dividendo)
    session.commit()

    assert saldo_teorico_usd(session) == Decimal("0.00")

    assert sincronizar_movimentos_dolar_dividendos_pendentes(session) == 1
    session.commit()

    extrato = listar_extrato(session)
    movimento_dividendo = next(item for item in extrato if item["referencia_id"] == dividendo.id)

    assert movimento_dividendo["tipo"] == TipoMovimentoDolar.DIVIDENDO_EXTERIOR
    assert movimento_dividendo["entrada_usd"] == Decimal("0.01")
    assert movimento_dividendo["valor_brl"] == Decimal("0.05")
    assert saldo_teorico_usd(session) == Decimal("0.01")


def test_cotacao_automatica_inclui_etf_br(session: Session, monkeypatch):
    assert {TipoAtivo.ACAO_BR, TipoAtivo.FII, TipoAtivo.ETF_BR}.issubset(TIPOS_COTACAO_AUTOMATICA_BR)
    ativo = Ativo(ticker="BOVA11", nome="iShares Bovespa", tipo_ativo=TipoAtivo.ETF_BR)
    session.add(ativo)
    session.commit()
    session.refresh(ativo)
    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            quantidade=Decimal("2.00"),
            preco_unitario=Decimal("100.00"),
        ),
    )
    urls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"chart": {"result": [{"meta": {"regularMarketPrice": 123.45}}]}}

    def fake_get(url, *args, **kwargs):
        urls.append(url)
        return FakeResponse()

    monkeypatch.setattr("app.services.investimento_service.httpx.get", fake_get)

    cotacao = atualizar_cotacao_automatica(session, ativo.id)

    assert cotacao.fonte == "YAHOO"
    assert cotacao.preco == Decimal("123.45")
    assert any("BOVA11.SA" in url for url in urls)


def test_tipos_manuais_nao_usam_cotacao_automatica(session: Session):
    ativo = Ativo(ticker="PREVIDENCIA_XP", nome="Previdencia XP", tipo_ativo=TipoAtivo.PREVIDENCIA)
    session.add(ativo)
    session.commit()
    session.refresh(ativo)
    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            valor_total=Decimal("100.00"),
        ),
    )
    cotacao = registrar_cotacao(session, ativo.id, Decimal("120.00"))

    with pytest.raises(HTTPException) as exc:
        atualizar_cotacao_automatica(session, ativo.id)

    assert cotacao.preco == Decimal("120.00")
    assert exc.value.status_code == 422


def test_cotacao_automatica_de_cripto_usa_preco_brl(session: Session, monkeypatch):
    assert TipoAtivo.CRIPTO in TIPOS_COTACAO_AUTOMATICA
    ativo = Ativo(ticker="BTC", nome="Bitcoin", tipo_ativo=TipoAtivo.CRIPTO)
    session.add(ativo)
    session.commit()
    session.refresh(ativo)
    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            quantidade=Decimal("0.01"),
            preco_unitario=Decimal("100000.00"),
        ),
    )

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"bitcoin": {"brl": 388416}}

    monkeypatch.setattr("app.services.investimento_service.httpx.get", lambda *args, **kwargs: FakeResponse())

    cotacao = atualizar_cotacao_automatica(session, ativo.id)

    assert cotacao.fonte == "COINGECKO"
    assert cotacao.preco == Decimal("388416")


def test_cotacao_automatica_exterior_usa_ticker_original(session: Session, monkeypatch):
    assert TipoAtivo.EXTERIOR in TIPOS_COTACAO_AUTOMATICA
    ativo = Ativo(ticker="AAPL", nome="Apple", tipo_ativo=TipoAtivo.EXTERIOR)
    session.add(ativo)
    session.commit()
    session.refresh(ativo)
    registrar_manual(
        session,
        MovimentoDolarCreate(
            tipo="ENVIO",
            valor_brl=Decimal("1000.00"),
            valor_usd=Decimal("200.00"),
        ),
    )
    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=ativo.id,
            quantidade=Decimal("1.00"),
            preco_unitario=Decimal("10.00"),
        ),
    )
    urls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"chart": {"result": [{"meta": {"regularMarketPrice": 180.12}}]}}

    def fake_get(url, *args, **kwargs):
        urls.append(url)
        return FakeResponse()

    monkeypatch.setattr("app.services.investimento_service.httpx.get", fake_get)

    cotacao = atualizar_cotacao_automatica(session, ativo.id)

    assert cotacao.preco == Decimal("180.12")
    assert any("/AAPL" in url for url in urls)
    assert not any("AAPL.SA" in url for url in urls)


def test_caixinha_cdb_usa_saldo_atual_como_valor_da_posicao(session: Session):
    primeira = comprar(
        session,
        MovimentoInvestimentoCreate(
            tipo_ativo=TipoAtivo.CAIXINHA_CDB,
            corretora="Banco",
            nome="CDB Banco",
            valor_total=Decimal("500.00"),
        ),
    )
    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=primeira.ativo_id,
            valor_total=Decimal("300.00"),
        ),
    )
    registrar_cotacao(session, primeira.ativo_id, Decimal("850.00"))

    posicao = calcular_posicao(session, primeira.ativo_id)

    assert posicao["valor_total_aportado"] == Decimal("800.0000")
    assert posicao["tipo_controle"] == TipoControleInvestimento.VALOR
    assert posicao["quantidade_atual"] is None
    assert posicao["valor_atual"] == Decimal("850.00")
    assert posicao["lucro_prejuizo"] == Decimal("50.0000")


def test_reserva_emergencia_funciona_como_conta_de_investimento(session: Session):
    primeira = comprar(
        session,
        MovimentoInvestimentoCreate(
            tipo_ativo=TipoAtivo.RESERVA_EMERGENCIA,
            corretora="Reserva",
            nome="Reserva",
            valor_total=Decimal("1000.00"),
        ),
    )
    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=primeira.ativo_id,
            valor_total=Decimal("500.00"),
        ),
    )
    registrar_cotacao(session, primeira.ativo_id, Decimal("1525.00"))

    ativo = session.get(Ativo, primeira.ativo_id)
    posicao = calcular_posicao(session, primeira.ativo_id)

    assert ativo is not None
    assert ativo.ticker == "RESERVA_EMERGENCIA_RESERVA"
    assert ativo.tipo_controle == TipoControleInvestimento.VALOR
    assert posicao["valor_total_aportado"] == Decimal("1500.0000")
    assert posicao["valor_atual"] == Decimal("1525.00")
    assert posicao["lucro_prejuizo"] == Decimal("25.0000")


def test_investimento_por_valor_nao_exige_quantidade_e_resgate_aumenta_saldo_livre(session: Session):
    conta, *_ = seed_basico(session)

    aporte = comprar(
        session,
        MovimentoInvestimentoCreate(
            tipo_ativo=TipoAtivo.OUTRO,
            nome="CDB Banco X",
            corretora="Banco X",
            valor_total=Decimal("1000.00"),
            conta_id=conta.id,
            data_movimento=date(2026, 5, 9),
        ),
    )

    movimento_aporte = session.get(MovimentoInvestimento, aporte.id)
    ativo = session.get(Ativo, aporte.ativo_id)
    assert movimento_aporte is not None
    assert ativo is not None
    assert ativo.tipo_controle == TipoControleInvestimento.VALOR
    assert movimento_aporte.tipo_movimento.value == "APORTE"
    assert movimento_aporte.quantidade is None
    assert movimento_aporte.preco_unitario is None
    assert calcular_saldo_livre(session) == Decimal("0.00")
    session.refresh(conta)
    assert conta.saldo_atual_informado == Decimal("1000.00")

    resgate = vender(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=aporte.ativo_id,
            valor_total=Decimal("400.00"),
            taxas=Decimal("10.00"),
            conta_id=conta.id,
            data_movimento=date(2026, 5, 10),
        ),
    )

    posicao = calcular_posicao(session, aporte.ativo_id)
    lancamento_resgate = session.exec(
        select(Lancamento).where(Lancamento.referencia_id == resgate.id, Lancamento.origem_sistema == "INVESTIMENTO_RESGATE")
    ).one()

    assert resgate.tipo_movimento.value == "RESGATE"
    assert posicao["valor_total_aportado"] == Decimal("600.00")
    assert posicao["valor_atual"] == Decimal("600.00")
    assert calcular_saldo_livre(session) == Decimal("390.00")
    assert lancamento_resgate.tipo == TipoLancamento.AJUSTE
    assert lancamento_resgate.valor == Decimal("390.00")
    assert lancamento_resgate.afeta_orcamento is False
    session.refresh(conta)
    assert conta.saldo_atual_informado == Decimal("1000.00")


def test_sincronizacao_corrige_movimento_brl_antigo_sem_lancamento(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("1000.00"), saldo_atual_informado=Decimal("900.00"))
    ativo = Ativo(
        ticker="PREVIDENCIA_GRAO",
        nome="Previdencia Grao",
        tipo_ativo=TipoAtivo.PREVIDENCIA,
        tipo_controle=TipoControleInvestimento.VALOR,
    )
    session.add(conta)
    session.add(ativo)
    session.flush()
    movimento = MovimentoInvestimento(
        ativo_id=ativo.id,
        tipo_movimento=TipoMovimentoInvestimento.APORTE,
        data_movimento=date(2026, 6, 1),
        quantidade=None,
        preco_unitario=None,
        valor_total=Decimal("100.00"),
        conta_id=conta.id,
    )
    session.add(movimento)
    session.commit()

    assert session.exec(select(Lancamento).where(Lancamento.referencia_id == movimento.id)).first() is None

    assert sincronizar_lancamentos_investimentos_brl_pendentes(session) == 1
    session.commit()

    lancamento = session.exec(select(Lancamento).where(Lancamento.referencia_id == movimento.id)).one()
    resumo = resumo_painel(session, 2026, 6)

    assert lancamento.tipo == TipoLancamento.INVESTIMENTO
    assert lancamento.valor == Decimal("100.00")
    assert lancamento.afeta_saldo_livre is True
    assert resumo["saldo_livre"] == Decimal("900.00")
    assert resumo["investimentos_mes"] == Decimal("100.00")
    assert resumo["diferenca_conciliacao"] == Decimal("0.00")


def test_aporte_nacional_sem_conta_origem_afeta_saldo_virtual(session: Session):
    """Posicao BRL sem conta de origem afeta o saldo livre, mas nao altera saldo real informado."""
    conta, *_ = seed_basico(session)

    aporte = comprar(
        session,
        MovimentoInvestimentoCreate(
            tipo_ativo=TipoAtivo.PREVIDENCIA,
            nome="Previdencia Grao",
            corretora="Grao",
            valor_total=Decimal("100.00"),
            data_movimento=date(2026, 6, 1),
        ),
    )

    lancamento = session.exec(select(Lancamento).where(Lancamento.referencia_id == aporte.id)).first()
    resumo = resumo_painel(session, 2026, 6)

    assert lancamento is not None
    assert lancamento.tipo == TipoLancamento.INVESTIMENTO
    assert lancamento.valor == Decimal("100.00")
    assert lancamento.conta_id is None
    assert resumo["saldo_livre"] == Decimal("900.00")
    assert resumo["investimentos_mes"] == Decimal("100.00")
    session.refresh(conta)
    assert conta.saldo_atual_informado == Decimal("1000.00")
    # a posicao continua existindo no patrimonio
    assert calcular_posicao(session, aporte.ativo_id)["valor_total_aportado"] == Decimal("100.00")


def test_resgate_nacional_sem_conta_destino_aumenta_saldo_virtual(session: Session):
    conta, *_ = seed_basico(session)
    aporte = comprar(
        session,
        MovimentoInvestimentoCreate(
            tipo_ativo=TipoAtivo.PREVIDENCIA,
            nome="Previdencia Grao",
            corretora="Grao",
            valor_total=Decimal("500.00"),
            data_movimento=date(2026, 6, 1),
        ),
    )

    resgate = vender(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=aporte.ativo_id,
            valor_total=Decimal("200.00"),
            taxas=Decimal("10.00"),
            data_movimento=date(2026, 6, 2),
        ),
    )

    lancamento = session.exec(
        select(Lancamento).where(Lancamento.referencia_id == resgate.id, Lancamento.origem_sistema == "INVESTIMENTO_RESGATE")
    ).one()

    assert lancamento.tipo == TipoLancamento.AJUSTE
    assert lancamento.valor == Decimal("190.00")
    assert lancamento.conta_id is None
    assert lancamento.afeta_orcamento is False
    assert calcular_saldo_livre(session) == Decimal("690.00")
    session.refresh(conta)
    assert conta.saldo_atual_informado == Decimal("1000.00")


def test_sincronizacao_inicial_preserva_posicao_sem_conta(session: Session):
    """Startup nao ativa movimentos antigos sem conta em lote."""
    conta = Conta(nome="Conta", saldo_inicial=Decimal("1000.00"), saldo_atual_informado=Decimal("1000.00"))
    ativo = Ativo(
        ticker="CAIXINHA_BANCO",
        nome="Caixinha Banco",
        tipo_ativo=TipoAtivo.CAIXINHA_CDB,
        tipo_controle=TipoControleInvestimento.VALOR,
    )
    session.add(conta)
    session.add(ativo)
    session.flush()
    movimento = MovimentoInvestimento(
        ativo_id=ativo.id,
        tipo_movimento=TipoMovimentoInvestimento.APORTE,
        data_movimento=date(2026, 5, 1),
        valor_total=Decimal("500.00"),
        conta_id=None,
    )
    # lancamento antigo inativo continua inativo ate o movimento ser editado.
    lancamento_antigo = Lancamento(
        data_lancamento=date(2026, 5, 1),
        tipo=TipoLancamento.INVESTIMENTO,
        valor=Decimal("500.00"),
        valor_original=Decimal("500.00"),
        observacao="Compra CAIXINHA_BANCO",
        origem_sistema="INVESTIMENTO_COMPRA",
        referencia_id=movimento.id,
        afeta_saldo_livre=True,
        afeta_orcamento=True,
        ativo=False,
    )
    session.add(movimento)
    session.add(lancamento_antigo)
    session.commit()

    assert calcular_saldo_livre(session) == Decimal("1000.00")

    assert sincronizar_lancamentos_investimentos_brl_pendentes(session) == 0
    session.commit()
    session.refresh(lancamento_antigo)

    assert lancamento_antigo.ativo is False
    assert calcular_saldo_livre(session) == Decimal("1000.00")


def test_editar_movimento_antigo_sem_conta_ativa_lancamento_virtual(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("1000.00"), saldo_atual_informado=Decimal("1000.00"))
    ativo = Ativo(
        ticker="PREVIDENCIA_GRAO",
        nome="Previdencia Grao",
        tipo_ativo=TipoAtivo.PREVIDENCIA,
        tipo_controle=TipoControleInvestimento.VALOR,
    )
    session.add(conta)
    session.add(ativo)
    session.flush()
    movimento = MovimentoInvestimento(
        ativo_id=ativo.id,
        tipo_movimento=TipoMovimentoInvestimento.APORTE,
        data_movimento=date(2026, 6, 1),
        valor_total=Decimal("100.00"),
        conta_id=None,
    )
    lancamento_antigo = Lancamento(
        data_lancamento=date(2026, 6, 1),
        tipo=TipoLancamento.INVESTIMENTO,
        valor=Decimal("100.00"),
        valor_original=Decimal("100.00"),
        observacao="Compra PREVIDENCIA_GRAO",
        origem_sistema="INVESTIMENTO_COMPRA",
        referencia_id=movimento.id,
        afeta_saldo_livre=True,
        afeta_orcamento=True,
        ativo=False,
    )
    session.add(movimento)
    session.add(lancamento_antigo)
    session.commit()

    atualizar_movimento(session, movimento.id, MovimentoInvestimentoUpdate(observacao="Aporte confirmado"))
    session.refresh(lancamento_antigo)
    resumo = resumo_painel(session, 2026, 6)

    assert lancamento_antigo.ativo is True
    assert lancamento_antigo.conta_id is None
    assert resumo["saldo_livre"] == Decimal("900.00")
    assert resumo["investimentos_mes"] == Decimal("100.00")
    session.refresh(conta)
    assert conta.saldo_atual_informado == Decimal("1000.00")


def test_desempenho_converte_posicao_usd_por_dolar_atual(session: Session, monkeypatch):
    monkeypatch.setattr(
        "app.services.investimento_service.buscar_cotacao_dolar_atual",
        lambda session: {
            "cotacao_brl": Decimal("5.00"),
            "percentual_variacao": Decimal("0.50"),
            "data_cotacao": "2026-05-21 10:00:00",
            "fonte": "AwesomeAPI",
        },
    )
    monkeypatch.setattr(
        "app.services.investimento_service._buscar_indice_yahoo",
        lambda simbolo: {
            "valor": Decimal("120000.00"),
            "variacao_percentual": Decimal("1.00"),
            "fonte": "Yahoo Finance",
            "data": "2026-05-21",
            "erro": None,
        },
    )
    monkeypatch.setattr(
        "app.services.investimento_service._buscar_cdi_diario",
        lambda: {
            "valor": Decimal("0.04"),
            "variacao_percentual": Decimal("0.04"),
            "fonte": "Banco Central SGS",
            "data": "21/05/2026",
            "erro": None,
        },
    )

    acao = Ativo(ticker="BBAS3", nome="Banco do Brasil", tipo_ativo=TipoAtivo.ACAO_BR)
    exterior = Ativo(ticker="AAPL", nome="Apple", tipo_ativo=TipoAtivo.EXTERIOR)
    session.add(acao)
    session.add(exterior)
    session.commit()
    session.refresh(acao)
    session.refresh(exterior)

    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=acao.id,
            quantidade=Decimal("10.00"),
            preco_unitario=Decimal("10.00"),
        ),
    )
    registrar_cotacao(session, acao.id, Decimal("15.00"))
    registrar_manual(
        session,
        MovimentoDolarCreate(
            tipo="ENVIO",
            valor_brl=Decimal("500.00"),
            valor_usd=Decimal("100.00"),
        ),
    )
    comprar(
        session,
        MovimentoInvestimentoCreate(
            ativo_id=exterior.id,
            quantidade=Decimal("2.00"),
            preco_unitario=Decimal("20.00"),
        ),
    )
    registrar_cotacao(session, exterior.id, Decimal("30.00"))

    desempenho = calcular_desempenho(session)

    assert desempenho["patrimonio_atual_brl"] == Decimal("450.000000")
    assert desempenho["total_aportado_brl"] == Decimal("300.000000")
    assert desempenho["lucro_prejuizo_brl"] == Decimal("150.000000")
    assert desempenho["exterior_brl"] == Decimal("300.000000")
    assert desempenho["rentabilidade_percentual"] == Decimal("50.0")
    assert desempenho["benchmarks"]["dolar"]["valor"] == Decimal("5.00")

    historico = listar_historico_desempenho(session, "mensal")
    snapshot = historico[-1]
    assert snapshot["ano"] == date.today().year
    assert snapshot["mes"] == date.today().month
    assert snapshot["patrimonio_atual_brl"] == Decimal("450.00")
    assert snapshot["total_aportado_brl"] == Decimal("300.00")
    assert snapshot["lucro_prejuizo_brl"] == Decimal("150.00")


def test_compra_sem_ticker_agrupa_por_tipo_e_corretora(session: Session):
    primeira = comprar(
        session,
        MovimentoInvestimentoCreate(
            tipo_ativo=TipoAtivo.PREVIDENCIA,
            corretora="XP",
            nome="Previdencia XP",
            valor_total=Decimal("500.00"),
        ),
    )
    segunda = comprar(
        session,
        MovimentoInvestimentoCreate(
            tipo_ativo=TipoAtivo.PREVIDENCIA,
            corretora="XP",
            valor_total=Decimal("500.00"),
        ),
    )

    ativo = session.get(Ativo, primeira.ativo_id)
    assert ativo is not None
    assert segunda.ativo_id == ativo.id
    assert ativo.ticker == "PREVIDENCIA_XP"
    assert ativo.moeda == "BRL"
    assert ativo.corretora == "XP"
    assert ativo.tipo_controle == TipoControleInvestimento.VALOR

    posicoes = listar_posicoes(session)
    assert len(posicoes) == 1
    assert posicoes[0]["quantidade_atual"] is None
    assert posicoes[0]["valor_total_aportado"] == Decimal("1000.0000")
    assert posicoes[0]["corretora"] == "XP"


def test_categoria_e_subcategoria_nao_entram_no_orcamento_automaticamente(session: Session):
    _, categoria, subcategoria, *_ = seed_basico(session)

    linhas = listar_itens_orcamento_mes(session, 2026, 5)

    assert linhas == []
    assert categoria.ativa is True
    assert subcategoria.ativa is True


def test_adicionar_categoria_e_subcategoria_ao_orcamento_e_calcular_realizado(session: Session):
    conta, categoria, subcategoria, pix, *_ = seed_basico(session)
    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=5,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            valor_orcado=Decimal("300.00"),
        ),
    )
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("120.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 10),
        ),
    )

    linhas = listar_itens_orcamento_mes(session, 2026, 5)

    assert len(linhas) == 1
    assert linhas[0]["categoria"] == "Mercado"
    assert linhas[0]["subcategoria"] == "Supermercado"
    assert linhas[0]["gasto_real"] == Decimal("120.00")


def test_copiar_mes_anterior_copia_so_itens_orcamentarios(session: Session):
    _, categoria, subcategoria, *_ = seed_basico(session)
    categoria_fora = Categoria(nome="Compras aleatorias")
    session.add(categoria_fora)
    session.commit()
    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=4,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            valor_orcado=Decimal("400.00"),
        ),
    )

    criados = copiar_itens_mes_anterior(session, 2026, 5)
    linhas = listar_itens_orcamento_mes(session, 2026, 5)

    assert len(criados) == 1
    assert [linha["categoria"] for linha in linhas] == ["Mercado"]


def test_remover_item_deste_mes_em_diante_preserva_meses_anteriores(session: Session):
    _, categoria, subcategoria, *_ = seed_basico(session)
    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=5,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            valor_orcado=Decimal("250.00"),
            escopo=EscopoOrcamento.DESTE_MES_EM_DIANTE,
        ),
    )
    maio = listar_itens_orcamento_mes(session, 2026, 5)[0]
    junho = listar_itens_orcamento_mes(session, 2026, 6)[0]

    remover_item_orcamento(session, junho["item_orcamento_id"], EscopoOrcamento.DESTE_MES_EM_DIANTE)

    assert len(listar_itens_orcamento_mes(session, 2026, 5)) == 1
    assert listar_itens_orcamento_mes(session, 2026, 6) == []
    assert maio["valor_orcado"] == Decimal("250.00")


def test_remover_apenas_este_mes_nao_altera_anterior_nem_proximo(session: Session):
    _, categoria, subcategoria, *_ = seed_basico(session)
    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=5,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            valor_orcado=Decimal("250.00"),
            escopo=EscopoOrcamento.DESTE_MES_EM_DIANTE,
        ),
    )
    abril = adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=4,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            valor_orcado=Decimal("250.00"),
        ),
    )
    maio_id = listar_itens_orcamento_mes(session, 2026, 5)[0]["item_orcamento_id"]

    remover_item_orcamento(session, maio_id, EscopoOrcamento.SOMENTE_ESTE_MES)

    assert session.get(OrcamentoItem, abril.id).ativo is True
    assert listar_itens_orcamento_mes(session, 2026, 5) == []
    assert len(listar_itens_orcamento_mes(session, 2026, 6)) == 1


def test_alterar_deste_mes_em_diante_nao_altera_meses_anteriores(session: Session):
    _, categoria, subcategoria, *_ = seed_basico(session)
    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=4,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            valor_orcado=Decimal("300.00"),
            escopo=EscopoOrcamento.DESTE_MES_EM_DIANTE,
        ),
    )
    maio_id = listar_itens_orcamento_mes(session, 2026, 5)[0]["item_orcamento_id"]

    atualizar_item_orcamento(session, maio_id, Decimal("200.00"), EscopoOrcamento.DESTE_MES_EM_DIANTE)

    assert listar_itens_orcamento_mes(session, 2026, 4)[0]["valor_orcado"] == Decimal("300.00")
    assert listar_itens_orcamento_mes(session, 2026, 5)[0]["valor_orcado"] == Decimal("200.00")
    assert listar_itens_orcamento_mes(session, 2026, 6)[0]["valor_orcado"] == Decimal("200.00")


def test_inativar_subcategoria_usada_preserva_lancamento_e_orcamento_antigo(session: Session):
    from app.api.routes.subcategorias import excluir as excluir_subcategoria

    conta, categoria, subcategoria, pix, *_ = seed_basico(session)
    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=5,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            valor_orcado=Decimal("150.00"),
        ),
    )
    lancamento = criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("80.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 12),
        ),
    )

    excluir_subcategoria(subcategoria.id, session)

    session.refresh(subcategoria)
    assert subcategoria.ativa is False
    assert session.get(type(lancamento), lancamento.id).ativo is True
    linha = listar_itens_orcamento_mes(session, 2026, 5)[0]
    assert linha["subcategoria"] == "Supermercado"
    assert linha["inativo_hoje"] is True


def test_tipo_lancamento_restringe_natureza_da_categoria(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("1000.00"))
    gasto = Categoria(nome="Moradia", natureza=NaturezaCategoria.GASTO)
    investimento = Categoria(nome="Investimentos", natureza=NaturezaCategoria.INVESTIMENTO)
    receita = Categoria(nome="Receitas", natureza=NaturezaCategoria.RECEITA)
    pix = MetodoPagamento(nome="Pix", tipo_metodo=TipoMetodo.PIX)
    session.add(conta)
    session.add(gasto)
    session.add(investimento)
    session.add(receita)
    session.add(pix)
    session.commit()

    with pytest.raises(HTTPException):
        criar_lancamento(
            session,
            LancamentoCreate(
                valor=Decimal("100.00"),
                tipo=TipoLancamento.GASTO,
                categoria_id=investimento.id,
                metodo_pagamento_id=pix.id,
                conta_id=conta.id,
                data_lancamento=date(2026, 5, 1),
            ),
        )

    with pytest.raises(HTTPException):
        criar_lancamento(
            session,
            LancamentoCreate(
                valor=Decimal("100.00"),
                tipo=TipoLancamento.INVESTIMENTO,
                categoria_id=gasto.id,
                conta_id=conta.id,
                data_lancamento=date(2026, 5, 1),
            ),
        )

    with pytest.raises(HTTPException):
        criar_lancamento(
            session,
            LancamentoCreate(
                valor=Decimal("100.00"),
                tipo=TipoLancamento.AJUSTE,
                categoria_id=receita.id,
                conta_id=conta.id,
                data_lancamento=date(2026, 5, 1),
            ),
        )


def test_lancamento_investimento_cria_movimento_e_conta_no_planejamento_sem_gasto(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("2000.00"))
    categoria = Categoria(nome="Investimentos", natureza=NaturezaCategoria.INVESTIMENTO)
    session.add(conta)
    session.add(categoria)
    session.flush()
    subcategoria = Subcategoria(nome="Acoes Brasil", categoria_id=categoria.id, natureza=NaturezaCategoria.INVESTIMENTO)
    session.add(subcategoria)
    session.commit()
    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=5,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.INVESTIMENTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            valor_orcado=Decimal("1000.00"),
        ),
    )

    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("1000.00"),
            tipo=TipoLancamento.INVESTIMENTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 20),
            movimento_investimento=MovimentoInvestimentoCreate(
                ticker="BBAS3",
                nome="Banco do Brasil",
                tipo_ativo=TipoAtivo.ACAO_BR,
                quantidade=Decimal("50.00"),
                preco_unitario=Decimal("20.00"),
            ),
        ),
    )

    linhas = listar_itens_orcamento_mes(session, 2026, 5)
    movimentos = session.exec(select(MovimentoInvestimento)).all()

    assert calcular_saldo_livre(session) == Decimal("1000.00")
    assert calcular_gasto_real_mes(session, 2026, 5) == Decimal("0.00")
    assert linhas[0]["gasto_real"] == Decimal("1000.00")
    assert len(movimentos) == 1
    assert session.get(Ativo, movimentos[0].ativo_id).ticker == "BBAS3"


def test_compra_investimento_brl_sincroniza_categoria_de_planejamento(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("3000.00"))
    session.add(conta)
    session.commit()

    comprar(
        session,
        MovimentoInvestimentoCreate(
            ticker="BBAS3",
            nome="Banco do Brasil",
            tipo_ativo=TipoAtivo.ACAO_BR,
            quantidade=Decimal("50.00"),
            preco_unitario=Decimal("20.00"),
            conta_id=conta.id,
            data_movimento=date(2026, 5, 20),
        ),
    )

    lancamento = session.exec(select(Lancamento).where(Lancamento.tipo == TipoLancamento.INVESTIMENTO)).one()
    categoria = session.get(Categoria, lancamento.categoria_id)
    subcategoria = session.get(Subcategoria, lancamento.subcategoria_id)

    assert categoria is not None
    assert subcategoria is not None
    assert categoria.nome == "Investimentos"
    assert categoria.natureza == NaturezaCategoria.INVESTIMENTO
    assert subcategoria.nome == "Acao BR"
    assert subcategoria.natureza == NaturezaCategoria.INVESTIMENTO

    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=5,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.INVESTIMENTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            valor_orcado=Decimal("1000.00"),
        ),
    )

    planejamento = resumo_planejamento(session, 2026, 5)

    assert planejamento["investimentos_executados"] == Decimal("1000.00")
    assert planejamento["investimentos_nao_planejados_total"] == Decimal("0.00")


def test_conciliacao_considera_lancamento_de_investimento(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("2000.00"), saldo_atual_informado=Decimal("1000.00"))
    categoria = Categoria(nome="Investimentos", natureza=NaturezaCategoria.INVESTIMENTO)
    session.add(conta)
    session.add(categoria)
    session.flush()
    subcategoria = Subcategoria(nome="Acoes Brasil", categoria_id=categoria.id, natureza=NaturezaCategoria.INVESTIMENTO)
    session.add(subcategoria)
    session.commit()

    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("1000.00"),
            tipo=TipoLancamento.INVESTIMENTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 20),
        ),
    )

    assert calcular_saldo_livre(session) == Decimal("1000.00")
    assert conciliacao(session)["saldo_livre"] == Decimal("1000.00")
    assert conciliacao(session)["diferenca_conciliacao"] == Decimal("0.00")


def test_snapshot_preserva_nome_antigo_no_orcamento_apos_renomear(session: Session):
    _, categoria, subcategoria, *_ = seed_basico(session)
    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=5,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            valor_orcado=Decimal("300.00"),
        ),
    )
    categoria.nome = "Mercado novo"
    subcategoria.nome = "Supermercado novo"
    session.add(categoria)
    session.add(subcategoria)
    session.commit()

    linha = listar_itens_orcamento_mes(session, 2026, 5)[0]

    assert linha["categoria"] == "Mercado"
    assert linha["subcategoria"] == "Supermercado"


def test_gasto_fora_do_planejamento_aparece_como_nao_planejado(session: Session):
    conta, categoria_planejada, sub_planejada, pix, *_ = seed_basico(session)
    lazer = Categoria(nome="Lazer")
    session.add(lazer)
    session.flush()
    cinema = Subcategoria(nome="Cinema", categoria_id=lazer.id)
    session.add(cinema)
    session.commit()
    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=5,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria_planejada.id,
            subcategoria_id=sub_planejada.id,
            valor_orcado=Decimal("500.00"),
        ),
    )
    for valor in [Decimal("50.00"), Decimal("30.00")]:
        criar_lancamento(
            session,
            LancamentoCreate(
                valor=valor,
                tipo=TipoLancamento.GASTO,
                categoria_id=lazer.id,
                subcategoria_id=cinema.id,
                metodo_pagamento_id=pix.id,
                conta_id=conta.id,
                data_lancamento=date(2026, 5, 5),
            ),
        )

    nao_planejados = listar_nao_planejados_mes(session, 2026, 5)

    assert len(nao_planejados) == 1
    assert nao_planejados[0]["categoria"] == "Lazer"
    assert nao_planejados[0]["subcategoria"] == "Cinema"
    assert nao_planejados[0]["valor_realizado"] == Decimal("80.00")


def test_orcamento_categoria_agrega_subitens_e_subcategoria_isola_demais_gastos(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("2000.00"))
    categoria = Categoria(nome="Moradia")
    pix = MetodoPagamento(nome="Pix", tipo_metodo=TipoMetodo.PIX)
    session.add(conta)
    session.add(categoria)
    session.add(pix)
    session.flush()
    aluguel = Subcategoria(nome="Aluguel", categoria_id=categoria.id)
    agua = Subcategoria(nome="Agua", categoria_id=categoria.id)
    session.add(aluguel)
    session.add(agua)
    session.commit()

    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=5,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=aluguel.id,
            valor_orcado=Decimal("600.00"),
        ),
    )
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("500.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=aluguel.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 3),
        ),
    )
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("120.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=agua.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 4),
        ),
    )

    linhas_maio = listar_itens_orcamento_mes(session, 2026, 5)
    nao_planejados_maio = listar_nao_planejados_mes(session, 2026, 5)

    assert linhas_maio[0]["gasto_real"] == Decimal("500.00")
    assert len(nao_planejados_maio) == 1
    assert nao_planejados_maio[0]["subcategoria"] == "Agua"
    assert nao_planejados_maio[0]["valor_realizado"] == Decimal("120.00")

    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=6,
            tipo_item=TipoItemOrcamento.CATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria.id,
            valor_orcado=Decimal("800.00"),
        ),
    )
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("500.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=aluguel.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 6, 3),
        ),
    )
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("120.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=agua.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 6, 4),
        ),
    )

    linhas_junho = listar_itens_orcamento_mes(session, 2026, 6)
    nao_planejados_junho = listar_nao_planejados_mes(session, 2026, 6)

    assert linhas_junho[0]["gasto_real"] == Decimal("620.00")
    assert nao_planejados_junho == []


def test_investimento_nao_planejado_aparece_separado_de_gasto(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("2000.00"))
    categoria = Categoria(nome="Investimentos", natureza=NaturezaCategoria.INVESTIMENTO)
    session.add(conta)
    session.add(categoria)
    session.flush()
    subcategoria = Subcategoria(nome="Acoes Brasil", categoria_id=categoria.id, natureza=NaturezaCategoria.INVESTIMENTO)
    session.add(subcategoria)
    session.commit()

    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("500.00"),
            tipo=TipoLancamento.INVESTIMENTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 5),
        ),
    )

    nao_planejados = listar_nao_planejados_mes(session, 2026, 5)

    assert len(nao_planejados) == 1
    assert nao_planejados[0]["natureza"] == NaturezaCategoria.INVESTIMENTO
    assert nao_planejados[0]["valor_realizado"] == Decimal("500.00")


def test_resumo_do_mes_baseado_em_planejado_executado_disponivel_percentual(session: Session):
    conta, categoria, subcategoria, pix, *_ = seed_basico(session)
    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=5,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            valor_orcado=Decimal("400.00"),
        ),
    )
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("100.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 2),
        ),
    )

    linha = listar_itens_orcamento_mes(session, 2026, 5)[0]
    planejado = linha["valor_orcado"]
    executado = linha["gasto_real"]
    disponivel = planejado - executado
    percentual = (executado / planejado) * Decimal("100")

    assert planejado == Decimal("400.00")
    assert executado == Decimal("100.00")
    assert disponivel == Decimal("300.00")
    assert percentual == Decimal("25.00")


def test_conta_atualizada_alimenta_saldo_em_contas_no_painel(session: Session):
    conta = criar_conta_route(
        ContaCreate(
            nome="PicPay",
            instituicao="PicPay",
            saldo_inicial=Decimal("2000.00"),
            saldo_atual_informado=Decimal("1000.00"),
            entra_no_saldo_em_contas=True,
        ),
        session,
    )

    atualizar_saldo_conta_route(
        conta.id,
        ContaSaldoCreate(data_referencia=date(2026, 5, 10), saldo_informado=Decimal("1500.00")),
        session,
    )

    resumo = resumo_painel(session, 2026, 5)
    assert resumo["saldo_em_contas_informado"] == Decimal("1500.00")
    assert calcular_saldo_em_contas(session) == Decimal("1500.00")


def test_receita_e_despesa_alimentam_painel_e_saldo_livre(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("1000.00"), saldo_atual_informado=Decimal("1000.00"))
    receita = Categoria(nome="Receitas", natureza=NaturezaCategoria.RECEITA)
    despesa = Categoria(nome="Moradia", natureza=NaturezaCategoria.GASTO)
    pix = MetodoPagamento(nome="Pix", tipo_metodo=TipoMetodo.PIX)
    session.add(conta)
    session.add(receita)
    session.add(despesa)
    session.add(pix)
    session.commit()

    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("2000.00"),
            tipo=TipoLancamento.RECEITA,
            categoria_id=receita.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 3),
        ),
    )
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("300.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=despesa.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 4),
        ),
    )

    resumo = resumo_painel(session, 2026, 5)
    assert resumo["saldo_livre"] == Decimal("2700.00")
    assert resumo["receitas_mes"] == Decimal("2000.00")
    assert resumo["despesas_mes"] == Decimal("300.00")
    assert resumo["saldo_em_contas_informado"] == Decimal("1000.00")


def test_planejamento_integrado_mostra_despesa_planejada_e_nao_planejada(session: Session):
    conta, categoria, subcategoria, pix, *_ = seed_basico(session)
    lazer = Categoria(nome="Lazer")
    session.add(lazer)
    session.flush()
    cinema = Subcategoria(nome="Cinema", categoria_id=lazer.id)
    session.add(cinema)
    session.commit()
    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=5,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            valor_orcado=Decimal("1200.00"),
        ),
    )
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("1000.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=categoria.id,
            subcategoria_id=subcategoria.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 5),
        ),
    )
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("80.00"),
            tipo=TipoLancamento.GASTO,
            categoria_id=lazer.id,
            subcategoria_id=cinema.id,
            metodo_pagamento_id=pix.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 6),
        ),
    )

    resumo = resumo_planejamento(session, 2026, 5)
    assert resumo["gastos_planejados"] == Decimal("1200.00")
    assert resumo["gastos_executados"] == Decimal("1000.00")
    assert resumo["gastos_nao_planejados_total"] == Decimal("80.00")
    assert resumo["gastos_nao_planejados"][0]["categoria"] == "Lazer"


def test_investimento_planejado_alimenta_painel_e_planejamento_sem_despesa(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("2000.00"), saldo_atual_informado=Decimal("1500.00"))
    categoria = Categoria(nome="Investimentos", natureza=NaturezaCategoria.INVESTIMENTO)
    session.add(conta)
    session.add(categoria)
    session.flush()
    previdencia = Subcategoria(nome="Previdencia", categoria_id=categoria.id, natureza=NaturezaCategoria.INVESTIMENTO)
    session.add(previdencia)
    session.commit()
    adicionar_item_orcamento(
        session,
        OrcamentoItemCreate(
            ano=2026,
            mes=5,
            tipo_item=TipoItemOrcamento.SUBCATEGORIA,
            natureza=NaturezaCategoria.INVESTIMENTO,
            categoria_id=categoria.id,
            subcategoria_id=previdencia.id,
            valor_orcado=Decimal("500.00"),
        ),
    )
    criar_lancamento(
        session,
        LancamentoCreate(
            valor=Decimal("500.00"),
            tipo=TipoLancamento.INVESTIMENTO,
            categoria_id=categoria.id,
            subcategoria_id=previdencia.id,
            conta_id=conta.id,
            data_lancamento=date(2026, 5, 7),
        ),
    )

    painel = resumo_painel(session, 2026, 5)
    planejamento = resumo_planejamento(session, 2026, 5)
    assert painel["saldo_livre"] == Decimal("1500.00")
    assert painel["investimentos_mes"] == Decimal("500.00")
    assert painel["despesas_mes"] == Decimal("0.00")
    assert painel["diferenca_conciliacao"] == Decimal("0.00")
    assert planejamento["investimentos_executados"] == Decimal("500.00")


def test_envio_dolar_reduz_saldo_livre_e_compra_exterior_nao_reduz_brl_de_novo(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("10000.00"), saldo_atual_informado=Decimal("10000.00"))
    session.add(conta)
    session.commit()

    registrar_manual(
        session,
        MovimentoDolarCreate(
            tipo="ENVIO",
            data_movimento=date(2026, 5, 8),
            valor_brl=Decimal("5000.00"),
            valor_usd=Decimal("1000.00"),
            descricao="Envio para corretora exterior",
        ),
    )

    assert calcular_saldo_livre(session) == Decimal("5000.00")
    session.refresh(conta)
    assert conta.saldo_atual_informado == Decimal("10000.00")
    assert conciliacao(session)["saldo_livre"] == Decimal("5000.00")
    assert conciliacao(session)["diferenca_conciliacao"] == Decimal("5000.00")
    assert saldo_teorico_usd(session) == Decimal("1000.00")
    painel = resumo_painel(session, 2026, 5)
    assert painel["saldo_livre"] == Decimal("5000.00")
    assert painel["investimentos_mes"] == Decimal("5000.00")
    assert painel["saldo_teorico_usd"] == Decimal("1000.00")

    comprar(
        session,
        MovimentoInvestimentoCreate(
            ticker="AAPL",
            nome="Apple",
            tipo_ativo=TipoAtivo.ACAO_EXTERIOR,
            moeda="USD",
            quantidade=Decimal("5.00"),
            preco_unitario=Decimal("100.00"),
            data_movimento=date(2026, 5, 9),
        ),
    )

    assert calcular_saldo_livre(session) == Decimal("5000.00")
    assert conciliacao(session)["saldo_livre"] == Decimal("5000.00")
    assert saldo_teorico_usd(session) == Decimal("500.00")

    registrar_manual(
        session,
        MovimentoDolarCreate(
            tipo="RETIRADA",
            data_movimento=date(2026, 5, 10),
            valor_brl=Decimal("2500.00"),
            valor_usd=Decimal("500.00"),
            descricao="Retirada da corretora exterior",
        ),
    )

    session.refresh(conta)
    assert conta.saldo_atual_informado == Decimal("10000.00")
    assert saldo_teorico_usd(session) == Decimal("0.00")
    assert conciliacao(session)["saldo_livre"] == Decimal("7500.00")
    assert conciliacao(session)["diferenca_conciliacao"] == Decimal("2500.00")


def test_editar_e_excluir_movimento_dolar_sincroniza_lancamento_brl(session: Session):
    conta = Conta(nome="Conta", saldo_inicial=Decimal("10000.00"), saldo_atual_informado=Decimal("10000.00"))
    session.add(conta)
    session.commit()

    movimento = registrar_manual(
        session,
        MovimentoDolarCreate(
            tipo="ENVIO",
            data_movimento=date(2026, 5, 8),
            valor_brl=Decimal("5000.00"),
            valor_usd=Decimal("1000.00"),
            descricao="Envio inicial",
        ),
    )

    assert saldo_teorico_usd(session) == Decimal("1000.00")
    assert conciliacao(session)["saldo_livre"] == Decimal("5000.00")

    atualizado = atualizar_manual(
        session,
        movimento.id,
        MovimentoDolarUpdate(
            data_movimento=date(2026, 5, 9),
            valor_brl=Decimal("3000.00"),
            valor_usd=Decimal("600.00"),
            descricao="Envio ajustado",
        ),
    )
    lancamento = session.exec(
        select(Lancamento).where(
            Lancamento.ativo.is_(True),
            Lancamento.referencia_id == movimento.id,
        )
    ).first()

    assert atualizado.valor_brl == Decimal("3000.00")
    assert atualizado.cotacao_efetiva == Decimal("5.00")
    assert saldo_teorico_usd(session) == Decimal("600.00")
    assert conciliacao(session)["saldo_livre"] == Decimal("7000.00")
    assert lancamento is not None
    assert lancamento.tipo == TipoLancamento.INVESTIMENTO
    assert lancamento.valor == Decimal("3000.00")
    assert lancamento.observacao == "Envio ajustado"

    excluir_manual(session, movimento.id)
    session.refresh(lancamento)

    assert saldo_teorico_usd(session) == Decimal("0.00")
    assert conciliacao(session)["saldo_livre"] == Decimal("10000.00")
    assert lancamento.ativo is False
    assert listar_extrato(session) == []


def test_busca_cotacao_dolar_atual_salva_configuracao(session: Session, monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "USDBRL": {
                    "bid": "5.10",
                    "ask": "5.20",
                    "varBid": "0.02",
                    "pctChange": "0.4",
                    "create_date": "2026-05-21 10:00:00",
                }
            }

    monkeypatch.setattr("app.services.exterior_dolar_service.httpx.get", lambda *args, **kwargs: FakeResponse())

    cotacao = buscar_cotacao_dolar_atual(session)
    resumo = resumo_dolar(session)

    assert cotacao["cotacao_brl"] == Decimal("5.20")
    assert cotacao["compra_brl"] == Decimal("5.10")
    assert resumo["cotacao_brl"] == Decimal("5.20")
    assert resumo["cotacao_brl_fonte"] == "AwesomeAPI"


def _carregar_cache_tesouro_fake():
    from datetime import datetime, timezone

    _TESOURO_CACHE["itens"] = [
        {"tipo_tokens": _tokens_tesouro("Tesouro Selic"), "ano": "2029", "preco": Decimal("19091.07")},
        {"tipo_tokens": _tokens_tesouro("Tesouro IPCA+"), "ano": "2029", "preco": Decimal("3756.33")},
        {"tipo_tokens": _tokens_tesouro("Tesouro IPCA+ com Juros Semestrais"), "ano": "2035", "preco": Decimal("4212.77")},
        {"tipo_tokens": _tokens_tesouro("Tesouro Prefixado"), "ano": "2027", "preco": Decimal("925.98")},
    ]
    _TESOURO_CACHE["carregado_em"] = datetime.now(timezone.utc)


def test_buscar_preco_tesouro_casa_titulo_por_tipo_e_ano():
    _carregar_cache_tesouro_fake()
    try:
        selic = Ativo(ticker="TESOURO SELIC 2029", nome="Tesouro Selic 2029", tipo_ativo=TipoAtivo.RENDA_FIXA)
        ipca = Ativo(ticker="TESOURO IPCA+ 2029", nome="Tesouro IPCA+ 2029", tipo_ativo=TipoAtivo.RENDA_FIXA)
        semestrais = Ativo(ticker="TESOURO IPCA+ COM JUROS SEMESTRAIS 2035", nome="Tesouro IPCA+ com Juros Semestrais 2035", tipo_ativo=TipoAtivo.RENDA_FIXA)
        cdb = Ativo(ticker="CDB BANCO X 2027", nome="CDB Banco X 2027", tipo_ativo=TipoAtivo.RENDA_FIXA)
        sem_ano = Ativo(ticker="TESOURO SELIC", nome="Tesouro Selic", tipo_ativo=TipoAtivo.RENDA_FIXA)

        assert _buscar_preco_tesouro(selic) == Decimal("19091.07")
        # IPCA+ 2029 deve casar o titulo simples, nao o "com Juros Semestrais".
        assert _buscar_preco_tesouro(ipca) == Decimal("3756.33")
        assert _buscar_preco_tesouro(semestrais) == Decimal("4212.77")
        # Sem fonte publica e sem ano nao ha cotacao automatica.
        assert _buscar_preco_tesouro(cdb) is None
        assert _buscar_preco_tesouro(sem_ano) is None
    finally:
        _TESOURO_CACHE["itens"] = None
        _TESOURO_CACHE["carregado_em"] = None
