from calendar import monthrange
from datetime import date, datetime, timedelta
from decimal import Decimal
from threading import Lock

import httpx
from fastapi import HTTPException
from sqlmodel import Session

from app.services.exterior_dolar_service import buscar_cotacao_dolar_atual


BCB_PTAX_PERIODO_URL = (
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/"
    "CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)"
)
AWESOMEAPI_HISTORICO_URL = "https://economia.awesomeapi.com.br/json/daily/USD-BRL/15"
TIMEOUT_HISTORICO_SEGUNDOS = 3.5
JANELA_DIAS_ANTERIORES = 14

_cache_lock = Lock()
_cache_mensal_bcb: dict[tuple[int, int], dict[date, dict]] = {}
_cache_por_data: dict[date, dict] = {}
_cache_atual: tuple[datetime, dict] | None = None


def limpar_cache_cotacao_historica() -> None:
    global _cache_atual
    with _cache_lock:
        _cache_mensal_bcb.clear()
        _cache_por_data.clear()
        _cache_atual = None


def _decimal_positivo(valor) -> Decimal:
    numero = Decimal(str(valor or "0"))
    if numero <= 0:
        raise ValueError("cotacao invalida")
    return numero


def _data_hora_bcb(item: dict) -> datetime | None:
    valor = item.get("dataHoraCotacao")
    if not valor:
        return None
    try:
        return datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except ValueError:
        return None


def _resultado_bcb(item: dict, data_cotacao: date) -> dict:
    compra = _decimal_positivo(item.get("cotacaoCompra"))
    venda = _decimal_positivo(item.get("cotacaoVenda"))
    return {
        "cotacao_brl": venda,
        "compra_brl": compra,
        "venda_brl": venda,
        "variacao_brl": Decimal("0.00"),
        "percentual_variacao": Decimal("0.00"),
        "data_cotacao": data_cotacao,
        "fonte": "BCB PTAX",
    }


def _periodo_mes(data_referencia: date) -> tuple[date, date]:
    primeiro_dia = data_referencia.replace(day=1)
    ultimo_dia = data_referencia.replace(day=monthrange(data_referencia.year, data_referencia.month)[1])
    fim = min(ultimo_dia, date.today())
    return primeiro_dia - timedelta(days=JANELA_DIAS_ANTERIORES), fim


def _buscar_mes_bcb(data_referencia: date) -> dict[date, dict]:
    inicio, fim = _periodo_mes(data_referencia)
    response = httpx.get(
        BCB_PTAX_PERIODO_URL,
        params={
            "@dataInicial": f"'{inicio:%m-%d-%Y}'",
            "@dataFinalCotacao": f"'{fim:%m-%d-%Y}'",
            "$top": "500",
            "$format": "json",
            "$select": "cotacaoCompra,cotacaoVenda,dataHoraCotacao",
        },
        headers={"User-Agent": "CentralFinanceira/1.0"},
        timeout=TIMEOUT_HISTORICO_SEGUNDOS,
    )
    response.raise_for_status()
    itens = response.json().get("value") or []
    fechamentos: dict[date, tuple[datetime, dict]] = {}
    for item in itens:
        data_hora = _data_hora_bcb(item)
        if not data_hora:
            continue
        data_item = data_hora.date()
        atual = fechamentos.get(data_item)
        if atual is None or data_hora > atual[0]:
            fechamentos[data_item] = (data_hora, item)
    if not fechamentos:
        raise ValueError("BCB nao retornou cotacoes no periodo")
    return {data_item: _resultado_bcb(item, data_item) for data_item, (_, item) in fechamentos.items()}


def _data_item_awesome(item: dict) -> date | None:
    create_date = item.get("create_date")
    if create_date:
        try:
            return datetime.fromisoformat(str(create_date)).date()
        except ValueError:
            pass
    timestamp = item.get("timestamp")
    if timestamp:
        try:
            return datetime.fromtimestamp(int(timestamp)).date()
        except (TypeError, ValueError, OSError):
            pass
    return None


def _buscar_data_awesome(data_referencia: date) -> dict:
    inicio = data_referencia - timedelta(days=JANELA_DIAS_ANTERIORES)
    response = httpx.get(
        AWESOMEAPI_HISTORICO_URL,
        params={
            "start_date": inicio.strftime("%Y%m%d"),
            "end_date": data_referencia.strftime("%Y%m%d"),
        },
        headers={"User-Agent": "CentralFinanceira/1.0"},
        timeout=TIMEOUT_HISTORICO_SEGUNDOS,
    )
    response.raise_for_status()
    candidatos: list[tuple[date, dict]] = []
    for item in response.json() or []:
        data_item = _data_item_awesome(item)
        if data_item and data_item <= data_referencia:
            candidatos.append((data_item, item))
    if not candidatos:
        raise ValueError("AwesomeAPI nao retornou cotacao anterior ou igual a data")
    data_cotacao, item = max(candidatos, key=lambda candidato: candidato[0])
    compra = _decimal_positivo(item.get("bid"))
    venda = _decimal_positivo(item.get("ask"))
    return {
        "cotacao_brl": venda,
        "compra_brl": compra,
        "venda_brl": venda,
        "variacao_brl": Decimal(str(item.get("varBid") or "0")),
        "percentual_variacao": Decimal(str(item.get("pctChange") or "0")),
        "data_cotacao": data_cotacao,
        "fonte": "AwesomeAPI",
    }


def _resolver_no_mes(cotacoes: dict[date, dict], data_referencia: date) -> dict | None:
    datas = [data_item for data_item in cotacoes if data_item <= data_referencia]
    if not datas:
        return None
    return dict(cotacoes[max(datas)])


def _buscar_atual_cacheada(session: Session) -> dict:
    global _cache_atual
    agora = datetime.now()
    with _cache_lock:
        if _cache_atual and (agora - _cache_atual[0]).total_seconds() < 300:
            return dict(_cache_atual[1])
    resultado = buscar_cotacao_dolar_atual(session)
    with _cache_lock:
        _cache_atual = (agora, dict(resultado))
    return resultado


def buscar_cotacao_dolar_data(session: Session, data_referencia: date) -> dict:
    if data_referencia >= date.today():
        return _buscar_atual_cacheada(session)

    with _cache_lock:
        cached = _cache_por_data.get(data_referencia)
        mes_cached = _cache_mensal_bcb.get((data_referencia.year, data_referencia.month))
    if cached:
        return dict(cached)

    resultado = _resolver_no_mes(mes_cached, data_referencia) if mes_cached else None
    erros: list[str] = []

    if resultado is None and mes_cached is None:
        try:
            cotacoes_mes = _buscar_mes_bcb(data_referencia)
            with _cache_lock:
                _cache_mensal_bcb[(data_referencia.year, data_referencia.month)] = cotacoes_mes
            resultado = _resolver_no_mes(cotacoes_mes, data_referencia)
        except Exception as exc:
            erros.append(f"BCB PTAX: {exc}")

    if resultado is None:
        try:
            resultado = _buscar_data_awesome(data_referencia)
        except Exception as exc:
            erros.append(f"AwesomeAPI: {exc}")

    if resultado is None:
        detalhe = "; ".join(erros)
        raise HTTPException(
            status_code=502,
            detail=(
                f"Nao foi possivel obter a cotacao historica do dolar para "
                f"{data_referencia:%d/%m/%Y}. O dividendo nao foi salvo sem conversao."
                + (f" Detalhes: {detalhe}" if detalhe else "")
            ),
        )

    with _cache_lock:
        _cache_por_data[data_referencia] = dict(resultado)
    return dict(resultado)
