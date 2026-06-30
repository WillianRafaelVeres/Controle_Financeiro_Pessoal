from datetime import date
from decimal import Decimal
import unicodedata

from sqlalchemy import and_, func, not_, or_
from sqlmodel import Session, select

from app.models.base import NaturezaCategoria, StatusContaFutura, TipoConta, TipoLancamento, TipoMovimentoInvestimento, month_bounds
from app.models.cartao import Cartao
from app.models.categoria import Categoria
from app.models.compromisso_cartao import CompromissoCartao
from app.models.conta import Conta
from app.models.conta_futura import ContaFutura
from app.models.investimento import MovimentoInvestimento
from app.models.lancamento import Lancamento
from app.models.orcamento import OrcamentoItem, OrcamentoMensal
from app.models.pagamento_fatura import PagamentoFatura


def _decimal(value: object) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))


TIPOS_CONTA_FORA_CONCILIACAO = (TipoConta.CORRETORA, TipoConta.CONTA_EXTERIOR, TipoConta.INVESTIMENTO)
NOMES_CATEGORIA_CARTAO_GENERICA = {"compras no cartao", "compra no cartao", "cartao", "cartao de credito"}


def _filtros_contas_saldo_livre():
    return (
        Conta.ativa.is_(True),
        Conta.conta_gasto.is_(True),
        ~Conta.tipo_conta.in_(TIPOS_CONTA_FORA_CONCILIACAO),
    )


def soma_saldo_inicial_contas_gasto(session: Session) -> Decimal:
    value = session.exec(
        select(func.sum(Conta.saldo_inicial)).where(*_filtros_contas_saldo_livre())
    ).one()
    return _decimal(value)


def _filtro_envio_dolar_lancamento():
    return or_(
        Lancamento.origem_sistema == "DOLAR_ENVIO",
        and_(
            Lancamento.origem_sistema.is_(None),
            Lancamento.categoria_id.is_(None),
            Lancamento.subcategoria_id.is_(None),
            Lancamento.metodo_pagamento_id.is_(None),
            Lancamento.cartao_id.is_(None),
            Lancamento.caixinha_id.is_(None),
            or_(
                Lancamento.observacao.ilike("%dolar%"),
                Lancamento.observacao.ilike("%exterior%"),
            ),
        ),
    )


def _normalizar_nome(value: str | None) -> str:
    if not value:
        return ""
    sem_acento = unicodedata.normalize("NFKD", value)
    return "".join(char for char in sem_acento if not unicodedata.combining(char)).strip().lower()


def ids_categorias_cartao_genericas(session: Session) -> list[str]:
    categorias = session.exec(select(Categoria).where(Categoria.natureza == NaturezaCategoria.GASTO)).all()
    return [categoria.id for categoria in categorias if _normalizar_nome(categoria.nome) in NOMES_CATEGORIA_CARTAO_GENERICA]


def filtro_excluir_categoria_cartao_generica(session: Session):
    categoria_ids = ids_categorias_cartao_genericas(session)
    if not categoria_ids:
        return None
    return not_(
        and_(
            Lancamento.cartao_id.is_not(None),
            Lancamento.categoria_id.in_(categoria_ids),
        )
    )


def soma_lancamentos_contas_gasto(
    session: Session,
    incluir_investimentos: bool = True,
    incluir_envios_dolar: bool = False,
) -> Decimal:
    tipos_saida = [TipoLancamento.GASTO, TipoLancamento.SEPARAR]
    filtros_saida_tipo = [Lancamento.tipo.in_(tipos_saida)]
    if incluir_investimentos:
        filtros_saida_tipo.append(Lancamento.tipo == TipoLancamento.INVESTIMENTO)
    elif incluir_envios_dolar:
        filtros_saida_tipo.append(
            and_(
                Lancamento.tipo == TipoLancamento.INVESTIMENTO,
                _filtro_envio_dolar_lancamento(),
            )
        )
    receitas = session.exec(
        select(func.sum(Lancamento.valor)).where(
            Lancamento.ativo.is_(True),
            Lancamento.afeta_saldo_livre.is_(True),
            Lancamento.transferencia_interna.is_(False),
            Lancamento.tipo.in_([TipoLancamento.RECEITA, TipoLancamento.DIVIDENDO, TipoLancamento.AJUSTE]),
        )
    ).one()
    saidas = session.exec(
        select(func.sum(Lancamento.valor)).where(
            Lancamento.ativo.is_(True),
            Lancamento.afeta_saldo_livre.is_(True),
            Lancamento.transferencia_interna.is_(False),
            or_(*filtros_saida_tipo),
        )
    ).one()
    return _decimal(receitas) - _decimal(saidas)


