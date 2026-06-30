from decimal import Decimal

from sqlmodel import Session, select

from app.models.base import TipoLancamento, TipoMetodo, month_bounds
from app.models.cartao import Cartao
from app.models.lancamento import Lancamento
from app.models.metodo_pagamento import MetodoPagamento
from app.services.dashboard_service import graficos_dashboard
from app.services.financeiro_service import totais_lancamentos_mes, totais_lancamentos_periodo
from app.services.investimento_service import listar_historico_desempenho
from app.services.orcamento_service import listar_nao_planejados_mes, listar_orcamento_mes


def _decimal(value: object) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))


def gastos_por_categoria(session: Session, ano: int, mes: int) -> list[dict]:
    return graficos_dashboard(session, ano, mes)["gastos_por_categoria"]


def orcado_vs_realizado(session: Session, ano: int, mes: int) -> list[dict]:
    return listar_orcamento_mes(session, ano, mes)


def gastos_por_metodo(session: Session, ano: int, mes: int) -> list[dict]:
    inicio, fim = month_bounds(ano, mes)
    filtros_base = [
        Lancamento.ativo.is_(True),
        Lancamento.tipo.in_([TipoLancamento.GASTO, TipoLancamento.SEPARAR]),
        Lancamento.afeta_orcamento.is_(True),
        Lancamento.transferencia_interna.is_(False),
        Lancamento.data_lancamento >= inicio,
        Lancamento.data_lancamento < fim,
    ]

    lancamentos = session.exec(select(Lancamento).where(*filtros_base)).all()
    total = sum((lancamento.valor for lancamento in lancamentos), Decimal("0.00"))
    totais_metodos: dict[str, Decimal] = {}
    totais_cartoes: dict[str, Decimal] = {}
    for lancamento in lancamentos:
        if lancamento.cartao_id:
            totais_cartoes[lancamento.cartao_id] = totais_cartoes.get(lancamento.cartao_id, Decimal("0.00")) + lancamento.valor
        elif lancamento.metodo_pagamento_id:
            totais_metodos[lancamento.metodo_pagamento_id] = (
                totais_metodos.get(lancamento.metodo_pagamento_id, Decimal("0.00")) + lancamento.valor
            )

    result: list[dict] = []

    metodos = session.exec(select(MetodoPagamento).where(MetodoPagamento.ativo.is_(True)).order_by(MetodoPagamento.nome)).all()
    for metodo in metodos:
        if metodo.tipo_metodo == TipoMetodo.CARTAO_CREDITO:
            continue
        valor = totais_metodos.get(metodo.id, Decimal("0.00"))
        if valor > 0:
            result.append(
                {
                    "metodo": metodo.nome,
                    "tipo": "METODO",
                    "valor": valor,
                    "percentual": (valor / total * 100) if total > 0 else Decimal("0.00"),
                }
            )

    cartoes = session.exec(select(Cartao).where(Cartao.ativo.is_(True)).order_by(Cartao.nome)).all()
    for cartao in cartoes:
        valor = totais_cartoes.get(cartao.id, Decimal("0.00"))
        if valor > 0:
            result.append(
                {
                    "metodo": cartao.nome,
                    "tipo": "CARTAO",
                    "valor": valor,
                    "percentual": (valor / total * 100) if total > 0 else Decimal("0.00"),
                }
            )

    return sorted(result, key=lambda item: item["valor"], reverse=True)


def evolucao_mensal(session: Session, ano_inicio: int, mes_inicio: int, ano_fim: int, mes_fim: int) -> list[dict]:
    meses = []
    ano_atual = ano_inicio
    mes_atual = mes_inicio

    while (ano_atual, mes_atual) <= (ano_fim, mes_fim):
        meses.append((ano_atual, mes_atual))
        mes_atual += 1
        if mes_atual > 12:
            mes_atual = 1
            ano_atual += 1

    totais_por_mes = totais_lancamentos_periodo(session, ano_inicio, mes_inicio, ano_fim, mes_fim)
    result = []
    for ano, mes in meses:
        totais = totais_por_mes[(ano, mes)]
        receita = totais["receitas"]
        gasto = totais["despesas"]
        investimento = totais["investimentos"]
        result.append(
            {
                "ano": ano,
                "mes": mes,
                "receita": receita,
                "gasto": gasto,
                "investimento": investimento,
                "saldo": receita - gasto - investimento,
            }
        )

    return result


