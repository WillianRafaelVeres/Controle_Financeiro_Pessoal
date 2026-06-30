from decimal import Decimal

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.base import NaturezaCategoria, TipoLancamento, month_bounds
from app.models.lancamento import Lancamento
from app.services.exterior_dolar_service import resumo_dolar
from app.services.orcamento_service import listar_itens_orcamento_mes, listar_nao_planejados_mes
from app.services.saldo_service import (
    calcular_compromisso_futuro_cartao,
    calcular_reservado_caixinhas,
    calcular_investimentos,
    calcular_reservado_cartao,
    calcular_reservado_contas_futuras,
    calcular_saldo_em_contas,
    filtro_excluir_categoria_cartao_generica,
    ids_categorias_cartao_genericas,
    soma_lancamentos_contas_gasto,
    soma_saldo_inicial_contas_gasto,
)


def _decimal(value: object) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))


def _sum(items: list[dict], field: str) -> Decimal:
    return sum((_decimal(item.get(field)) for item in items), Decimal("0.00"))


def _sum_lancamentos_mes(session: Session, ano: int, mes: int, tipo: TipoLancamento) -> Decimal:
    inicio, fim = month_bounds(ano, mes)
    filtros = [
        Lancamento.ativo.is_(True),
        Lancamento.transferencia_interna.is_(False),
        Lancamento.tipo == tipo,
        Lancamento.data_lancamento >= inicio,
        Lancamento.data_lancamento < fim,
    ]
    if tipo in {TipoLancamento.GASTO, TipoLancamento.INVESTIMENTO}:
        filtros.append(Lancamento.afeta_orcamento.is_(True))
    value = session.exec(select(func.sum(Lancamento.valor)).where(*filtros)).one()
    return _decimal(value)


def _sum_lancamentos_mes_tipos(session: Session, ano: int, mes: int, tipos: list[TipoLancamento]) -> Decimal:
    inicio, fim = month_bounds(ano, mes)
    filtros = [
        Lancamento.ativo.is_(True),
        Lancamento.transferencia_interna.is_(False),
        Lancamento.tipo.in_(tipos),
        Lancamento.afeta_orcamento.is_(True),
        Lancamento.data_lancamento >= inicio,
        Lancamento.data_lancamento < fim,
    ]
    filtro_categoria_generica = filtro_excluir_categoria_cartao_generica(session)
    if filtro_categoria_generica is not None and any(tipo in {TipoLancamento.GASTO, TipoLancamento.SEPARAR} for tipo in tipos):
        filtros.append(filtro_categoria_generica)
    value = session.exec(select(func.sum(Lancamento.valor)).where(*filtros)).one()
    return _decimal(value)


def _totais_vazios() -> dict[str, Decimal]:
    return {
        "receitas": Decimal("0.00"),
        "despesas": Decimal("0.00"),
        "investimentos": Decimal("0.00"),
    }


def _proximo_mes(ano: int, mes: int) -> tuple[int, int]:
    if mes == 12:
        return ano + 1, 1
    return ano, mes + 1


