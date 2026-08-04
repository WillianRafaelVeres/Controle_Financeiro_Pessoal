from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from decimal import Decimal
from threading import Lock
from time import monotonic

import httpx
from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.base import TipoAtivo
from app.models.cotacao import Cotacao
from app.models.investimento import Ativo
from app.services import exterior_dolar_service, investimento_service


DOLAR_CACHE_SEGUNDOS = 300
BENCHMARK_CACHE_SEGUNDOS = 900
CDI_CACHE_SEGUNDOS = 21600
COTACOES_LOTE_CACHE_SEGUNDOS = 300
MAX_TRABALHADORES_COTACAO = 4
TIMEOUT_DOLAR_SEGUNDOS = 3.0

_cache_lock = Lock()
_atualizacao_lock = Lock()
_cache: dict[str, tuple[float, object]] = {}

_original_buscar_indice_yahoo = investimento_service._buscar_indice_yahoo
_original_buscar_cdi_diario = investimento_service._buscar_cdi_diario
_cache_instalado = False


def _cache_get(chave: str):
    with _cache_lock:
        item = _cache.get(chave)
        if not item:
            return None
        expira_em, valor = item
        if monotonic() >= expira_em:
            _cache.pop(chave, None)
            return None
        return valor


def _cache_set(chave: str, valor, ttl: int) -> None:
    with _cache_lock:
        _cache[chave] = (monotonic() + ttl, valor)


def _cotacao_dolar_salva(session: Session) -> dict | None:
    resumo = exterior_dolar_service.resumo_dolar(session)
    cotacao = Decimal(str(resumo.get("cotacao_brl") or "0"))
    if cotacao <= 0:
        return None
    return {
        "cotacao_brl": cotacao,
        "compra_brl": cotacao,
        "venda_brl": cotacao,
        "variacao_brl": Decimal("0.00"),
        "percentual_variacao": Decimal("0.00"),
        "data_cotacao": resumo.get("cotacao_brl_data"),
        "fonte": resumo.get("cotacao_brl_fonte") or "CONFIG",
        "cache": True,
    }


def buscar_cotacao_dolar_cacheada(session: Session, forcar: bool = False) -> dict:
    if not forcar:
        cached = _cache_get("dolar-atual")
        if isinstance(cached, dict):
            return dict(cached)

    try:
        response = httpx.get(
            exterior_dolar_service.COTACAO_USD_BRL_URL,
            headers={"User-Agent": "CentralFinanceira/1.0"},
            timeout=TIMEOUT_DOLAR_SEGUNDOS,
        )
        response.raise_for_status()
        item = response.json().get("USDBRL") or {}
        compra = Decimal(str(item.get("bid") or "0"))
        venda = Decimal(str(item.get("ask") or "0"))
        cotacao = venda if venda > 0 else compra
        if cotacao <= 0:
            raise ValueError("cotacao invalida")

        data_cotacao = str(item.get("create_date") or item.get("timestamp") or "")
        exterior_dolar_service._set_config_decimal(session, "dolar_cotacao_brl", cotacao)
        exterior_dolar_service._set_config_text(session, "dolar_cotacao_brl_data", data_cotacao)
        exterior_dolar_service._set_config_text(session, "dolar_cotacao_brl_fonte", "AwesomeAPI")
        session.commit()
        resultado = {
            "cotacao_brl": cotacao,
            "compra_brl": compra,
            "venda_brl": venda,
            "variacao_brl": Decimal(str(item.get("varBid") or "0")),
            "percentual_variacao": Decimal(str(item.get("pctChange") or "0")),
            "data_cotacao": data_cotacao,
            "fonte": "AwesomeAPI",
            "cache": False,
        }
    except Exception as exc:
        resultado = _cotacao_dolar_salva(session)
        if resultado is None:
            raise HTTPException(status_code=502, detail="Nao foi possivel buscar cotacao do dolar agora.") from exc
        resultado["erro"] = "Cotacao online indisponivel; usando a ultima cotacao salva."

    _cache_set("dolar-atual", resultado, DOLAR_CACHE_SEGUNDOS)
    return dict(resultado)


def buscar_indice_cacheado(simbolo: str) -> dict:
    chave = f"indice:{simbolo}"
    cached = _cache_get(chave)
    if isinstance(cached, dict):
        return dict(cached)
    resultado = _original_buscar_indice_yahoo(simbolo)
    _cache_set(chave, resultado, BENCHMARK_CACHE_SEGUNDOS)
    return dict(resultado)


def buscar_cdi_cacheado() -> dict:
    cached = _cache_get("cdi-diario")
    if isinstance(cached, dict):
        return dict(cached)
    resultado = _original_buscar_cdi_diario()
    _cache_set("cdi-diario", resultado, CDI_CACHE_SEGUNDOS)
    return dict(resultado)


def instalar_cache_cotacoes() -> None:
    global _cache_instalado
    if _cache_instalado:
        return
    investimento_service.buscar_cotacao_dolar_atual = buscar_cotacao_dolar_cacheada
    investimento_service._buscar_indice_yahoo = buscar_indice_cacheado
    investimento_service._buscar_cdi_diario = buscar_cdi_cacheado
    _cache_instalado = True


