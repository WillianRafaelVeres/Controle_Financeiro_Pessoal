from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import logging
import httpx
from sqlmodel import Session, select

from app.models.base import Moeda
from app.models.historico_benchmark import HistoricoBenchmark
from app.services.exterior_dolar_service import buscar_cotacao_dolar_data

logger = logging.getLogger(__name__)

# User-Agent for Yahoo Finance requests
HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def _buscar_benchmarks_salvos(session: Session, codigo: str, data_inicio: date, data_fim: date) -> dict[date, HistoricoBenchmark]:
    records = session.exec(
        select(HistoricoBenchmark).where(
            HistoricoBenchmark.codigo == codigo,
            HistoricoBenchmark.data_referencia >= data_inicio,
            HistoricoBenchmark.data_referencia <= data_fim,
        )
    ).all()
    return {rec.data_referencia: rec for rec in records}


def _salvar_benchmarks(session: Session, registros: list[HistoricoBenchmark]) -> None:
    if not registros:
        return
    for reg in registros:
        existente = session.exec(
            select(HistoricoBenchmark).where(
                HistoricoBenchmark.codigo == reg.codigo,
                HistoricoBenchmark.data_referencia == reg.data_referencia,
            )
        ).first()
        if not existente:
            session.add(reg)
    try:
        session.commit()
    except Exception as e:
        logger.warning(f"Erro ao salvar cache de benchmark no banco: {e}")
        session.rollback()


def obter_serie_cdi_diario(session: Session, data_inicio: date, data_fim: date) -> dict[date, Decimal]:
    """Retorna dicionário de data -> taxa diária % do CDI."""
    salvos = _buscar_benchmarks_salvos(session, "CDI", data_inicio, data_fim)
    resultado = {d: Decimal(str(rec.valor)) for d, rec in salvos.items()}
    
    # Se faltar dados no período, tentar consultar BCB SGS 12
    datas_necessarias = [data_inicio + timedelta(days=i) for i in range((data_fim - data_inicio).days + 1)]
    datas_faltantes = [d for d in datas_necessarias if d not in resultado and d.weekday() < 5] # apenas dias úteis
    
    if datas_faltantes:
        d_min = min(datas_faltantes)
        d_max = max(datas_faltantes)
        url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?dataInicial={d_min.strftime('%d/%m/%Y')}&dataFinal={d_max.strftime('%d/%m/%Y')}"
        novos_registros = []
        try:
            with httpx.Client(timeout=8.0) as client:
                res = client.get(url)
                if res.status_code == 200:
                    data = res.json()
                    for item in data:
                        try:
                            # formato 'DD/MM/YYYY'
                            dt = datetime.strptime(item["data"], "%d/%m/%Y").date()
                            val = Decimal(str(item["valor"]))
                            resultado[dt] = val
                            novos_registros.append(
                                HistoricoBenchmark(
                                    codigo="CDI",
                                    data_referencia=dt,
                                    valor=val,
                                    moeda=Moeda.BRL,
                                    tipo_retorno="TAXA_DIARIA",
                                    fonte="Banco Central SGS",
                                )
                            )
                        except Exception:
                            continue
            if novos_registros:
                _salvar_benchmarks(session, novos_registros)
        except Exception as e:
            logger.warning(f"Falha ao obter série CDI do BCB SGS: {e}")

    return resultado