def soma_movimentos_saldo_real(session: Session) -> Decimal:
    receitas = session.exec(
        select(func.sum(Lancamento.valor)).where(
            Lancamento.ativo.is_(True),
            Lancamento.afeta_saldo_livre.is_(True),
            Lancamento.transferencia_interna.is_(False),
            Lancamento.tipo.in_([TipoLancamento.RECEITA, TipoLancamento.DIVIDENDO, TipoLancamento.AJUSTE]),
        )
    ).one()
    saidas_sem_cartao = session.exec(
        select(func.sum(Lancamento.valor)).where(
            Lancamento.ativo.is_(True),
            Lancamento.afeta_saldo_livre.is_(True),
            Lancamento.transferencia_interna.is_(False),
            Lancamento.cartao_id.is_(None),
            Lancamento.tipo.in_([TipoLancamento.GASTO, TipoLancamento.INVESTIMENTO]),
        )
    ).one()
    pagamentos_fatura = session.exec(select(func.sum(PagamentoFatura.valor_pago))).one()
    return _decimal(receitas) - _decimal(saidas_sem_cartao) - _decimal(pagamentos_fatura)


def calcular_saldo_livre(session: Session) -> Decimal:
    return (
        soma_saldo_inicial_contas_gasto(session)
        + soma_lancamentos_contas_gasto(session)
        - calcular_reservado_contas_futuras(session)
    )


def calcular_saldo_livre_conciliacao(session: Session) -> Decimal:
    return (
        soma_saldo_inicial_contas_gasto(session)
        + soma_lancamentos_contas_gasto(session)
        - calcular_reservado_contas_futuras(session)
    )


def calcular_saldo_em_contas(session: Session) -> Decimal:
    value = session.exec(
        select(func.sum(Conta.saldo_atual_informado)).where(
            *_filtros_contas_saldo_livre(),
            Conta.entra_no_saldo_em_contas.is_(True),
        )
    ).one()
    return _decimal(value)


def calcular_reservado_cartao(session: Session, cartao_id: str | None = None) -> Decimal:
    filtros = [
        Lancamento.ativo.is_(True),
        Lancamento.tipo == TipoLancamento.GASTO,
        Lancamento.cartao_id.is_not(None),
        or_(Lancamento.afeta_saldo_livre.is_(True), Lancamento.caixinha_id.is_not(None)),
    ]
    filtros_pagamento = []
    if cartao_id:
        filtros.append(Lancamento.cartao_id == cartao_id)
        filtros_pagamento.append(PagamentoFatura.cartao_id == cartao_id)

    separacoes = session.exec(select(func.sum(Lancamento.valor)).where(*filtros)).one()
    pagamentos = session.exec(select(func.sum(PagamentoFatura.valor_pago)).where(*filtros_pagamento)).one()
    reservado = _decimal(separacoes) - _decimal(pagamentos)
    return max(reservado, Decimal("0.00"))


def calcular_reservado_contas_futuras(session: Session) -> Decimal:
    value = session.exec(
        select(func.sum(ContaFutura.valor)).where(
            ContaFutura.ativo.is_(True),
            ContaFutura.status == StatusContaFutura.ABERTA,
        )
    ).one()
    return _decimal(value)


