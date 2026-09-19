from decimal import Decimal

from sqlmodel import Session, select

from app.models.base import NaturezaCategoria, TipoLancamento, TipoMetodo, month_bounds
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


def _meses_intervalo(ano_inicio: int, mes_inicio: int, ano_fim: int, mes_fim: int) -> list[tuple[int, int]]:
    if not 1 <= mes_inicio <= 12 or not 1 <= mes_fim <= 12:
        raise ValueError("Mes deve estar entre 1 e 12.")
    if (ano_inicio, mes_inicio) > (ano_fim, mes_fim):
        raise ValueError("O inicio do periodo deve ser anterior ao fim.")
    meses: list[tuple[int, int]] = []
    ano, mes = ano_inicio, mes_inicio
    while (ano, mes) <= (ano_fim, mes_fim):
        meses.append((ano, mes))
        ano, mes = (ano + 1, 1) if mes == 12 else (ano, mes + 1)
    return meses


def _deslocar_mes(ano: int, mes: int, quantidade: int) -> tuple[int, int]:
    indice = ano * 12 + mes - 1 + quantidade
    return indice // 12, indice % 12 + 1


def _variacao_percentual(atual: Decimal, anterior: Decimal) -> float | None:
    if anterior == 0:
        return None
    return round(float((atual - anterior) / abs(anterior) * Decimal("100")), 2)