def projetar_patrimonio(session: Session, aporte_mensal: Decimal, taxa_anual: Decimal, meses: int) -> list[dict]:
    historico = listar_historico_desempenho(session)
    patrimonio_atual = _decimal(historico[-1]["patrimonio_atual_brl"]) if historico else Decimal("0.00")
    taxa_mensal = (1 + taxa_anual / 100) ** (1 / 12) - 1

    result = []
    valor_projetado = patrimonio_atual
    aporte_acumulado = Decimal("0.00")

    for mes_num in range(1, meses + 1):
        valor_projetado = valor_projetado * (1 + taxa_mensal)
        valor_projetado += aporte_mensal
        aporte_acumulado += aporte_mensal
        resultado_acumulado = valor_projetado - (patrimonio_atual + aporte_acumulado)
        result.append(
            {
                "mes": mes_num,
                "valor_projetado": valor_projetado,
                "aporte_acumulado": aporte_acumulado,
                "resultado_acumulado": resultado_acumulado,
            }
        )

    return result


def gerar_insights(session: Session, ano: int, mes: int) -> list[dict]:
    insights = []
    totais = totais_lancamentos_mes(session, ano, mes)
    receita = totais["receitas"]
    gasto = totais["despesas"]

    taxa_economia = ((receita - gasto) / receita * 100) if receita > 0 else Decimal("0.00")

    if gasto > receita:
        insights.append(
            {
                "tipo": "CRITICO",
                "prioridade": 1,
                "mensagem": f"Voce gastou R$ {gasto:.2f}, acima da receita de R$ {receita:.2f}. Gastos ultrapassaram receita em R$ {(gasto - receita):.2f}.",
                "acao": "relatorios",
            }
        )

    if receita > 0 and taxa_economia < 5:
        insights.append(
            {
                "tipo": "CRITICO",
                "prioridade": 2,
                "mensagem": f"Taxa de economia critica: apenas {taxa_economia:.1f}%. Voce consegue guardar menos de 5% da receita.",
                "acao": "relatorios",
            }
        )

    if 5 <= taxa_economia < 20:
        insights.append(
            {
                "tipo": "ATENCAO",
                "prioridade": 3,
                "mensagem": f"Economia baixa: {taxa_economia:.1f}%. Meta e 20%. Ajuste seus gastos para economizar mais.",
                "acao": "relatorios",
            }
        )

    if taxa_economia >= 20:
        insights.append(
            {
                "tipo": "BOM",
                "prioridade": 4,
                "mensagem": f"Taxa de economia de {taxa_economia:.1f}%, acima da meta de 20%.",
                "acao": "relatorios",
            }
        )

    nao_planejados = listar_nao_planejados_mes(session, ano, mes)
    soma_nao_planejados = _decimal(sum([item.get("valor_realizado", 0) for item in nao_planejados]))

    if soma_nao_planejados > 0:
        percentual_nao_planejado = (soma_nao_planejados / gasto * 100) if gasto > 0 else Decimal("0.00")
        if percentual_nao_planejado > 10:
            insights.append(
                {
                    "tipo": "ATENCAO",
                    "prioridade": 5,
                    "mensagem": f"R$ {soma_nao_planejados:.2f} ({percentual_nao_planejado:.0f}%) em gastos sem planejamento.",
                    "acao": "orcamento",
                }
            )

    insights.sort(key=lambda item: item["prioridade"])
    return insights[:3]