def totais_lancamentos_periodo(
    session: Session,
    ano_inicio: int,
    mes_inicio: int,
    ano_fim: int,
    mes_fim: int,
) -> dict[tuple[int, int], dict[str, Decimal]]:
    inicio, _ = month_bounds(ano_inicio, mes_inicio)
    _, fim = month_bounds(ano_fim, mes_fim)
    categorias_cartao = set(ids_categorias_cartao_genericas(session))
    totais_por_mes: dict[tuple[int, int], dict[str, Decimal]] = {}
    ano_atual, mes_atual = ano_inicio, mes_inicio
    while (ano_atual, mes_atual) <= (ano_fim, mes_fim):
        totais_por_mes[(ano_atual, mes_atual)] = _totais_vazios()
        ano_atual, mes_atual = _proximo_mes(ano_atual, mes_atual)

    lancamentos = session.exec(
        select(Lancamento).where(
            Lancamento.ativo.is_(True),
            Lancamento.transferencia_interna.is_(False),
            Lancamento.tipo.in_(
                [
                    TipoLancamento.RECEITA,
                    TipoLancamento.GASTO,
                    TipoLancamento.SEPARAR,
                    TipoLancamento.INVESTIMENTO,
                ]
            ),
            Lancamento.data_lancamento >= inicio,
            Lancamento.data_lancamento < fim,
        )
    ).all()

    for lancamento in lancamentos:
        chave_mes = (lancamento.data_lancamento.year, lancamento.data_lancamento.month)
        totais = totais_por_mes.get(chave_mes)
        if not totais:
            continue
        if lancamento.tipo == TipoLancamento.RECEITA:
            totais["receitas"] += lancamento.valor
        elif lancamento.tipo == TipoLancamento.INVESTIMENTO and lancamento.afeta_orcamento:
            totais["investimentos"] += lancamento.valor
        elif lancamento.tipo in {TipoLancamento.GASTO, TipoLancamento.SEPARAR} and lancamento.afeta_orcamento:
            if lancamento.cartao_id and lancamento.categoria_id in categorias_cartao:
                continue
            totais["despesas"] += lancamento.valor

    return totais_por_mes


def totais_lancamentos_mes(session: Session, ano: int, mes: int) -> dict[str, Decimal]:
    return totais_lancamentos_periodo(session, ano, mes, ano, mes)[(ano, mes)]


def receitas_mes(session: Session, ano: int, mes: int) -> Decimal:
    return _sum_lancamentos_mes(session, ano, mes, TipoLancamento.RECEITA)


def despesas_mes(session: Session, ano: int, mes: int) -> Decimal:
    return _sum_lancamentos_mes_tipos(session, ano, mes, [TipoLancamento.GASTO, TipoLancamento.SEPARAR])


def investimentos_mes(session: Session, ano: int, mes: int) -> Decimal:
    return _sum_lancamentos_mes(session, ano, mes, TipoLancamento.INVESTIMENTO)


def resumo_conciliacao(session: Session) -> dict:
    saldo_em_contas = calcular_saldo_em_contas(session)
    reservado_contas_futuras = calcular_reservado_contas_futuras(session)
    saldo_livre = soma_saldo_inicial_contas_gasto(session) + soma_lancamentos_contas_gasto(session) - reservado_contas_futuras
    reservado_cartao = calcular_reservado_cartao(session)
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