def _buscar_preco_yahoo_seguro(ativo: Ativo) -> Decimal | None:
    try:
        return investimento_service._buscar_preco_yahoo(ativo)
    except Exception:
        return None


def _registrar_cotacao_sem_commit(session: Session, ativo: Ativo, preco: Decimal, fonte: str) -> Cotacao:
    cotacao = Cotacao(
        ativo_id=ativo.id,
        simbolo=ativo.ticker,
        fonte=fonte,
        data_cotacao=date.today(),
        preco=preco,
        moeda=investimento_service._moeda_padrao(ativo.tipo_ativo),
    )
    session.add(cotacao)
    return cotacao


def atualizar_cotacoes_automaticas_otimizado(session: Session, forcar: bool = False) -> dict:
    if not forcar:
        cached = _cache_get("cotacoes-lote")
        if isinstance(cached, dict):
            return {**cached, "cache": True}

    if not _atualizacao_lock.acquire(blocking=False):
        cached = _cache_get("cotacoes-lote")
        if isinstance(cached, dict):
            return {**cached, "cache": True, "atualizacao_em_andamento": True}
        return {
            "atualizados": [],
            "falhas": [],
            "cache": True,
            "atualizacao_em_andamento": True,
        }

    try:
        if not forcar:
            cached = _cache_get("cotacoes-lote")
            if isinstance(cached, dict):
                return {**cached, "cache": True}

        ativos = session.exec(select(Ativo).where(Ativo.ativo.is_(True)).order_by(Ativo.ticker)).all()
        elegiveis: list[Ativo] = []
        falhas: list[dict] = []
        for ativo in ativos:
            if ativo.tipo_ativo in investimento_service.TIPOS_OCULTOS_POSICAO:
                continue
            if ativo.tipo_ativo not in investimento_service.TIPOS_COTACAO_AUTOMATICA:
                continue
            try:
                posicao = investimento_service.calcular_posicao(session, ativo.id)
                quantidade = posicao.get("quantidade_atual")
                if quantidade is None or Decimal(str(quantidade)) <= 0:
                    continue
                elegiveis.append(ativo)
            except Exception as exc:
                falhas.append({"ativo_id": ativo.id, "ticker": ativo.ticker, "erro": str(exc)})

        precos: dict[str, tuple[Decimal, str]] = {}
        yahoo = [
            ativo
            for ativo in elegiveis
            if ativo.tipo_ativo != TipoAtivo.CRIPTO and ativo.tipo_ativo != TipoAtivo.RENDA_FIXA
        ]
        if yahoo:
            trabalhadores = min(MAX_TRABALHADORES_COTACAO, len(yahoo))
            with ThreadPoolExecutor(max_workers=trabalhadores) as executor:
                futuros = {executor.submit(_buscar_preco_yahoo_seguro, ativo): ativo for ativo in yahoo}
                for futuro in as_completed(futuros):
                    ativo = futuros[futuro]
                    preco = futuro.result()
                    if preco and preco > 0:
                        precos[ativo.id] = (preco, "YAHOO")
                    else:
                        falhas.append(
                            {
                                "ativo_id": ativo.id,
                                "ticker": ativo.ticker,
                                "erro": "Nao foi possivel obter cotacao no Yahoo Finance.",
                            }
                        )

        for ativo in elegiveis:
            if ativo.id in precos:
                continue
            try:
                if ativo.tipo_ativo == TipoAtivo.CRIPTO:
                    preco = investimento_service._buscar_preco_cripto_brl(session, ativo)
                    fonte = "COINGECKO"
                elif ativo.tipo_ativo == TipoAtivo.RENDA_FIXA:
                    preco = investimento_service._buscar_preco_tesouro(ativo)
                    fonte = "TESOURO"
                else:
                    continue
                if preco and preco > 0:
                    precos[ativo.id] = (preco, fonte)
                else:
                    falhas.append(
                        {
                            "ativo_id": ativo.id,
                            "ticker": ativo.ticker,
                            "erro": "Nao foi possivel obter cotacao automatica.",
                        }
                    )
            except Exception as exc:
                falhas.append({"ativo_id": ativo.id, "ticker": ativo.ticker, "erro": str(exc)})

        atualizados: list[dict] = []
        ativos_por_id = {ativo.id: ativo for ativo in elegiveis}
        for ativo_id, (preco, fonte) in precos.items():
            ativo = ativos_por_id[ativo_id]
            cotacao = _registrar_cotacao_sem_commit(session, ativo, preco, fonte)
            atualizados.append(
                {
                    "ativo_id": ativo.id,
                    "ticker": ativo.ticker,
                    "preco": cotacao.preco,
                    "fonte": fonte,
                }
            )

        if atualizados:
            session.commit()

        resultado = {
            "atualizados": sorted(atualizados, key=lambda item: item["ticker"]),
            "falhas": sorted(falhas, key=lambda item: item["ticker"]),
            "cache": False,
        }
        _cache_set("cotacoes-lote", resultado, COTACOES_LOTE_CACHE_SEGUNDOS)
        return resultado
    finally:
        _atualizacao_lock.release()


instalar_cache_cotacoes()