def calcular_reservado_caixinhas(session: Session) -> Decimal:
    separados = session.exec(
        select(func.sum(Lancamento.valor)).where(
            Lancamento.ativo.is_(True),
            Lancamento.caixinha_id.is_not(None),
            Lancamento.tipo == TipoLancamento.SEPARAR,
        )
    ).one()
    usados = session.exec(
        select(func.sum(Lancamento.valor)).where(
            Lancamento.ativo.is_(True),
            Lancamento.caixinha_id.is_not(None),
            Lancamento.tipo == TipoLancamento.GASTO,
            Lancamento.afeta_saldo_livre.is_(False),
            Lancamento.afeta_orcamento.is_(False),
        )
    ).one()
    return max(_decimal(separados) - _decimal(usados), Decimal("0.00"))


def calcular_compromisso_futuro_cartao(session: Session, cartao_id: str | None = None) -> Decimal:
    filtros = [CompromissoCartao.ativo.is_(True), CompromissoCartao.valor_em_aberto > 0]
    if cartao_id:
        filtros.append(CompromissoCartao.cartao_id == cartao_id)
    value = session.exec(select(func.sum(CompromissoCartao.valor_em_aberto)).where(*filtros)).one()
    return _decimal(value)


def calcular_gasto_real_mes(session: Session, ano: int, mes: int, categoria_id: str | None = None) -> Decimal:
    inicio, fim = month_bounds(ano, mes)
    filtros = [
        Lancamento.ativo.is_(True),
        Lancamento.tipo.in_([TipoLancamento.GASTO, TipoLancamento.SEPARAR]),
        Lancamento.afeta_orcamento.is_(True),
        Lancamento.transferencia_interna.is_(False),
        Lancamento.data_lancamento >= inicio,
        Lancamento.data_lancamento < fim,
    ]
    filtro_categoria_generica = filtro_excluir_categoria_cartao_generica(session)
    if filtro_categoria_generica is not None:
        filtros.append(filtro_categoria_generica)
    if categoria_id:
        filtros.append(Lancamento.categoria_id == categoria_id)
    value = session.exec(select(func.sum(Lancamento.valor)).where(*filtros)).one()
    return _decimal(value)


def calcular_orcamento_total_mes(session: Session, ano: int, mes: int) -> Decimal:
    from app.services.orcamento_service import materializar_itens_orcamento_mes

    materializar_itens_orcamento_mes(session, ano, mes)
    value_itens = session.exec(
        select(func.sum(OrcamentoItem.valor_orcado)).where(
            OrcamentoItem.ano == ano,
            OrcamentoItem.mes == mes,
            OrcamentoItem.ativo.is_(True),
            OrcamentoItem.natureza == NaturezaCategoria.GASTO,
        )
    ).one()
    total_itens = _decimal(value_itens)
    if total_itens > 0:
        return total_itens

    value = session.exec(
        select(func.sum(OrcamentoMensal.valor_orcado)).where(
            OrcamentoMensal.ano == ano,
            OrcamentoMensal.mes == mes,
        )
    ).one()
    return _decimal(value)


def calcular_investimentos(session: Session) -> Decimal:
    compras = session.exec(
        select(func.sum(MovimentoInvestimento.valor_total)).where(
            MovimentoInvestimento.tipo_movimento.in_(
                [
                    TipoMovimentoInvestimento.COMPRA,
                    TipoMovimentoInvestimento.APORTE,
                    TipoMovimentoInvestimento.AJUSTE,
                ]
            )
        )
    ).one()
    vendas = session.exec(
        select(func.sum(MovimentoInvestimento.valor_total)).where(
            MovimentoInvestimento.tipo_movimento.in_(
                [TipoMovimentoInvestimento.VENDA, TipoMovimentoInvestimento.RESGATE]
            )
        )
    ).one()
    return _decimal(compras) - _decimal(vendas)


def calcular_limite_utilizado_total(session: Session, cartao_id: str) -> Decimal:
    return calcular_reservado_cartao(session, cartao_id) + calcular_compromisso_futuro_cartao(session, cartao_id)


