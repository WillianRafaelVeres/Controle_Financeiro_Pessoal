from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.base import TipoLancamento, month_bounds
from app.models.lancamento import Lancamento
from app.models.metodo_pagamento import MetodoPagamento
from app.services.dashboard_service import graficos_dashboard
from app.services.financeiro_service import receitas_mes, despesas_mes, investimentos_mes
from app.services.orcamento_service import listar_orcamento_mes, listar_nao_planejados_mes
from app.services.investimento_service import listar_historico_desempenho


def _decimal(value: object) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))


def gastos_por_categoria(session: Session, ano: int, mes: int) -> list[dict]:
    return graficos_dashboard(session, ano, mes)["gastos_por_categoria"]


def orcado_vs_realizado(session: Session, ano: int, mes: int) -> list[dict]:
    return listar_orcamento_mes(session, ano, mes)


def gastos_por_metodo(session: Session, ano: int, mes: int) -> list[dict]:
    """Retorna gastos agrupados por método de pagamento para um período."""
    inicio, fim = month_bounds(ano, mes)
    
    # Buscar todos os métodos ativos
    metodos = session.exec(select(MetodoPagamento).where(MetodoPagamento.ativo.is_(True))).all()
    
    # Calcular gasto total do período
    valor_total = session.exec(
        select(func.sum(Lancamento.valor)).where(
            Lancamento.ativo.is_(True),
            Lancamento.tipo.in_([TipoLancamento.GASTO, TipoLancamento.SEPARAR]),
            Lancamento.afeta_orcamento.is_(True),
            Lancamento.transferencia_interna.is_(False),
            Lancamento.data_lancamento >= inicio,
            Lancamento.data_lancamento < fim,
        )
    ).one()
    total = _decimal(valor_total)
    
    result = []
    for metodo in metodos:
        valor = session.exec(
            select(func.sum(Lancamento.valor)).where(
                Lancamento.ativo.is_(True),
                Lancamento.tipo.in_([TipoLancamento.GASTO, TipoLancamento.SEPARAR]),
                Lancamento.afeta_orcamento.is_(True),
                Lancamento.transferencia_interna.is_(False),
                Lancamento.metodo_pagamento_id == metodo.id,
                Lancamento.data_lancamento >= inicio,
                Lancamento.data_lancamento < fim,
            )
        ).one()
        valor_decimal = _decimal(valor)
        
        if valor_decimal > 0:
            percentual = (valor_decimal / total * 100) if total > 0 else Decimal("0.00")
            result.append({
                "metodo": metodo.nome,
                "valor": valor_decimal,
                "percentual": percentual,
            })
    
    # Ordenar por valor decrescente
    return sorted(result, key=lambda x: x["valor"], reverse=True)


def evolucao_mensal(session: Session, ano_inicio: int, mes_inicio: int, ano_fim: int, mes_fim: int) -> list[dict]:
    """Retorna evolução mensal de receitas, gastos e investimentos para um período."""
    from datetime import datetime, timedelta
    
    # Gerar lista de todos os meses no período
    meses = []
    ano_atual = ano_inicio
    mes_atual = mes_inicio
    ano_final = ano_fim
    mes_final = mes_fim
    
    while (ano_atual, mes_atual) <= (ano_final, mes_final):
        meses.append((ano_atual, mes_atual))
        mes_atual += 1
        if mes_atual > 12:
            mes_atual = 1
            ano_atual += 1
    
    result = []
    for ano, mes in meses:
        receita = receitas_mes(session, ano, mes)
        gasto = despesas_mes(session, ano, mes)
        investimento = investimentos_mes(session, ano, mes)
        
        result.append({
            "ano": ano,
            "mes": mes,
            "receita": receita,
            "gasto": gasto,
            "investimento": investimento,
            "saldo": receita - gasto - investimento,
        })
    
    return result


