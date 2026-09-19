from datetime import date, datetime, timedelta
from decimal import Decimal
import logging
from sqlmodel import Session, select

from app.models.base import Moeda, TipoAtivo, TipoMovimentoInvestimento, month_bounds
from app.models.dividendo import Dividendo
from app.models.historico_posicao import HistoricoPosicaoInvestimentoMensal
from app.models.investimento import Ativo, MovimentoInvestimento
from app.services.benchmark_service import calcular_rentabilidades_benchmarks_mensais
from app.services.historico_posicao_service import (
    garantir_backfill_historico_posicoes,
    reconstruir_posicao_ativo_na_data,
)
from app.services.exterior_dolar_service import buscar_cotacao_dolar_data

logger = logging.getLogger(__name__)

# Mapeamento de grupos de escopo
ESCOPO_MAPA_TIPOS = {
    "CARTEIRA_TOTAL": None,  # Todos
    "ACAO_BR": {TipoAtivo.ACAO_BR},
    "FII": {TipoAtivo.FII},
    "ETF_BR": {TipoAtivo.ETF_BR},
    "RENDA_FIXA": {TipoAtivo.RENDA_FIXA, TipoAtivo.CAIXINHA_CDB, TipoAtivo.RESERVA_EMERGENCIA},
    "EXTERIOR": {TipoAtivo.EXTERIOR, TipoAtivo.ACAO_EXTERIOR, TipoAtivo.ETF_EXTERIOR},
    "CRIPTO": {TipoAtivo.CRIPTO},
    "PREVIDENCIA": {TipoAtivo.PREVIDENCIA},
    "DOLAR_CAIXA": {TipoAtivo.DOLAR_CAIXA},
    "OUTRO": {TipoAtivo.OUTRO},
}

CATEGORIA_LABELS = {
    TipoAtivo.ACAO_BR: "Ações brasileiras",
    TipoAtivo.FII: "Fundos imobiliários",
    TipoAtivo.ETF_BR: "ETFs Brasil",
    TipoAtivo.RENDA_FIXA: "Renda fixa",
    TipoAtivo.CAIXINHA_CDB: "Renda fixa (Caixinhas)",
    TipoAtivo.RESERVA_EMERGENCIA: "Reserva de emergência",
    TipoAtivo.EXTERIOR: "Exterior",
    TipoAtivo.ACAO_EXTERIOR: "Exterior (Ações)",
    TipoAtivo.ETF_EXTERIOR: "Exterior (ETFs)",
    TipoAtivo.CRIPTO: "Criptomoedas",
    TipoAtivo.PREVIDENCIA: "Previdência",
    TipoAtivo.DOLAR_CAIXA: "Dólar em caixa",
    TipoAtivo.OUTRO: "Outros",
}


def _resolver_tipos_ativo_escopo(codigo_escopo: str, tipos_solicitados: list[TipoAtivo] | None = None) -> set[TipoAtivo] | None:
    if codigo_escopo == "PERSONALIZADO" and tipos_solicitados:
        return set(tipos_solicitados)
    return ESCOPO_MAPA_TIPOS.get(codigo_escopo.upper(), None)