def analise_financeira(
    session: Session,
    ano_inicio: int,
    mes_inicio: int,
    ano_fim: int,
    mes_fim: int,
) -> dict:
    """Diagnostico financeiro do periodo sem misturar aportes com gastos.

    Consolida fluxo de caixa, planejamento e categorias e compara com uma janela
    anterior de mesmo tamanho. A funcao reutiliza as mesmas regras dos paineis e
    do orcamento, preservando a classificacao existente do usuario.
    """
    meses = _meses_intervalo(ano_inicio, mes_inicio, ano_fim, mes_fim)
    if len(meses) > 60:
        raise ValueError("O periodo maximo para analise e de 60 meses.")

    evolucao = evolucao_mensal(session, ano_inicio, mes_inicio, ano_fim, mes_fim)
    totais = {
        "receita": sum((_decimal(item["receita"]) for item in evolucao), Decimal("0")),
        "gasto": sum((_decimal(item["gasto"]) for item in evolucao), Decimal("0")),
        "investimento": sum((_decimal(item["investimento"]) for item in evolucao), Decimal("0")),
    }
    totais["saldo_livre"] = totais["receita"] - totais["gasto"] - totais["investimento"]

    anterior_fim = _deslocar_mes(ano_inicio, mes_inicio, -1)
    anterior_inicio = _deslocar_mes(anterior_fim[0], anterior_fim[1], -(len(meses) - 1))
    evolucao_anterior = evolucao_mensal(
        session,
        anterior_inicio[0],
        anterior_inicio[1],
        anterior_fim[0],
        anterior_fim[1],
    )
    totais_anteriores = {
        "receita": sum((_decimal(item["receita"]) for item in evolucao_anterior), Decimal("0")),
        "gasto": sum((_decimal(item["gasto"]) for item in evolucao_anterior), Decimal("0")),
        "investimento": sum((_decimal(item["investimento"]) for item in evolucao_anterior), Decimal("0")),
    }
    totais_anteriores["saldo_livre"] = (
        totais_anteriores["receita"] - totais_anteriores["gasto"] - totais_anteriores["investimento"]
    )

    planejado = {natureza: Decimal("0") for natureza in NaturezaCategoria}
    realizado_planejado = {natureza: Decimal("0") for natureza in NaturezaCategoria}
    nao_planejado = {natureza: Decimal("0") for natureza in NaturezaCategoria}
    diagnosticos: dict[tuple[str, str], dict] = {}
    categorias_gasto: dict[str, Decimal] = {}

    for ano, mes in meses:
        itens = listar_orcamento_mes(session, ano, mes)
        for item in itens:
            natureza = NaturezaCategoria(item["natureza"])
            valor_orcado = _decimal(item.get("valor_orcado"))
            valor_realizado = _decimal(item.get("gasto_real"))
            planejado[natureza] += valor_orcado
            realizado_planejado[natureza] += valor_realizado
            label = item.get("categoria") or "Sem categoria"
            if item.get("subcategoria"):
                label = f"{label} › {item['subcategoria']}"
            chave = (natureza.value, label)
            linha = diagnosticos.setdefault(
                chave,
                {
                    "natureza": natureza.value,
                    "item": label,
                    "planejado": Decimal("0"),
                    "realizado": Decimal("0"),
                },
            )
            linha["planejado"] += valor_orcado
            linha["realizado"] += valor_realizado

        for item in listar_nao_planejados_mes(session, ano, mes, itens):
            natureza = NaturezaCategoria(item["natureza"])
            nao_planejado[natureza] += _decimal(item.get("valor_realizado"))

        for item in gastos_por_categoria(session, ano, mes):
            label = str(item.get("categoria") or "Sem categoria")
            categorias_gasto[label] = categorias_gasto.get(label, Decimal("0")) + _decimal(item.get("valor"))

    diagnostico_lista = []
    for linha in diagnosticos.values():
        desvio = linha["realizado"] - linha["planejado"]
        if linha["natureza"] in {NaturezaCategoria.RECEITA.value, NaturezaCategoria.INVESTIMENTO.value}:
            favoravel = desvio >= 0
        else:
            favoravel = desvio <= 0
        diagnostico_lista.append({**linha, "desvio": desvio, "favoravel": favoravel})
    diagnostico_lista.sort(
        key=lambda item: (
            item["natureza"] != NaturezaCategoria.GASTO.value,
            -(item["realizado"] - item["planejado"]),
        )
    )

    gasto_total = totais["gasto"]
    categorias = [
        {
            "categoria": label,
            "valor": valor,
            "percentual": (valor / gasto_total * Decimal("100")) if gasto_total > 0 else Decimal("0"),
        }
        for label, valor in sorted(categorias_gasto.items(), key=lambda item: item[1], reverse=True)
    ]

    receita = totais["receita"]
    taxa_economia = ((receita - totais["gasto"]) / receita * Decimal("100")) if receita > 0 else Decimal("0")
    taxa_investimento = (totais["investimento"] / receita * Decimal("100")) if receita > 0 else Decimal("0")
    comprometimento = (totais["gasto"] / receita * Decimal("100")) if receita > 0 else Decimal("0")

    gasto_planejado_total = planejado[NaturezaCategoria.GASTO]
    gasto_real_planejado = realizado_planejado[NaturezaCategoria.GASTO]
    gasto_real_total_orcamento = gasto_real_planejado + nao_planejado[NaturezaCategoria.GASTO]
    investimento_planejado = planejado[NaturezaCategoria.INVESTIMENTO]
    investimento_real = realizado_planejado[NaturezaCategoria.INVESTIMENTO] + nao_planejado[NaturezaCategoria.INVESTIMENTO]

    insights: list[dict] = []
    if gasto_planejado_total > 0 and gasto_real_total_orcamento > gasto_planejado_total:
        excesso = gasto_real_total_orcamento - gasto_planejado_total
        insights.append({
            "tipo": "ATENCAO",
            "titulo": "Orcamento de gastos ultrapassado",
            "mensagem": f"Os gastos ficaram R$ {excesso:.2f} acima do planejado no periodo.",
        })
    elif gasto_planejado_total > 0:
        folga = gasto_planejado_total - gasto_real_total_orcamento
        insights.append({
            "tipo": "BOM",
            "titulo": "Gastos dentro do plano",
            "mensagem": f"Voce preservou R$ {folga:.2f} do limite planejado para gastos.",
        })

    if investimento_planejado > 0 and investimento_real >= investimento_planejado:
        insights.append({
            "tipo": "BOM",
            "titulo": "Meta de investimentos superada",
            "mensagem": f"Foram investidos R$ {(investimento_real - investimento_planejado):.2f} alem da meta.",
        })
    elif investimento_planejado > 0:
        insights.append({
            "tipo": "INSIGHT",
            "titulo": "Meta de investimentos em andamento",
            "mensagem": f"Faltam R$ {(investimento_planejado - investimento_real):.2f} para cumprir o planejado.",
        })

    if nao_planejado[NaturezaCategoria.GASTO] > 0:
        insights.append({
            "tipo": "ATENCAO",
            "titulo": "Gastos fora do planejamento",
            "mensagem": f"R$ {nao_planejado[NaturezaCategoria.GASTO]:.2f} foram gastos em itens ainda nao previstos.",
        })

    pior_item = next(
        (
            item for item in diagnostico_lista
            if item["natureza"] == NaturezaCategoria.GASTO.value and item["desvio"] > 0
        ),
        None,
    )
    if pior_item:
        insights.append({
            "tipo": "INSIGHT",
            "titulo": f"Maior desvio: {pior_item['item']}",
            "mensagem": f"Esse item ficou R$ {pior_item['desvio']:.2f} acima do valor planejado.",
        })

    return {
        "periodo": {
            "ano_inicio": ano_inicio,
            "mes_inicio": mes_inicio,
            "ano_fim": ano_fim,
            "mes_fim": mes_fim,
            "quantidade_meses": len(meses),
        },
        "totais": totais,
        "taxas": {
            "economia_percentual": taxa_economia,
            "investimento_percentual": taxa_investimento,
            "comprometimento_percentual": comprometimento,
        },
        "comparacao": {
            "periodo_anterior": {
                "ano_inicio": anterior_inicio[0],
                "mes_inicio": anterior_inicio[1],
                "ano_fim": anterior_fim[0],
                "mes_fim": anterior_fim[1],
            },
            "totais": totais_anteriores,
            "variacoes_percentuais": {
                chave: _variacao_percentual(totais[chave], totais_anteriores[chave])
                for chave in totais
            },
        },
        "planejamento": {
            "receitas": {
                "planejado": planejado[NaturezaCategoria.RECEITA],
                "realizado": realizado_planejado[NaturezaCategoria.RECEITA] + nao_planejado[NaturezaCategoria.RECEITA],
            },
            "gastos": {
                "planejado": gasto_planejado_total,
                "realizado": gasto_real_total_orcamento,
                "nao_planejado": nao_planejado[NaturezaCategoria.GASTO],
            },
            "investimentos": {
                "planejado": investimento_planejado,
                "realizado": investimento_real,
                "nao_planejado": nao_planejado[NaturezaCategoria.INVESTIMENTO],
            },
        },
        "categorias_gasto": categorias,
        "diagnostico_orcamento": diagnostico_lista,
        "insights": insights[:5],
        "evolucao": evolucao,
    }


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