def resumo_planejamento(session: Session, ano: int, mes: int) -> dict:
    itens = listar_itens_orcamento_mes(session, ano, mes)
    itens_receitas = [item for item in itens if item.get("natureza") == NaturezaCategoria.RECEITA]
    itens_gastos = [item for item in itens if item.get("natureza") == NaturezaCategoria.GASTO]
    itens_investimentos = [item for item in itens if item.get("natureza") == NaturezaCategoria.INVESTIMENTO]
    nao_planejados = listar_nao_planejados_mes(session, ano, mes, itens_planejados=itens)
    receitas_nao_planejadas = [item for item in nao_planejados if item.get("natureza") == NaturezaCategoria.RECEITA]
    gastos_nao_planejados = [item for item in nao_planejados if item.get("natureza") == NaturezaCategoria.GASTO]
    investimentos_nao_planejados = [
        item for item in nao_planejados if item.get("natureza") == NaturezaCategoria.INVESTIMENTO
    ]

    receitas_planejadas = _sum(itens_receitas, "valor_orcado")
    receitas_executadas = _sum(itens_receitas, "gasto_real")
    gastos_planejados = _sum(itens_gastos, "valor_orcado")
    gastos_executados = _sum(itens_gastos, "gasto_real")
    investimentos_planejados = _sum(itens_investimentos, "valor_orcado")
    investimentos_executados = _sum(itens_investimentos, "gasto_real")
    planejado_total = gastos_planejados + investimentos_planejados
    executado_total = gastos_executados + investimentos_executados
    disponivel_total = planejado_total - executado_total
    percentual_usado = Decimal("0.00") if planejado_total == 0 else (executado_total / planejado_total) * Decimal("100")

    receitas_nao_planejadas_total = _sum(receitas_nao_planejadas, "valor_realizado")
    gastos_nao_planejados_total = _sum(gastos_nao_planejados, "valor_realizado")
    investimentos_nao_planejados_total = _sum(investimentos_nao_planejados, "valor_realizado")

    return {
        "ano": ano,
        "mes": mes,
        "planejado_total": planejado_total,
        "executado_total": executado_total,
        "disponivel_total": disponivel_total,
        "percentual_usado": percentual_usado,
        "gastos_planejados": gastos_planejados,
        "gastos_executados": gastos_executados,
        "investimentos_planejados": investimentos_planejados,
        "investimentos_executados": investimentos_executados,
        "receitas_planejadas": receitas_planejadas,
        "receitas_executadas": receitas_executadas,
        "itens_receitas": itens_receitas,
        "itens_gastos": itens_gastos,
        "itens_investimentos": itens_investimentos,
        "receitas_nao_planejadas": receitas_nao_planejadas,
        "gastos_nao_planejados": gastos_nao_planejados,
        "investimentos_nao_planejados": investimentos_nao_planejados,
        "receitas_nao_planejadas_total": receitas_nao_planejadas_total,
        "gastos_nao_planejados_total": gastos_nao_planejados_total,
        "investimentos_nao_planejados_total": investimentos_nao_planejados_total,
        "executado_total_com_nao_planejado": executado_total
        + gastos_nao_planejados_total
        + investimentos_nao_planejados_total,
        "receitas_executadas_total_com_nao_planejado": receitas_executadas + receitas_nao_planejadas_total,
    }


def resumo_painel(session: Session, ano: int, mes: int) -> dict:
    conciliacao = resumo_conciliacao(session)
    planejamento = resumo_planejamento(session, ano, mes)
    dolar = resumo_dolar(session)
    totais_mes = totais_lancamentos_mes(session, ano, mes)
    investimentos_realizados = totais_mes["investimentos"]
    patrimonio_investido = calcular_investimentos(session)
    despesas = totais_mes["despesas"]
    receitas = totais_mes["receitas"]
    return {
        "saldo_livre": conciliacao["saldo_livre"],
        "receitas_mes": receitas,
        "despesas_mes": despesas,
        "investimentos_mes": investimentos_realizados,
        "saldo_em_contas_informado": conciliacao["saldo_em_contas_informado"],
        "saldo_em_contas": conciliacao["saldo_em_contas_informado"],
        "saldo_explicado": conciliacao["saldo_explicado"],
        "saldo_final": conciliacao["saldo_final"],
        "reservado_cartao": conciliacao["reservado_cartao"],
        "reservado_contas_futuras": conciliacao["reservado_contas_futuras"],
        "reservado_caixinhas": conciliacao["reservado_caixinhas"],
        "compromissos_futuros_cartao": calcular_compromisso_futuro_cartao(session),
        "saldo_teorico_usd": dolar["saldo_teorico_usd"],
        "diferenca_conciliacao": conciliacao["diferenca_conciliacao"],
        "gastos_nao_planejados_mes": planejamento["gastos_nao_planejados_total"],
        "investimentos_nao_planejados_mes": planejamento["investimentos_nao_planejados_total"],
        "planejamento": {
            "receitas_planejadas": planejamento["receitas_planejadas"],
            "receitas_executadas": planejamento["receitas_executadas"],
            "gastos_planejados": planejamento["gastos_planejados"],
            "gastos_executados": planejamento["gastos_executados"],
            "investimentos_planejados": planejamento["investimentos_planejados"],
            "investimentos_executados": planejamento["investimentos_executados"],
        },
        "patrimonio_investido": patrimonio_investido,
        "investimentos": patrimonio_investido,
        "gasto_mes": despesas,
        "orcamento_restante": planejamento["gastos_planejados"] - planejamento["gastos_executados"],
    }
