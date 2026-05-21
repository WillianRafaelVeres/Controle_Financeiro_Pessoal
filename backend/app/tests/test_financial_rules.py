from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app import models  # noqa: F401
from app.models.base import (
    EscopoOrcamento,
    NaturezaCategoria,
    StatusContaFutura,
    TipoAtivo,
    TipoItemOrcamento,
    TipoLancamento,
    TipoMetodo,
)
from app.models.cartao import Cartao
from app.models.categoria import Categoria
from app.models.compromisso_cartao import CompromissoCartao
from app.models.conta import Conta
from app.models.investimento import Ativo, MovimentoInvestimento
from app.models.metodo_pagamento import MetodoPagamento
from app.models.orcamento import OrcamentoItem, OrcamentoMensal
from app.models.subcategoria import Subcategoria
from app.schemas.cartao_schema import PagarFatura
from app.schemas.compromisso_cartao_schema import SepararCompromisso
from app.schemas.investimento_schema import MovimentoInvestimentoCreate
from app.schemas.lancamento_schema import CartaoLancamentoInput, LancamentoCreate, LancamentoUpdate
from app.schemas.orcamento_schema import OrcamentoAlterar, OrcamentoCreate, OrcamentoItemCreate
from app.schemas.conta_schema import ContaCreate, ContaSaldoCreate
from app.schemas.conta_futura_schema import ContaFuturaCreate, PagarContaFutura
from app.schemas.exterior_dolar_schema import MovimentoDolarCreate
from app.api.routes.contas import criar as criar_conta_route, atualizar_saldo as atualizar_saldo_conta_route
from app.services.cartao_service import pagar_fatura, separar_compromisso
from app.services.conta_futura_service import criar_conta_futura, pagar_conta_futura
from app.services.investimento_service import ativos_para_dividendos, comprar, listar_posicoes, registrar_cotacao, vender
from app.services.lancamento_service import atualizar_lancamento, criar_lancamento
from app.services.financeiro_service import resumo_painel, resumo_planejamento
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
    calcular_reservado_contas_futuras,
    calcular_saldo_em_contas,
    calcular_saldo_livre,
    conciliacao,
)
from app.services.exterior_dolar_service import listar_extrato, registrar_manual, saldo_teorico_usd


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


def test_compra_sem_ticker_agrupa_por_tipo_e_corretora(session: Session):
    primeira = comprar(
        session,
        MovimentoInvestimentoCreate(
            tipo_ativo=TipoAtivo.PREVIDENCIA,
            corretora="XP",
            quantidade=Decimal("1.00"),
            preco_unitario=Decimal("500.00"),
        ),
    )
    segunda = comprar(
        session,
        MovimentoInvestimentoCreate(
            tipo_ativo=TipoAtivo.PREVIDENCIA,
            corretora="XP",
            quantidade=Decimal("2.00"),
            preco_unitario=Decimal("250.00"),
        ),
    )

    ativo = session.get(Ativo, primeira.ativo_id)
    assert ativo is not None
    assert segunda.ativo_id == ativo.id
    assert ativo.ticker == "PREVIDENCIA_XP"
    assert ativo.moeda == "BRL"
    assert ativo.corretora == "XP"

    posicoes = listar_posicoes(session)
    assert len(posicoes) == 1
    assert posicoes[0]["quantidade_atual"] == Decimal("3.00")
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
    conta = Conta(nome="Conta", saldo_inicial=Decimal("2000.00"), saldo_atual_informado=Decimal("2000.00"))
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
    assert saldo_teorico_usd(session) == Decimal("1000.00")
    painel = resumo_painel(session, 2026, 5)
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
    assert saldo_teorico_usd(session) == Decimal("500.00")
