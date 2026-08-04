from calendar import monthrange
from datetime import date, datetime, timedelta
from decimal import Decimal
from threading import Lock

import httpx
from sqlmodel import Session, select

from app.models.dividendo import Dividendo
from app.services.exterior_dolar_service import buscar_cotacao_dolar_atual, resumo_dolar


BCB_PTAX_PERIODO_URL = (
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/"
    "CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)"
)
AWESOMEAPI_HISTORICO_URL = "https://economia.awesomeapi.com.br/json/daily/USD-BRL/40"
TIMEOUT_HISTORICO_SEGUNDOS = 3.5
JANELA_DIAS_ANTERIORES = 35
MEDIA_DIAS = 30

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
            "$top": "1000",
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


def _resolver_dia_util_anterior(cotacoes: dict[date, dict], data_referencia: date) -> dict | None:
    datas = [data_item for data_item in cotacoes if data_item <= data_referencia]
    if not datas:
        return None
    data_encontrada = max(datas)
    if (data_referencia - data_encontrada).days > 7:
        return None
    return dict(cotacoes[data_encontrada])


def _media_30_dias(cotacoes: dict[date, dict], data_referencia: date) -> dict | None:
    inicio = data_referencia - timedelta(days=MEDIA_DIAS)
    validas = [
        item
        for data_item, item in cotacoes.items()
        if inicio <= data_item <= data_referencia and Decimal(str(item.get("cotacao_brl") or "0")) > 0
    ]
    if not validas:
        return None
    quantidade = Decimal(len(validas))
    compra = sum((Decimal(str(item.get("compra_brl") or item["cotacao_brl"])) for item in validas), Decimal("0")) / quantidade
    venda = sum((Decimal(str(item.get("venda_brl") or item["cotacao_brl"])) for item in validas), Decimal("0")) / quantidade
    return {
        "cotacao_brl": venda,
        "compra_brl": compra,
        "venda_brl": venda,
        "variacao_brl": Decimal("0.00"),
        "percentual_variacao": Decimal("0.00"),
        "data_cotacao": data_referencia,
        "fonte": "BCB PTAX MEDIA 30D",
    }


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


def _ultima_cotacao_dividendo(session: Session, data_referencia: date) -> dict | None:
    registro = session.exec(
        select(Dividendo)
        .where(
            Dividendo.cotacao_brl.is_not(None),
            Dividendo.cotacao_brl > 0,
            Dividendo.data_cotacao.is_not(None),
            Dividendo.data_cotacao <= data_referencia,
        )
        .order_by(Dividendo.data_cotacao.desc(), Dividendo.data_recebimento.desc())
    ).first()
    if not registro or not registro.cotacao_brl:
        return None
    cotacao = Decimal(str(registro.cotacao_brl))
    return {
        "cotacao_brl": cotacao,
        "compra_brl": cotacao,
        "venda_brl": cotacao,
        "variacao_brl": Decimal("0.00"),
        "percentual_variacao": Decimal("0.00"),
        "data_cotacao": registro.data_cotacao or registro.data_recebimento,
        "fonte": "HISTORICO SALVO",
    }


def _cotacao_configurada(session: Session) -> dict | None:
    resumo = resumo_dolar(session)
    cotacao = Decimal(str(resumo.get("cotacao_brl") or "0"))
    if cotacao <= 0:
        return None
    return {
        "cotacao_brl": cotacao,
        "compra_brl": cotacao,
        "venda_brl": cotacao,
        "variacao_brl": Decimal("0.00"),
        "percentual_variacao": Decimal("0.00"),
        "data_cotacao": resumo.get("cotacao_brl_data") or date.today(),
        "fonte": "COTACAO SALVA",
    }


def buscar_cotacao_dolar_data(session: Session, data_referencia: date) -> dict:
    if data_referencia >= date.today():
        try:
            return _buscar_atual_cacheada(session)
        except Exception:
            configurada = _cotacao_configurada(session)
            if configurada:
                return configurada
            return {
                "cotacao_brl": Decimal("0.00"),
                "data_cotacao": data_referencia,
                "fonte": "PENDENTE",
            }

    with _cache_lock:
        cached = _cache_por_data.get(data_referencia)
        mes_cached = _cache_mensal_bcb.get((data_referencia.year, data_referencia.month))
    if cached:
        return dict(cached)

    resultado: dict | None = None
    cotacoes_mes = mes_cached
    if cotacoes_mes is None:
        try:
            cotacoes_mes = _buscar_mes_bcb(data_referencia)
            with _cache_lock:
                _cache_mensal_bcb[(data_referencia.year, data_referencia.month)] = cotacoes_mes
        except Exception:
            cotacoes_mes = None

    if cotacoes_mes:
        resultado = _resolver_dia_util_anterior(cotacoes_mes, data_referencia)

    if resultado is None:
        try:
            resultado = _buscar_data_awesome(data_referencia)
        except Exception:
            resultado = None

    if resultado is None and cotacoes_mes:
        resultado = _media_30_dias(cotacoes_mes, data_referencia)

    if resultado is None:
        resultado = _ultima_cotacao_dividendo(session, data_referencia)

    if resultado is None:
        try:
            atual = _buscar_atual_cacheada(session)
            resultado = {
                **atual,
                "fonte": "COTACAO ATUAL - CONTINGENCIA",
            }
        except Exception:
            resultado = _cotacao_configurada(session)

    if resultado is None:
        resultado = {
            "cotacao_brl": Decimal("0.00"),
            "data_cotacao": data_referencia,
            "fonte": "PENDENTE",
        }

    with _cache_lock:
        _cache_por_data[data_referencia] = dict(resultado)
    return dict(resultado)