def resumo_cartoes(session: Session) -> list[dict]:
    cartoes = session.exec(select(Cartao).where(Cartao.ativo.is_(True)).order_by(Cartao.nome)).all()
    cartao_ids = [cartao.id for cartao in cartoes]
    separacoes_por_cartao: dict[str, Decimal] = {}
    pagamentos_por_cartao: dict[str, Decimal] = {}
    futuro_por_cartao: dict[str, Decimal] = {}

    if cartao_ids:
        separacoes = session.exec(
            select(Lancamento.cartao_id, func.sum(Lancamento.valor))
            .where(
                Lancamento.ativo.is_(True),
                Lancamento.tipo == TipoLancamento.GASTO,
                Lancamento.cartao_id.in_(cartao_ids),
                or_(Lancamento.afeta_saldo_livre.is_(True), Lancamento.caixinha_id.is_not(None)),
            )
            .group_by(Lancamento.cartao_id)
        ).all()
        separacoes_por_cartao = {cartao_id: _decimal(valor) for cartao_id, valor in separacoes if cartao_id}

        pagamentos = session.exec(
            select(PagamentoFatura.cartao_id, func.sum(PagamentoFatura.valor_pago))
            .where(PagamentoFatura.cartao_id.in_(cartao_ids))
            .group_by(PagamentoFatura.cartao_id)
        ).all()
        pagamentos_por_cartao = {cartao_id: _decimal(valor) for cartao_id, valor in pagamentos if cartao_id}

        futuros = session.exec(
            select(CompromissoCartao.cartao_id, func.sum(CompromissoCartao.valor_em_aberto))
            .where(
                CompromissoCartao.ativo.is_(True),
                CompromissoCartao.valor_em_aberto > 0,
                CompromissoCartao.cartao_id.in_(cartao_ids),
            )
            .group_by(CompromissoCartao.cartao_id)
        ).all()
        futuro_por_cartao = {cartao_id: _decimal(valor) for cartao_id, valor in futuros if cartao_id}

    result = []
    for cartao in cartoes:
        reservado = max(
            separacoes_por_cartao.get(cartao.id, Decimal("0.00"))
            - pagamentos_por_cartao.get(cartao.id, Decimal("0.00")),
            Decimal("0.00"),
        )
        futuro = futuro_por_cartao.get(cartao.id, Decimal("0.00"))
        limite_sistema = reservado + futuro
        result.append(
            {
                "id": cartao.id,
                "nome": cartao.nome,
                "instituicao": cartao.instituicao,
                "limite_total": cartao.limite_total,
                "limite_utilizado_informado": cartao.limite_utilizado_informado,
                "fatura_atual_informada": cartao.fatura_atual_informada,
                "reservado_para_pagar": reservado,
                "compromisso_futuro": futuro,
                "limite_utilizado_total": limite_sistema,
                "diferenca_limite": cartao.limite_utilizado_informado - limite_sistema,
                "cor_visual": cartao.cor_visual,
            }
        )
    return result


def conciliacao(session: Session) -> dict:
    saldo_em_contas = calcular_saldo_em_contas(session)
    saldo_livre = calcular_saldo_livre_conciliacao(session)
    reservado_cartao = calcular_reservado_cartao(session)
    reservado_contas_futuras = calcular_reservado_contas_futuras(session)
    reservado_caixinhas = calcular_reservado_caixinhas(session)
    saldo_explicado = saldo_livre + reservado_cartao + reservado_contas_futuras + reservado_caixinhas
    diferenca = saldo_em_contas - saldo_explicado
    return {
        "saldo_em_contas": saldo_em_contas,
        "saldo_em_contas_informado": saldo_em_contas,
        "saldo_livre": saldo_livre,
        "reservado_cartao": reservado_cartao,
        "reservado_contas_futuras": reservado_contas_futuras,
        "reservado_caixinhas": reservado_caixinhas,
        "reservado_metas": Decimal("0.00"),
        "saldo_explicado": saldo_explicado,
        "saldo_final": saldo_explicado,
        "diferenca_nao_explicada": diferenca,
        "diferenca_conciliacao": diferenca,
        "status": "Tudo conciliado." if abs(diferenca) < Decimal("0.01") else "Existe valor sem explicacao.",
        "descricao": "Saldo em contas e informado manualmente na tela Contas. O sistema compara esse valor com o saldo livre e os valores reservados.",
    }