def _buscar_serie_yahoo(session: Session, codigo_benchmark: str, ticker_yahoo: str, data_inicio: date, data_fim: date) -> dict[date, Decimal]:
    salvos = _buscar_benchmarks_salvos(session, codigo_benchmark, data_inicio, data_fim)
    resultado = {d: Decimal(str(rec.valor)) for d, rec in salvos.items()}
    
    # Se temos salvos suficientes, utilizar
    if len(salvos) >= (data_fim - data_inicio).days * 0.5:
        return resultado

    # Buscar do Yahoo Finance
    period1 = int(datetime(data_inicio.year, data_inicio.month, data_inicio.day, tzinfo=timezone.utc).timestamp()) - 86400 * 5
    period2 = int(datetime(data_fim.year, data_fim.month, data_fim.day, 23, 59, 59, tzinfo=timezone.utc).timestamp())
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker_yahoo}?period1={period1}&period2={period2}&interval=1d"
    
    novos = []
    try:
        with httpx.Client(timeout=8.0, headers=HTTP_HEADERS) as client:
            res = client.get(url)
            if res.status_code == 200:
                body = res.json()
                result = body.get("chart", {}).get("result", [])
                if result:
                    timestamps = result[0].get("timestamp", [])
                    quotes = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
                    adjclose = result[0].get("indicators", {}).get("adjclose", [{}])[0].get("adjclose", [])
                    
                    for i, ts in enumerate(timestamps):
                        dt = datetime.fromtimestamp(ts, tz=timezone.utc).date()
                        val_raw = adjclose[i] if i < len(adjclose) and adjclose[i] is not None else (quotes[i] if i < len(quotes) else None)
                        if val_raw is not None and val_raw > 0:
                            val = Decimal(str(round(val_raw, 4)))
                            resultado[dt] = val
                            moeda = Moeda.USD if "SP500" in codigo_benchmark else Moeda.BRL
                            novos.append(
                                HistoricoBenchmark(
                                    codigo=codigo_benchmark,
                                    data_referencia=dt,
                                    valor=val,
                                    moeda=moeda,
                                    tipo_retorno="TOTAL_RETURN" if "SP500_TR" in codigo_benchmark else ("PRICE_RETURN" if "SP500" in codigo_benchmark else "TOTAL_RETURN"),
                                    fonte="Yahoo Finance",
                                )
                            )
            if novos:
                _salvar_benchmarks(session, novos)
    except Exception as e:
        logger.warning(f"Falha ao consultar Yahoo Finance para {ticker_yahoo}: {e}")

    return resultado


def obter_serie_ibovespa(session: Session, data_inicio: date, data_fim: date) -> dict[date, Decimal]:
    return _buscar_serie_yahoo(session, "IBOVESPA", "^BVSP", data_inicio, data_fim)


def obter_serie_ifix(session: Session, data_inicio: date, data_fim: date) -> dict[date, Decimal]:
    return _buscar_serie_yahoo(session, "IFIX", "IFIX.SA", data_inicio, data_fim)


def obter_serie_sp500(session: Session, data_inicio: date, data_fim: date) -> dict[date, Decimal]:
    # Tentativa de Total Return ou Price Return do S&P 500
    res_tr = _buscar_serie_yahoo(session, "SP500_TR_USD", "^SP500TR", data_inicio, data_fim)
    if res_tr:
        return res_tr
    return _buscar_serie_yahoo(session, "SP500_PRICE_USD", "^GSPC", data_inicio, data_fim)