def projetar_patrimonio(session: Session, aporte_mensal: Decimal, taxa_anual: Decimal, meses: int) -> list[dict]:
    """Projeta patrimônio futuro baseado em aporte mensal e taxa de retorno anual."""
    
    # Buscar patrimônio atual
    historico = listar_historico_desempenho(session)
    patrimonio_atual = _decimal(historico[-1]["patrimonio_atual_brl"]) if historico else Decimal("0.00")
    
    # Converter taxa anual para mensal
    taxa_mensal = (1 + taxa_anual / 100) ** (1 / 12) - 1
    
    result = []
    valor_projetado = patrimonio_atual
    aporte_acumulado = Decimal("0.00")
    
    for mes_num in range(1, meses + 1):
        # Aplicar retorno mensal
        valor_projetado = valor_projetado * (1 + taxa_mensal)
        
        # Adicionar aporte
        valor_projetado += aporte_mensal
        aporte_acumulado += aporte_mensal
        
        resultado_acumulado = valor_projetado - (patrimonio_atual + aporte_acumulado)
        
        result.append({
            "mes": mes_num,
            "valor_projetado": valor_projetado,
            "aporte_acumulado": aporte_acumulado,
            "resultado_acumulado": resultado_acumulado,
        })
    
    return result


def gerar_insights(session: Session, ano: int, mes: int) -> list[dict]:
    """Gera insights e alertas baseados em dados financeiros do período."""
    insights = []
    
    # Dados do mês
    receita = receitas_mes(session, ano, mes)
    gasto = despesas_mes(session, ano, mes)
    investimento = investimentos_mes(session, ano, mes)
    
    # Calcular taxa de economia
    if receita > 0:
        taxa_economia = ((receita - gasto) / receita * 100)
    else:
        taxa_economia = Decimal("0.00")
    
    # Alertas por prioridade
    
    # CRÍTICO: Overspending (gasto > receita)
    if gasto > receita:
        insights.append({
            "tipo": "CRITICO",
            "prioridade": 1,
            "mensagem": f"Você gastou R$ {gasto:.2f}, acima da receita de R$ {receita:.2f}. Gastos ultrapassaram receita em R$ {(gasto - receita):.2f}.",
            "acao": "relatorios",
        })
    
    # CRÍTICO: Taxa de economia muito baixa
    if receita > 0 and taxa_economia < 5:
        insights.append({
            "tipo": "CRITICO",
            "prioridade": 2,
            "mensagem": f"Taxa de economia crítica: apenas {taxa_economia:.1f}%. Você consegue guardar menos de 5% da receita.",
            "acao": "relatorios",
        })
    
    # ATENÇÃO: Taxa de economia abaixo da meta (20%)
    if 5 <= taxa_economia < 20:
        insights.append({
            "tipo": "ATENCAO",
            "prioridade": 3,
            "mensagem": f"Economia baixa: {taxa_economia:.1f}%. Meta é 20%. Ajuste seus gastos para economizar mais.",
            "acao": "relatorios",
        })
    
    # BOM: Taxa de economia acima da meta
    if taxa_economia >= 20:
        insights.append({
            "tipo": "BOM",
            "prioridade": 4,
            "mensagem": f"Parabéns! Taxa de economia de {taxa_economia:.1f}%, acima da meta de 20%.",
            "acao": "relatorios",
        })
    
    # Gastos não planejados
    nao_planejados = listar_nao_planejados_mes(session, ano, mes)
    soma_nao_planejados = _decimal(sum([item.get("valor", 0) for item in nao_planejados]))
    
    if soma_nao_planejados > 0:
        percentual_nao_planejado = (soma_nao_planejados / gasto * 100) if gasto > 0 else Decimal("0.00")
        if percentual_nao_planejado > 10:
            insights.append({
                "tipo": "ATENCAO",
                "prioridade": 5,
                "mensagem": f"R$ {soma_nao_planejados:.2f} ({percentual_nao_planejado:.0f}%) em gastos sem planejamento.",
                "acao": "orcamento",
            })
    
    # Limitar a top 3 insights mais importantes
    insights.sort(key=lambda x: x["prioridade"])
    return insights[:3]
