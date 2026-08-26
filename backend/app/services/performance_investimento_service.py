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
    dt_inicio_efetiva = obter_data_inicio_escopo(session, tipos_escopo, ativos_ids_custom)
    dt_fim_efetiva = data_fim_custom or hoje

    if periodo_codigo == "ano_atual":
        dt_inicio_efetiva = max(dt_inicio_efetiva, date(hoje.year, 1, 1))
    elif periodo_codigo == "12m":
        dt_inicio_efetiva = max(dt_inicio_efetiva, hoje - timedelta(days=365))
    elif periodo_codigo == "24m":
        dt_inicio_efetiva = max(dt_inicio_efetiva, hoje - timedelta(days=730))
    elif periodo_codigo == "36m":
        dt_inicio_efetiva = max(dt_inicio_efetiva, hoje - timedelta(days=1095))
    elif periodo_codigo == "personalizado" and data_inicio_custom:
        dt_inicio_efetiva = data_inicio_custom

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
            "resumo": {"carteira_percentual": 0.0, "benchmarks": {}},
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

    # 6. Calcular rentabilidade mensal Modified Dietz por mês
    serie_resultado = []
    avisos_cobertura = set()
    cum_factor_carteira = 1.0

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

        val_inicio_mes = val_inicio_anterior if val_inicio_anterior is not None else (val_fim_mes - aportes_mes + retiradas_mes)
        val_inicio_mes = max(Decimal("0.00"), val_inicio_mes)
        val_inicio_anterior = val_fim_mes

        # Net flow = Aportes - Retiradas
        cf_liquido = aportes_mes - retiradas_mes
        w = Decimal("0.5") # Peso ponderado no meio do mês

        ve_ajustado = val_fim_mes + (proventos_mes if incluir_proventos else Decimal("0.00"))
        denominador = val_inicio_mes + (w * cf_liquido)

        if denominador > 0:
            r_mensal = float((ve_ajustado - val_inicio_mes - cf_liquido) / denominador)
        else:
            r_mensal = 0.0

        # Encadeamento geométrico
        cum_factor_carteira *= (1.0 + r_mensal)
        carteira_cum_pct = round((cum_factor_carteira - 1.0) * 100.0, 2)

        ponto = {
            "periodo": per_str,
            "data": d_fim.isoformat(),
            "retorno_periodo_carteira": round(r_mensal * 100.0, 2),
            "carteira": carteira_cum_pct,
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

    # Mapear por (ano, mes, tipo_ativo) -> valor_brl total
    categoria_valores: dict[tuple[int, int, TipoAtivo], Decimal] = {}
    for snap, t_ativo in snaps_com_tipo:
        key = (snap.ano, snap.mes, t_ativo)
        categoria_valores[key] = categoria_valores.get(key, Decimal("0.00")) + snap.valor_fim_brl

    periodos_resultado = []

    for ano, mes, d_ini, d_fim in meses_datas:
        per_str = f"{mes:02d}/{ano}"
        
        # Somar todas as categorias no mês
        patrimonio_total_mes = Decimal("0.00")
        cats_mes_dict: dict[TipoAtivo, Decimal] = {}

        for t_ativo in TipoAtivo:
            v_cat = categoria_valores.get((ano, mes, t_ativo), Decimal("0.00"))
            if v_cat > 0:
                cats_mes_dict[t_ativo] = v_cat
                patrimonio_total_mes += v_cat

        categorias_lista = []
        for t_ativo, v_cat in cats_mes_dict.items():
            pct = float((v_cat / patrimonio_total_mes) * Decimal("100.0")) if patrimonio_total_mes > 0 else 0.0
            categorias_lista.append({
                "tipo": t_ativo.value,
                "label": CATEGORIA_LABELS.get(t_ativo, t_ativo.value),
                "valor_brl": float(v_cat),
                "percentual_carteira": round(pct, 2),
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