def _inicio_janela_mensal(ancora: date, quantidade_meses: int) -> date:
    indice = ancora.year * 12 + ancora.month - 1 - (quantidade_meses - 1)
    return date(indice // 12, indice % 12 + 1, 1)


def obter_data_inicio_escopo(session: Session, tipos_escopo: set[TipoAtivo] | None, ativos_ids: list[str] | None = None) -> date:
    """Encontra a data do primeiro movimento dos ativos pertencentes ao escopo."""
    query = select(MovimentoInvestimento.data_movimento).join(Ativo, MovimentoInvestimento.ativo_id == Ativo.id)

    if ativos_ids:
        query = query.where(Ativo.id.in_(ativos_ids))
    elif tipos_escopo:
        query = query.where(Ativo.tipo_ativo.in_(tipos_escopo))

    primeira_data = session.exec(query.order_by(MovimentoInvestimento.data_movimento.asc())).first()
    return primeira_data or date.today()


def calcular_rentabilidade_comparada(
    session: Session,
    escopo_codigo: str = "CARTEIRA_TOTAL",
    periodo_codigo: str = "desde_inicio",
    data_inicio_custom: date | None = None,
    data_fim_custom: date | None = None,
    tipos_ativo_custom: list[TipoAtivo] | None = None,
    ativos_ids_custom: list[str] | None = None,
    benchmarks_solicitados: list[str] | None = None,
    incluir_proventos: bool = True,
) -> dict:
    """Calcula rentabilidade comparada com Modified Dietz mensal encadeado e benchmarks."""
    # 1. Garantir que histórico de posições está atualizado no banco
    garantir_backfill_historico_posicoes(session)

    tipos_escopo = _resolver_tipos_ativo_escopo(escopo_codigo, tipos_ativo_custom)

    # 2. Definir datas da janela
    hoje = date.today()
    dt_fim_efetiva = min(data_fim_custom or hoje, hoje)
    dt_inicio_efetiva = obter_data_inicio_escopo(session, tipos_escopo, ativos_ids_custom)
    ancora_periodo = dt_fim_efetiva

    if periodo_codigo == "ano_atual":
        dt_inicio_efetiva = max(dt_inicio_efetiva, date(ancora_periodo.year, 1, 1))
    elif periodo_codigo == "12m":
        dt_inicio_efetiva = max(dt_inicio_efetiva, _inicio_janela_mensal(ancora_periodo, 12))
    elif periodo_codigo == "24m":
        dt_inicio_efetiva = max(dt_inicio_efetiva, _inicio_janela_mensal(ancora_periodo, 24))
    elif periodo_codigo == "36m":
        dt_inicio_efetiva = max(dt_inicio_efetiva, _inicio_janela_mensal(ancora_periodo, 36))
    elif periodo_codigo == "personalizado" and data_inicio_custom:
        dt_inicio_efetiva = date(data_inicio_custom.year, data_inicio_custom.month, 1)

    if dt_inicio_efetiva > dt_fim_efetiva:
        dt_inicio_efetiva = dt_fim_efetiva

    # 3. Gerar lista de meses do período
    meses_datas: list[tuple[int, int, date, date]] = []
    curr_ano, curr_mes = dt_inicio_efetiva.year, dt_inicio_efetiva.month
    ano_fim, mes_fim = dt_fim_efetiva.year, dt_fim_efetiva.month

    while (curr_ano < ano_fim) or (curr_ano == ano_fim and curr_mes <= mes_fim):
        d_ini, d_fim = month_bounds(curr_ano, curr_mes)
        d_fim_ef = min(d_fim - timedelta(days=1), dt_fim_efetiva)
        meses_datas.append((curr_ano, curr_mes, max(d_ini, dt_inicio_efetiva), d_fim_ef))

        if curr_mes == 12:
            curr_ano += 1
            curr_mes = 1
        else:
            curr_mes += 1

    # 4. Obter ativos elegíveis do escopo (incluindo posições encerradas no passado)
    query_ativos = select(Ativo)
    if ativos_ids_custom:
        query_ativos = query_ativos.where(Ativo.id.in_(ativos_ids_custom))
    elif tipos_escopo:
        query_ativos = query_ativos.where(Ativo.tipo_ativo.in_(tipos_escopo))

    ativos_escopo = session.exec(query_ativos).all()
    ativos_ids_escopo = {a.id for a in ativos_escopo}

    # Se não houver ativos/movimentações no escopo
    if not ativos_escopo or not meses_datas:
        return {
            "escopo": {"codigo": escopo_codigo, "label": CATEGORIA_LABELS.get(TipoAtivo(escopo_codigo), escopo_codigo) if escopo_codigo in CATEGORIA_LABELS else escopo_codigo},
            "data_inicio_efetiva": dt_inicio_efetiva.isoformat(),
            "data_fim": dt_fim_efetiva.isoformat(),
            "moeda_base": "BRL",
            "metodologia": "MODIFIED_DIETZ_MENSAL_ENCADEADO",
            "incluir_proventos": incluir_proventos,
            "cobertura": {"completa": True, "avisos": ["Ainda não existem movimentações neste escopo para analisar."]},
            "resumo": {
                "carteira_percentual": 0.0,
                "resultado_brl": 0.0,
                "aportes_liquidos_brl": 0.0,
                "proventos_brl": 0.0,
                "patrimonio_final_brl": 0.0,
                "meses_positivos": 0,
                "meses_analisados": 0,
                "max_drawdown_percentual": 0.0,
                "benchmarks": {},
            },
            "serie": [],
        }

    # 5. Buscar snapshots mensais para os ativos do escopo
    query_snaps = select(HistoricoPosicaoInvestimentoMensal).where(
        HistoricoPosicaoInvestimentoMensal.ativo_id.in_(ativos_ids_escopo)
    )
    snaps_todos = session.exec(query_snaps).all()
    
    # Organizar snapshots por (ano, mes, ativo_id)
    snaps_map: dict[tuple[int, int, str], HistoricoPosicaoInvestimentoMensal] = {}
    for s in snaps_todos:
        snaps_map[(s.ano, s.mes, s.ativo_id)] = s

    movimentos_periodo = session.exec(
        select(MovimentoInvestimento).where(
            MovimentoInvestimento.ativo_id.in_(ativos_ids_escopo),
            MovimentoInvestimento.data_movimento >= dt_inicio_efetiva,
            MovimentoInvestimento.data_movimento <= dt_fim_efetiva,
        )
    ).all()
    movimentos_por_mes: dict[tuple[int, int], list[MovimentoInvestimento]] = {}
    for movimento in movimentos_periodo:
        movimentos_por_mes.setdefault(
            (movimento.data_movimento.year, movimento.data_movimento.month), []
        ).append(movimento)

    # 6. Calcular rentabilidade mensal Modified Dietz por mês
    serie_resultado = []
    avisos_cobertura = set()
    cum_factor_carteira = 1.0
    pico_factor_carteira = 1.0
    max_drawdown = 0.0
    resultado_total = Decimal("0.00")
    aportes_liquidos_total = Decimal("0.00")
    proventos_total = Decimal("0.00")
    meses_positivos = 0

    # Dicionários de fatores acumulados para benchmarks
    benchmarks_lista = benchmarks_solicitados or []
    retornos_bm_mensais, status_bm = calcular_rentabilidades_benchmarks_mensais(
        session, benchmarks_lista, meses_datas
    )
    cum_factors_bm: dict[str, float] = {bm: 1.0 for bm in retornos_bm_mensais}

    val_inicio_anterior = None

    for idx_mes, (ano, mes, d_ini, d_fim) in enumerate(meses_datas):
        per_str = f"{mes:02d}/{ano}"

        # Valor do patrimônio no início do mês (igual ao fim do mês anterior ou reconstruído no início)
        val_fim_mes = Decimal("0.00")
        aportes_mes = Decimal("0.00")
        retiradas_mes = Decimal("0.00")
        proventos_mes = Decimal("0.00")

        for a_id in ativos_ids_escopo:
            snap = snaps_map.get((ano, mes, a_id))
            if snap:
                val_fim_mes += snap.valor_fim_brl
                aportes_mes += snap.aportes_periodo_brl
                retiradas_mes += snap.retiradas_periodo_brl
                proventos_mes += snap.proventos_periodo_brl
                if snap.qualidade_dado == "PARCIAL":
                    avisos_cobertura.add(f"Histórico parcial em {per_str} para alguns ativos.")

        if val_inicio_anterior is not None:
            val_inicio_mes = val_inicio_anterior
        else:
            ano_prev = ano - 1 if mes == 1 else ano
            mes_prev = 12 if mes == 1 else mes - 1
            val_inicio_mes = sum(
                (snaps_map[(ano_prev, mes_prev, a_id)].valor_fim_brl
                 for a_id in ativos_ids_escopo
                 if (ano_prev, mes_prev, a_id) in snaps_map),
                Decimal("0.00"),
            )

        val_inicio_mes = max(Decimal("0.00"), val_inicio_mes)
        val_inicio_anterior = val_fim_mes

        # Net flow = Aportes - Retiradas. No denominador do Modified Dietz,
        # ponderamos cada fluxo pelo tempo em que ficou investido no periodo.
        # Assim um aporte no fim do mes nao recebe o mesmo peso de um aporte no
        # primeiro dia, e em nenhum dos casos o aporte vira lucro.
        cf_liquido = aportes_mes - retiradas_mes
        fluxo_ponderado = Decimal("0.00")
        movimentos_mes = movimentos_por_mes.get((ano, mes), [])
        dias_periodo = max((d_fim - d_ini).days, 1)
        for movimento in movimentos_mes:
            if movimento.tipo_movimento not in {
                TipoMovimentoInvestimento.COMPRA,
                TipoMovimentoInvestimento.APORTE,
                TipoMovimentoInvestimento.VENDA,
                TipoMovimentoInvestimento.RESGATE,
            }:
                continue
            valor_fluxo = Decimal(str(movimento.valor_total or "0"))
            if movimento.moeda == Moeda.USD:
                cambio = buscar_cotacao_dolar_data(session, movimento.data_movimento)
                taxa_cambio = Decimal(str(cambio.get("cotacao_brl") or "0"))
                valor_fluxo *= taxa_cambio if taxa_cambio > 0 else Decimal("1")
            if movimento.tipo_movimento in {
                TipoMovimentoInvestimento.VENDA,
                TipoMovimentoInvestimento.RESGATE,
            }:
                valor_fluxo = -valor_fluxo
            peso = Decimal(str(max((d_fim - movimento.data_movimento).days, 0))) / Decimal(str(dias_periodo))
            fluxo_ponderado += valor_fluxo * peso
        if not movimentos_mes and cf_liquido != 0:
            # Compatibilidade com snapshots importados que nao possuem o
            # detalhamento diario do fluxo original.
            fluxo_ponderado = cf_liquido * Decimal("0.5")

        ve_ajustado = val_fim_mes + (proventos_mes if incluir_proventos else Decimal("0.00"))
        denominador = val_inicio_mes + fluxo_ponderado

        if denominador > 0:
            r_mensal = float((ve_ajustado - val_inicio_mes - cf_liquido) / denominador)
        else:
            r_mensal = 0.0

        resultado_mes = ve_ajustado - val_inicio_mes - cf_liquido
        resultado_total += resultado_mes
        aportes_liquidos_total += cf_liquido
        proventos_total += proventos_mes
        if r_mensal > 0:
            meses_positivos += 1

        # Encadeamento geométrico
        cum_factor_carteira *= (1.0 + r_mensal)
        pico_factor_carteira = max(pico_factor_carteira, cum_factor_carteira)
        drawdown_atual = ((cum_factor_carteira / pico_factor_carteira) - 1.0) * 100.0
        max_drawdown = min(max_drawdown, drawdown_atual)
        carteira_cum_pct = round((cum_factor_carteira - 1.0) * 100.0, 2)

        ponto = {
            "periodo": per_str,
            "data": d_fim.isoformat(),
            "retorno_periodo_carteira": round(r_mensal * 100.0, 2),
            "carteira": carteira_cum_pct,
            "patrimonio_brl": float(val_fim_mes),
            "aporte_liquido_brl": float(cf_liquido),
            "proventos_brl": float(proventos_mes),
            "resultado_brl": float(resultado_mes),
        }

        # Adicionar benchmarks acumulados ao ponto da série
        for bm_code, ret_dict in retornos_bm_mensais.items():
            ret_bm_m = ret_dict.get(per_str, 0.0) / 100.0
            cum_factors_bm[bm_code] *= (1.0 + ret_bm_m)
            ponto[bm_code] = round((cum_factors_bm[bm_code] - 1.0) * 100.0, 2)

        serie_resultado.append(ponto)

    # Resumo final
    rentabilidade_final_carteira = serie_resultado[-1]["carteira"] if serie_resultado else 0.0
    resumo_benchmarks = {}

    for bm_code, status in status_bm.items():
        if status["disponivel"] and bm_code in cum_factors_bm:
            bm_final_pct = round((cum_factors_bm[bm_code] - 1.0) * 100.0, 2)
            dif_pp = round(rentabilidade_final_carteira - bm_final_pct, 2)
            resumo_benchmarks[bm_code] = {
                "label": status["label"],
                "rentabilidade_percentual": bm_final_pct,
                "diferenca_pp": dif_pp,
            }
        else:
            resumo_benchmarks[bm_code] = {
                "label": status.get("label", bm_code),
                "disponivel": False,
                "erro": status.get("erro", "Benchmark indisponível."),
            }

    return {
        "escopo": {
            "codigo": escopo_codigo,
            "label": CATEGORIA_LABELS.get(TipoAtivo(escopo_codigo), escopo_codigo) if escopo_codigo in CATEGORIA_LABELS else (escopo_codigo.replace("_", " ").capitalize()),
            "tipos_ativo": list(tipos_escopo) if tipos_escopo else [],
            "ativos_ids": ativos_ids_custom or [],
        },
        "data_inicio_solicitada": data_inicio_custom.isoformat() if data_inicio_custom else None,
        "data_inicio_efetiva": dt_inicio_efetiva.isoformat(),
        "data_fim": dt_fim_efetiva.isoformat(),
        "moeda_base": "BRL",
        "metodologia": "MODIFIED_DIETZ_MENSAL_ENCADEADO",
        "incluir_proventos": incluir_proventos,
        "cobertura": {
            "completa": len(avisos_cobertura) == 0,
            "avisos": list(avisos_cobertura),
        },
        "resumo": {
            "carteira_percentual": rentabilidade_final_carteira,
            "resultado_brl": float(resultado_total),
            "aportes_liquidos_brl": float(aportes_liquidos_total),
            "proventos_brl": float(proventos_total),
            "patrimonio_final_brl": float(val_inicio_anterior or Decimal("0.00")),
            "meses_positivos": meses_positivos,
            "meses_analisados": len(serie_resultado),
            "max_drawdown_percentual": round(max_drawdown, 2),
            "benchmarks": resumo_benchmarks,
        },
        "serie": serie_resultado,
    }


def calcular_evolucao_categorias(
    session: Session,
    modo: str = "mensal",
    data_inicio_custom: date | None = None,
    data_fim_custom: date | None = None,
) -> dict:
    """Calcula a evolução histórica do patrimônio por categoria de ativo (Valor R$ e Participação %)."""
    garantir_backfill_historico_posicoes(session)

    hoje = date.today()
    dt_inicio = data_inicio_custom or obter_data_inicio_escopo(session, None)
    dt_fim = data_fim_custom or hoje

    # Gerar meses
    meses_datas: list[tuple[int, int, date, date]] = []
    curr_ano, curr_mes = dt_inicio.year, dt_inicio.month
    ano_fim, mes_fim = dt_fim.year, dt_fim.month

    while (curr_ano < ano_fim) or (curr_ano == ano_fim and curr_mes <= mes_fim):
        d_ini, d_fim = month_bounds(curr_ano, curr_mes)
        meses_datas.append((curr_ano, curr_mes, d_ini, min(d_fim - timedelta(days=1), dt_fim)))
        if curr_mes == 12:
            curr_ano += 1
            curr_mes = 1
        else:
            curr_mes += 1

    # Buscar todos os snapshots com os dados dos ativos
    query = (
        select(HistoricoPosicaoInvestimentoMensal, Ativo.tipo_ativo)
        .join(Ativo, HistoricoPosicaoInvestimentoMensal.ativo_id == Ativo.id)
    )
    snaps_com_tipo = session.exec(query).all()

    # Mapear por (ano, mes, tipo_ativo) -> valor_brl total e fluxos
    categoria_valores: dict[tuple[int, int, TipoAtivo], Decimal] = {}
    categoria_aportes: dict[tuple[int, int, TipoAtivo], Decimal] = {}
    categoria_retiradas: dict[tuple[int, int, TipoAtivo], Decimal] = {}

    for snap, t_ativo in snaps_com_tipo:
        key = (snap.ano, snap.mes, t_ativo)
        categoria_valores[key] = categoria_valores.get(key, Decimal("0.00")) + snap.valor_fim_brl
        categoria_aportes[key] = categoria_aportes.get(key, Decimal("0.00")) + snap.aportes_periodo_brl
        categoria_retiradas[key] = categoria_retiradas.get(key, Decimal("0.00")) + snap.retiradas_periodo_brl

    # Obter anos e meses únicos em ordem cronológica de todos os snapshots para rastrear aportes acumulados
    todos_periodos = sorted({(snap.ano, snap.mes) for snap, _ in snaps_com_tipo})

    # Rastrear o aportado líquido acumulado por categoria
    aportado_acumulado_por_cat: dict[TipoAtivo, Decimal] = {t: Decimal("0.00") for t in TipoAtivo}
    aportado_cat_por_mes: dict[tuple[int, int, TipoAtivo], Decimal] = {}

    for p_ano, p_mes in todos_periodos:
        for t_ativo in TipoAtivo:
            ap = categoria_aportes.get((p_ano, p_mes, t_ativo), Decimal("0.00"))
            ret = categoria_retiradas.get((p_ano, p_mes, t_ativo), Decimal("0.00"))
            aportado_acumulado_por_cat[t_ativo] = max(
                Decimal("0.00"), aportado_acumulado_por_cat[t_ativo] + ap - ret
            )
            aportado_cat_por_mes[(p_ano, p_mes, t_ativo)] = aportado_acumulado_por_cat[t_ativo]

    periodos_resultado = []

    for ano, mes, d_ini, d_fim in meses_datas:
        per_str = f"{mes:02d}/{ano}"
        
        # Somar todas as categorias no mês
        patrimonio_total_mes = Decimal("0.00")
        cats_mes_dict: dict[TipoAtivo, Decimal] = {}

        for t_ativo in TipoAtivo:
            v_cat = categoria_valores.get((ano, mes, t_ativo), Decimal("0.00"))
            ap_cat = aportado_cat_por_mes.get((ano, mes, t_ativo), Decimal("0.00"))
            if v_cat > 0 or ap_cat > 0:
                cats_mes_dict[t_ativo] = v_cat
                patrimonio_total_mes += v_cat

        categorias_lista = []
        for t_ativo, v_cat in cats_mes_dict.items():
            pct = float((v_cat / patrimonio_total_mes) * Decimal("100.0")) if patrimonio_total_mes > 0 else 0.0
            aportado_cat = aportado_cat_por_mes.get((ano, mes, t_ativo), Decimal("0.00"))
            ap_mes = categoria_aportes.get((ano, mes, t_ativo), Decimal("0.00"))
            lucro_cat = v_cat - aportado_cat
            rent_cat = (lucro_cat / aportado_cat * Decimal("100.0")) if aportado_cat > 0 else Decimal("0.00")

            categorias_lista.append({
                "tipo": t_ativo.value,
                "label": CATEGORIA_LABELS.get(t_ativo, t_ativo.value),
                "valor_brl": float(v_cat),
                "percentual_carteira": round(pct, 2),
                "aportado_acumulado_brl": float(aportado_cat),
                "aportes_mes_brl": float(ap_mes),
                "lucro_brl": float(lucro_cat),
                "rentabilidade_percentual": round(float(rent_cat), 2),
            })

        periodos_resultado.append({
            "ano": ano,
            "mes": mes,
            "periodo": per_str,
            "data": d_fim.isoformat(),
            "patrimonio_total_brl": float(patrimonio_total_mes),
            "categorias": categorias_lista,
        })

    return {
        "modo": modo,
        "data_inicio": dt_inicio.isoformat(),
        "data_fim": dt_fim.isoformat(),
        "cobertura": {"completa": True, "avisos": []},
        "periodos": periodos_resultado,
    }