def calcular_rentabilidades_benchmarks_mensais(
    session: Session,
    benchmarks_solicitados: list[str],
    meses_datas: list[tuple[int, int, date, date]],  # list of (ano, mes, inicio_mes, fim_mes)
) -> tuple[dict[str, dict[str, float]], dict[str, dict]]:
    """Calcula rentabilidades percentuais mensais para os benchmarks selecionados.
    
    Retorna:
    - rentabilidades: dict[codigo_bm, dict[periodo_str, retorno_float]]
    - status_benchmarks: dict[codigo_bm, dict(disponivel: bool, label: str, erro: str|None)]
    """
    if not meses_datas:
        return {}, {}

    data_inicio_global = meses_datas[0][2]
    data_fim_global = meses_datas[-1][3]

    rentabilidades: dict[str, dict[str, float]] = {}
    status: dict[str, dict] = {}

    for bm in benchmarks_solicitados:
        codigo = bm.upper()
        if codigo == "CDI":
            taxas_cdi = obter_serie_cdi_diario(session, data_inicio_global, data_fim_global)
            if not taxas_cdi:
                status["CDI"] = {"disponivel": False, "label": "CDI", "erro": "Não foi possível carregar a série do CDI."}
                continue
            
            status["CDI"] = {"disponivel": True, "label": "CDI", "erro": None}
            rentabilidades["CDI"] = {}
            for ano, mes, d_ini, d_fim in meses_datas:
                per_str = f"{mes:02d}/{ano}"
                # Compõe taxas diárias no mês
                fator = Decimal("1.0")
                curr = d_ini
                while curr <= d_fim:
                    if curr in taxas_cdi:
                        fator *= (Decimal("1.0") + (taxas_cdi[curr] / Decimal("100.0")))
                    curr += timedelta(days=1)
                ret_pct = float((fator - Decimal("1.0")) * Decimal("100.0"))
                rentabilidades["CDI"][per_str] = round(ret_pct, 4)

        elif codigo == "IBOVESPA":
            serie = obter_serie_ibovespa(session, data_inicio_global, data_fim_global)
            if not serie:
                status["IBOVESPA"] = {"disponivel": False, "label": "Ibovespa", "erro": "Não foi possível carregar a série do Ibovespa."}
                continue

            status["IBOVESPA"] = {"disponivel": True, "label": "Ibovespa", "erro": None}
            rentabilidades["IBOVESPA"] = {}
            _calcular_retornos_mensais_serie(serie, meses_datas, rentabilidades["IBOVESPA"])

        elif codigo == "IFIX":
            serie = obter_serie_ifix(session, data_inicio_global, data_fim_global)
            if not serie:
                status["IFIX"] = {"disponivel": False, "label": "IFIX", "erro": "Não foi possível carregar a série do IFIX."}
                continue

            status["IFIX"] = {"disponivel": True, "label": "IFIX", "erro": None}
            rentabilidades["IFIX"] = {}
            _calcular_retornos_mensais_serie(serie, meses_datas, rentabilidades["IFIX"])

        elif codigo in {"SP500", "SP500_USD", "SP500_BRL"}:
            serie_usd = obter_serie_sp500(session, data_inicio_global, data_fim_global)
            if not serie_usd:
                status[codigo] = {"disponivel": False, "label": "S&P 500", "erro": "Não foi possível carregar a série do S&P 500."}
                continue

            if codigo == "SP500_BRL":
                # Converte série USD em BRL multiplicando pelo câmbio do dia
                serie_brl = {}
                for d, val_usd in serie_usd.items():
                    tx_usd = buscar_cotacao_dolar_data(session, d)
                    if tx_usd > 0:
                        serie_brl[d] = val_usd * tx_usd
                
                status["SP500_BRL"] = {"disponivel": True, "label": "S&P 500 em BRL", "erro": None}
                rentabilidades["SP500_BRL"] = {}
                _calcular_retornos_mensais_serie(serie_brl, meses_datas, rentabilidades["SP500_BRL"])
            else:
                label_sp = "S&P 500 Total Return" if any(r.tipo_retorno == "TOTAL_RETURN" for r in _buscar_benchmarks_salvos(session, "SP500_TR_USD", data_inicio_global, data_fim_global).values()) else "S&P 500 (preço, USD)"
                status[codigo] = {"disponivel": True, "label": label_sp, "erro": None}
                rentabilidades[codigo] = {}
                _calcular_retornos_mensais_serie(serie_usd, meses_datas, rentabilidades[codigo])

    return rentabilidades, status


def _encontrar_valor_mais_proximo(serie: dict[date, Decimal], data_alvo: date, buscar_depois: bool = False) -> Decimal | None:
    if data_alvo in serie:
        return serie[data_alvo]
    
    datas_ordenadas = sorted(serie.keys())
    if not datas_ordenadas:
        return None
    
    if buscar_depois:
        # Primeiro dia >= data_alvo
        cand = [d for d in datas_ordenadas if d >= data_alvo]
        return serie[cand[0]] if cand else serie[datas_ordenadas[-1]]
    else:
        # Último dia <= data_alvo
        cand = [d for d in datas_ordenadas if d <= data_alvo]
        return serie[cand[-1]] if cand else serie[datas_ordenadas[0]]


def _calcular_retornos_mensais_serie(serie: dict[date, Decimal], meses_datas: list[tuple[int, int, date, date]], destino: dict[str, float]) -> None:
    for ano, mes, d_ini, d_fim in meses_datas:
        per_str = f"{mes:02d}/{ano}"
        # Valor início do mês (último pregão válido do mês anterior ou primeiro válido do mês)
        v_ini = _encontrar_valor_mais_proximo(serie, d_ini, buscar_depois=True)
        v_fim = _encontrar_valor_mais_proximo(serie, d_fim, buscar_depois=False)
        
        if v_ini and v_fim and v_ini > 0:
            ret_pct = float(((v_fim - v_ini) / v_ini) * Decimal("100.0"))
            destino[per_str] = round(ret_pct, 4)
        else:
            destino[per_str] = 0.0
