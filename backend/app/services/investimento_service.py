from datetime import date, datetime, timezone
from decimal import Decimal
from urllib.parse import quote

import httpx
from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.base import Moeda, TipoAtivo, TipoLancamento, TipoMovimentoDolar, TipoMovimentoInvestimento
from app.models.cotacao import Cotacao
from app.models.investimento import Ativo, MovimentoInvestimento
from app.models.lancamento import Lancamento
from app.schemas.investimento_schema import MovimentoInvestimentoCreate
from app.services.exterior_dolar_service import buscar_cotacao_dolar_atual, registrar_movimento_dolar, resumo_dolar, saldo_teorico_usd


TIPOS_EXTERIOR = {TipoAtivo.EXTERIOR, TipoAtivo.ACAO_EXTERIOR, TipoAtivo.ETF_EXTERIOR}
TIPOS_SEM_TICKER = {TipoAtivo.RENDA_FIXA, TipoAtivo.PREVIDENCIA, TipoAtivo.OUTRO}
TIPOS_OCULTOS_POSICAO = {TipoAtivo.DOLAR_CAIXA}
TIPOS_COTACAO_AUTOMATICA_BR = {TipoAtivo.ACAO_BR, TipoAtivo.FII, TipoAtivo.ETF_BR}
TIPOS_COTACAO_AUTOMATICA = TIPOS_COTACAO_AUTOMATICA_BR | {TipoAtivo.CRIPTO}

COINGECKO_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "BNB": "binancecoin",
    "XRP": "ripple",
    "ADA": "cardano",
    "DOGE": "dogecoin",
    "AVAX": "avalanche-2",
    "DOT": "polkadot",
    "LINK": "chainlink",
    "LTC": "litecoin",
    "BCH": "bitcoin-cash",
    "MATIC": "matic-network",
    "POL": "polygon-ecosystem-token",
}

TIPO_ATIVO_LABELS = {
    TipoAtivo.ACAO_BR: "Acao BR",
    TipoAtivo.FII: "FII",
    TipoAtivo.ETF_BR: "ETF BR",
    TipoAtivo.EXTERIOR: "Exterior",
    TipoAtivo.ACAO_EXTERIOR: "Exterior",
    TipoAtivo.ETF_EXTERIOR: "Exterior",
    TipoAtivo.CRIPTO: "Cripto",
    TipoAtivo.RENDA_FIXA: "Renda fixa",
    TipoAtivo.PREVIDENCIA: "Previdencia",
    TipoAtivo.OUTRO: "Outro",
}


def _moeda_padrao(tipo_ativo: TipoAtivo) -> Moeda:
    if tipo_ativo in TIPOS_EXTERIOR:
        return Moeda.USD
    return Moeda.BRL


def _normalizar_texto(valor: str | None) -> str:
    return " ".join((valor or "").strip().split())


def _slug(valor: str) -> str:
    permitido = []
    for char in valor.upper():
        if char.isalnum():
            permitido.append(char)
        elif permitido and permitido[-1] != "_":
            permitido.append("_")
    return "".join(permitido).strip("_")


def _ticker_operacional(tipo_ativo: TipoAtivo, corretora: str | None) -> str:
    return (_slug(f"{tipo_ativo.value}_{corretora or 'GERAL'}") or tipo_ativo.value)[:40]


def _ultima_cotacao(session: Session, ativo_id: str) -> Cotacao | None:
    return session.exec(
        select(Cotacao)
        .where(Cotacao.ativo_id == ativo_id)
        .order_by(Cotacao.data_cotacao.desc(), Cotacao.criado_em.desc())
    ).first()


def _candidatos_yahoo(ativo: Ativo) -> list[str]:
    ticker = ativo.ticker.upper().strip()
    if ativo.tipo_ativo in TIPOS_COTACAO_AUTOMATICA_BR:
        return [f"{ticker}.SA", ticker]
    if ativo.tipo_ativo == TipoAtivo.CRIPTO:
        ticker_base = ticker.removesuffix("-USD").removesuffix("-BRL")
        return [f"{ticker_base}-USD", ticker]
    return [ticker]


def _buscar_preco_yahoo(ativo: Ativo) -> Decimal | None:
    for simbolo in _candidatos_yahoo(ativo):
        for host in ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]:
            try:
                response = httpx.get(
                    f"https://{host}/v8/finance/chart/{simbolo}",
                    params={"range": "1d", "interval": "1d"},
                    headers={"User-Agent": "Mozilla/5.0"},
                    timeout=8,
                )
                response.raise_for_status()
                result = response.json().get("chart", {}).get("result") or []
                meta = result[0].get("meta", {}) if result else {}
                price = meta.get("regularMarketPrice") or meta.get("previousClose")
                if price is not None:
                    return Decimal(str(price))
            except Exception:
                continue
    return None


def _ticker_cripto_base(ticker: str) -> str:
    return ticker.upper().strip().removesuffix("-USD").removesuffix("-BRL")


def _buscar_preco_cripto_brl(session: Session, ativo: Ativo) -> Decimal | None:
    ticker = _ticker_cripto_base(ativo.ticker)
    coingecko_id = COINGECKO_IDS.get(ticker)
    if coingecko_id:
        try:
            response = httpx.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": coingecko_id, "vs_currencies": "brl"},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=8,
            )
            response.raise_for_status()
            price = response.json().get(coingecko_id, {}).get("brl")
            if price:
                return Decimal(str(price))
        except Exception:
            pass

    preco_usd = _buscar_preco_yahoo(ativo)
    if not preco_usd:
        return None
    cotacao_dolar = Decimal(str(buscar_cotacao_dolar_atual(session).get("cotacao_brl") or "0"))
    return preco_usd * cotacao_dolar if cotacao_dolar > 0 else None


def _buscar_indice_yahoo(simbolo: str) -> dict:
    try:
        response = httpx.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(simbolo, safe='')}",
            params={"range": "5d", "interval": "1d"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=8,
        )
        response.raise_for_status()
        chart = response.json().get("chart", {})
        if chart.get("error"):
            raise ValueError(chart["error"].get("description") or "indice indisponivel")
        result = chart.get("result") or []
        meta = result[0].get("meta", {}) if result else {}
        price_raw = meta.get("regularMarketPrice") or meta.get("previousClose")
        previous_raw = meta.get("chartPreviousClose") or meta.get("previousClose")
        if price_raw is None:
            raise ValueError("sem preco")
        price = Decimal(str(price_raw))
        previous = Decimal(str(previous_raw or "0"))
        variacao = None
        if previous > 0:
            variacao = ((price - previous) / previous) * Decimal("100")
        market_time = meta.get("regularMarketTime")
        data = (
            datetime.fromtimestamp(int(market_time), tz=timezone.utc).date().isoformat()
            if market_time
            else None
        )
        return {
            "valor": price,
            "variacao_percentual": variacao,
            "fonte": "Yahoo Finance",
            "data": data,
            "erro": None,
        }
    except Exception:
        return {
            "valor": None,
            "variacao_percentual": None,
            "fonte": "Yahoo Finance",
            "data": None,
            "erro": "Nao foi possivel buscar o indicador agora.",
        }


def _buscar_cdi_diario() -> dict:
    try:
        response = httpx.get(
            "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/1",
            params={"formato": "json"},
            timeout=8,
        )
        response.raise_for_status()
        data = response.json() or []
        item = data[-1] if data else {}
        valor = Decimal(str(item.get("valor") or "0"))
        if valor <= 0:
            raise ValueError("CDI indisponivel")
        return {
            "valor": valor,
            "variacao_percentual": valor,
            "fonte": "Banco Central SGS",
            "data": item.get("data"),
            "erro": None,
        }
    except Exception:
        return {
            "valor": None,
            "variacao_percentual": None,
            "fonte": "Banco Central SGS",
            "data": None,
            "erro": "Nao foi possivel buscar o CDI diario agora.",
        }


def _cotacao_dolar_desempenho(session: Session) -> tuple[Decimal, dict]:
    try:
        cotacao = buscar_cotacao_dolar_atual(session)
        valor = Decimal(str(cotacao.get("cotacao_brl") or "0"))
        return valor, {
            "valor": valor,
            "variacao_percentual": cotacao.get("percentual_variacao"),
            "fonte": cotacao.get("fonte") or "AwesomeAPI",
            "data": cotacao.get("data_cotacao"),
            "erro": cotacao.get("erro"),
        }
    except HTTPException as exc:
        resumo = resumo_dolar(session)
        valor = Decimal(str(resumo.get("cotacao_brl") or "0"))
        return valor, {
            "valor": valor if valor > 0 else None,
            "variacao_percentual": None,
            "fonte": resumo.get("cotacao_brl_fonte") or "CONFIG",
            "data": resumo.get("cotacao_brl_data"),
            "erro": exc.detail,
        }


def _tipo_grupo(tipo_ativo: TipoAtivo) -> TipoAtivo:
    if tipo_ativo in TIPOS_EXTERIOR:
        return TipoAtivo.EXTERIOR
    return tipo_ativo


def _obter_ou_criar_ativo(session: Session, payload: MovimentoInvestimentoCreate) -> Ativo:
    if payload.ativo_id:
        ativo = session.get(Ativo, payload.ativo_id)
        if not ativo or not ativo.ativo:
            raise HTTPException(status_code=404, detail="Ativo nao encontrado.")
        corretora = _normalizar_texto(payload.corretora)
        if corretora:
            ativo.corretora = corretora
            session.add(ativo)
        return ativo
    if not payload.tipo_ativo:
        ativo_existente = session.exec(select(Ativo).where(Ativo.ticker == payload.ticker.upper().strip())).first() if payload.ticker else None
        if ativo_existente:
            return ativo_existente
        raise HTTPException(status_code=422, detail="Informe ativo existente ou ticker e tipo para criar automaticamente.")
    if not payload.ticker and payload.tipo_ativo not in TIPOS_SEM_TICKER:
        raise HTTPException(status_code=422, detail="Informe ticker para este tipo de ativo.")
    corretora = _normalizar_texto(payload.corretora)
    ticker = payload.ticker.upper().strip() if payload.ticker else _ticker_operacional(payload.tipo_ativo, corretora)
    ativo = session.exec(select(Ativo).where(Ativo.ticker == ticker)).first()
    if ativo:
        if corretora:
            ativo.corretora = corretora
            session.add(ativo)
        return ativo
    moeda = _moeda_padrao(payload.tipo_ativo)
    ativo = Ativo(
        ticker=ticker,
        nome=_normalizar_texto(payload.nome) or _normalizar_texto(corretora) or payload.tipo_ativo.value.replace("_", " ").title(),
        tipo_ativo=payload.tipo_ativo,
        moeda=moeda,
        corretora=corretora or None,
    )
    session.add(ativo)
    session.flush()
    return ativo


def calcular_posicao(session: Session, ativo_id: str) -> dict:
    ativo = session.get(Ativo, ativo_id)
    if not ativo:
        raise HTTPException(status_code=404, detail="Ativo nao encontrado.")
    movimentos = session.exec(
        select(MovimentoInvestimento).where(MovimentoInvestimento.ativo_id == ativo_id)
    ).all()
    quantidade = Decimal("0.00")
    custo = Decimal("0.00")
    for movimento in movimentos:
        if movimento.tipo_movimento in [TipoMovimentoInvestimento.COMPRA, TipoMovimentoInvestimento.APORTE, TipoMovimentoInvestimento.AJUSTE]:
            quantidade += movimento.quantidade
            custo += movimento.valor_total + movimento.taxas
        elif movimento.tipo_movimento in [TipoMovimentoInvestimento.VENDA, TipoMovimentoInvestimento.RESGATE]:
            if quantidade > 0:
                preco_medio = custo / quantidade
                custo -= preco_medio * movimento.quantidade
            quantidade -= movimento.quantidade
    quantidade_atual = max(quantidade, Decimal("0.00"))
    custo_atual = max(custo, Decimal("0.00"))
    preco_medio = Decimal("0.00") if quantidade_atual <= 0 else custo_atual / quantidade_atual
    cotacao = _ultima_cotacao(session, ativo_id)
    preco_atual = cotacao.preco if cotacao else preco_medio
    valor_atual = quantidade_atual * preco_atual
    return {
        "ativo_id": ativo_id,
        "quantidade_atual": quantidade_atual,
        "preco_medio": preco_medio,
        "preco_atual": preco_atual,
        "valor_total_aportado": custo_atual,
        "valor_atual": valor_atual,
        "lucro_prejuizo": valor_atual - custo_atual,
        "data_cotacao": cotacao.data_cotacao if cotacao else None,
        "fonte_cotacao": cotacao.fonte if cotacao else None,
    }


def listar_posicoes(session: Session) -> list[dict]:
    ativos = session.exec(select(Ativo).where(Ativo.ativo.is_(True)).order_by(Ativo.ticker)).all()
    result = []
    for ativo in ativos:
        if ativo.tipo_ativo in TIPOS_OCULTOS_POSICAO:
            continue
        posicao = calcular_posicao(session, ativo.id)
        if posicao["quantidade_atual"] > 0:
            result.append(
                {
                    **posicao,
                    "ticker": ativo.ticker,
                    "nome": ativo.nome,
                    "tipo_ativo": ativo.tipo_ativo,
                    "moeda": ativo.moeda,
                    "corretora": ativo.corretora,
                }
            )
    return result


def calcular_desempenho(session: Session) -> dict:
    posicoes = listar_posicoes(session)
    cotacao_dolar, benchmark_dolar = _cotacao_dolar_desempenho(session)
    patrimonio_atual = Decimal("0.00")
    total_aportado = Decimal("0.00")
    lucro_prejuizo = Decimal("0.00")
    exterior_brl = Decimal("0.00")
    alocacao_tipo: dict[TipoAtivo, dict] = {}
    ativos: list[dict] = []

    for posicao in posicoes:
        moeda = posicao["moeda"]
        moeda_valor = moeda.value if hasattr(moeda, "value") else str(moeda)
        tipo_original = posicao["tipo_ativo"]
        tipo = _tipo_grupo(tipo_original)
        fator = cotacao_dolar if moeda_valor == Moeda.USD.value and cotacao_dolar > 0 else Decimal("1.00")
        valor_atual_original = Decimal(str(posicao["valor_atual"]))
        valor_aportado_original = Decimal(str(posicao["valor_total_aportado"]))
        resultado_original = Decimal(str(posicao["lucro_prejuizo"]))
        valor_atual_brl = valor_atual_original * fator
        valor_aportado_brl = valor_aportado_original * fator
        resultado_brl = resultado_original * fator
        rentabilidade = Decimal("0.00")
        if valor_aportado_brl > 0:
            rentabilidade = (resultado_brl / valor_aportado_brl) * Decimal("100")

        patrimonio_atual += valor_atual_brl
        total_aportado += valor_aportado_brl
        lucro_prejuizo += resultado_brl
        if moeda_valor == Moeda.USD.value:
            exterior_brl += valor_atual_brl

        grupo = alocacao_tipo.setdefault(
            tipo,
            {
                "tipo_ativo": tipo.value,
                "tipo_label": TIPO_ATIVO_LABELS.get(tipo, tipo.value),
                "valor_atual_brl": Decimal("0.00"),
                "quantidade_posicoes": 0,
            },
        )
        grupo["valor_atual_brl"] += valor_atual_brl
        grupo["quantidade_posicoes"] += 1

        ativos.append(
            {
                "ativo_id": posicao["ativo_id"],
                "ticker": posicao["ticker"],
                "nome": posicao["nome"],
                "tipo_ativo": tipo.value,
                "tipo_label": TIPO_ATIVO_LABELS.get(tipo, tipo.value),
                "moeda": moeda_valor,
                "corretora": posicao.get("corretora"),
                "valor_atual_brl": valor_atual_brl,
                "valor_atual_original": valor_atual_original,
                "total_aportado_brl": valor_aportado_brl,
                "resultado_brl": resultado_brl,
                "rentabilidade_percentual": rentabilidade,
                "percentual": Decimal("0.00"),
                "cotacao_automatica": tipo_original in TIPOS_COTACAO_AUTOMATICA,
                "fonte_cotacao": posicao.get("fonte_cotacao"),
                "data_cotacao": posicao.get("data_cotacao"),
            }
        )

    for grupo in alocacao_tipo.values():
        grupo["percentual"] = Decimal("0.00") if patrimonio_atual <= 0 else (grupo["valor_atual_brl"] / patrimonio_atual) * Decimal("100")

    for ativo in ativos:
        ativo["percentual"] = Decimal("0.00") if patrimonio_atual <= 0 else (ativo["valor_atual_brl"] / patrimonio_atual) * Decimal("100")

    rentabilidade_carteira = Decimal("0.00") if total_aportado <= 0 else (lucro_prejuizo / total_aportado) * Decimal("100")
    ativos_ordenados = sorted(ativos, key=lambda item: item["valor_atual_brl"], reverse=True)
    maiores_ganhos = sorted([item for item in ativos if item["resultado_brl"] > 0], key=lambda item: item["resultado_brl"], reverse=True)[:5]
    maiores_perdas = sorted([item for item in ativos if item["resultado_brl"] < 0], key=lambda item: item["resultado_brl"])[:5]

    return {
        "patrimonio_atual_brl": patrimonio_atual,
        "total_aportado_brl": total_aportado,
        "lucro_prejuizo_brl": lucro_prejuizo,
        "rentabilidade_percentual": rentabilidade_carteira,
        "exterior_brl": exterior_brl,
        "alocacao_por_tipo": sorted(alocacao_tipo.values(), key=lambda item: item["valor_atual_brl"], reverse=True),
        "alocacao_por_ativo": ativos_ordenados,
        "top_ativos": ativos_ordenados[:8],
        "maiores_ganhos": maiores_ganhos,
        "maiores_perdas": maiores_perdas,
        "benchmarks": {
            "dolar": benchmark_dolar,
            "ibovespa": _buscar_indice_yahoo("^BVSP"),
            "cdi": _buscar_cdi_diario(),
        },
    }


def comprar(session: Session, payload: MovimentoInvestimentoCreate, commit: bool = True) -> MovimentoInvestimento:
    if payload.quantidade <= 0:
        raise HTTPException(status_code=422, detail="Quantidade deve ser maior que zero.")
    ativo = _obter_ou_criar_ativo(session, payload)
    if ativo.tipo_ativo in TIPOS_OCULTOS_POSICAO:
        raise HTTPException(status_code=422, detail="Dolar em caixa deve ser controlado pela aba Exterior/Dolar, nao como ativo.")
    moeda = _moeda_padrao(ativo.tipo_ativo)
    ativo.moeda = moeda
    session.add(ativo)
    valor_total = payload.quantidade * payload.preco_unitario
    valor_financeiro = valor_total + payload.taxas
    if ativo.tipo_ativo in TIPOS_EXTERIOR and saldo_teorico_usd(session) < valor_financeiro:
        raise HTTPException(status_code=422, detail="Saldo USD insuficiente. Envie dolar para o exterior antes da compra.")
    movimento = MovimentoInvestimento(
        ativo_id=ativo.id,
        tipo_movimento=TipoMovimentoInvestimento.COMPRA,
        data_movimento=payload.data_movimento or date.today(),
        quantidade=payload.quantidade,
        preco_unitario=payload.preco_unitario,
        valor_total=valor_total,
        taxas=payload.taxas,
        moeda=moeda,
        conta_id=payload.conta_id,
        observacao=payload.observacao,
    )
    session.add(movimento)
    session.flush()
    if ativo.tipo_ativo in TIPOS_EXTERIOR:
        registrar_movimento_dolar(
            session,
            TipoMovimentoDolar.COMPRA_EXTERIOR,
            valor_financeiro,
            descricao=f"Compra {ativo.ticker}",
            origem="INVESTIMENTO",
            referencia_id=movimento.id,
            data_movimento=movimento.data_movimento,
        )
    elif commit:
        session.add(
            Lancamento(
                data_lancamento=movimento.data_movimento,
                tipo=TipoLancamento.INVESTIMENTO,
                valor=valor_financeiro,
                valor_original=valor_financeiro,
                conta_id=payload.conta_id,
                observacao=payload.observacao or f"Compra {ativo.ticker}",
                afeta_saldo_livre=True,
                afeta_orcamento=True,
            )
        )
    if commit:
        session.commit()
        session.refresh(movimento)
    return movimento


def vender(session: Session, payload: MovimentoInvestimentoCreate) -> MovimentoInvestimento:
    if payload.quantidade <= 0:
        raise HTTPException(status_code=422, detail="Quantidade deve ser maior que zero.")
    if not payload.ativo_id:
        raise HTTPException(status_code=422, detail="Informe o ativo para venda.")
    ativo = session.get(Ativo, payload.ativo_id)
    if not ativo or not ativo.ativo:
        raise HTTPException(status_code=404, detail="Ativo nao encontrado.")
    posicao = calcular_posicao(session, payload.ativo_id)
    if payload.quantidade > posicao["quantidade_atual"]:
        raise HTTPException(status_code=422, detail="Venda maior que quantidade atual bloqueada.")
    valor_total = payload.quantidade * payload.preco_unitario
    moeda = _moeda_padrao(ativo.tipo_ativo)
    movimento = MovimentoInvestimento(
        ativo_id=payload.ativo_id,
        tipo_movimento=TipoMovimentoInvestimento.VENDA,
        data_movimento=payload.data_movimento or date.today(),
        quantidade=payload.quantidade,
        preco_unitario=payload.preco_unitario,
        valor_total=valor_total,
        taxas=payload.taxas,
        moeda=moeda,
        conta_id=payload.conta_id,
        observacao=payload.observacao,
    )
    session.add(movimento)
    session.flush()
    if ativo.tipo_ativo in TIPOS_EXTERIOR:
        registrar_movimento_dolar(
            session,
            TipoMovimentoDolar.VENDA_EXTERIOR,
            max(valor_total - payload.taxas, Decimal("0.00")),
            descricao=f"Venda {ativo.ticker}",
            origem="INVESTIMENTO",
            referencia_id=movimento.id,
            data_movimento=movimento.data_movimento,
        )
    session.commit()
    session.refresh(movimento)
    return movimento


def ativos_para_dividendos(session: Session) -> list[Ativo]:
    ativos = session.exec(select(Ativo).where(Ativo.ativo.is_(True)).order_by(Ativo.ticker)).all()
    return [
        ativo
        for ativo in ativos
        if ativo.tipo_ativo not in TIPOS_OCULTOS_POSICAO and calcular_posicao(session, ativo.id)["quantidade_atual"] > 0
    ]


def registrar_cotacao(session: Session, ativo_id: str, preco: Decimal, fonte: str = "MANUAL") -> Cotacao:
    if preco <= 0:
        raise HTTPException(status_code=422, detail="Preco atual deve ser maior que zero.")
    ativo = session.get(Ativo, ativo_id)
    if not ativo or not ativo.ativo or ativo.tipo_ativo in TIPOS_OCULTOS_POSICAO:
        raise HTTPException(status_code=404, detail="Ativo nao encontrado.")
    cotacao = Cotacao(
        ativo_id=ativo.id,
        simbolo=ativo.ticker,
        fonte=fonte,
        data_cotacao=date.today(),
        preco=preco,
        moeda=_moeda_padrao(ativo.tipo_ativo),
    )
    session.add(cotacao)
    session.commit()
    session.refresh(cotacao)
    return cotacao


def atualizar_cotacao_automatica(session: Session, ativo_id: str) -> Cotacao:
    ativo = session.get(Ativo, ativo_id)
    if not ativo or not ativo.ativo or ativo.tipo_ativo in TIPOS_OCULTOS_POSICAO:
        raise HTTPException(status_code=404, detail="Ativo nao encontrado.")
    if ativo.tipo_ativo not in TIPOS_COTACAO_AUTOMATICA:
        raise HTTPException(status_code=422, detail="Cotacao automatica disponivel apenas para acoes BR, FIIs, ETFs BR e criptos.")
    preco = _buscar_preco_cripto_brl(session, ativo) if ativo.tipo_ativo == TipoAtivo.CRIPTO else _buscar_preco_yahoo(ativo)
    if not preco:
        raise HTTPException(status_code=422, detail="Nao foi possivel encontrar cotacao automatica para este ticker.")
    fonte = "COINGECKO" if ativo.tipo_ativo == TipoAtivo.CRIPTO else "YAHOO"
    return registrar_cotacao(session, ativo_id, preco, fonte=fonte)


def atualizar_cotacoes_automaticas(session: Session) -> dict:
    ativos = session.exec(select(Ativo).where(Ativo.ativo.is_(True)).order_by(Ativo.ticker)).all()
    atualizados: list[dict] = []
    falhas: list[dict] = []
    for ativo in ativos:
        if ativo.tipo_ativo in TIPOS_OCULTOS_POSICAO or ativo.tipo_ativo not in TIPOS_COTACAO_AUTOMATICA:
            continue
        if calcular_posicao(session, ativo.id)["quantidade_atual"] <= 0:
            continue
        try:
            cotacao = atualizar_cotacao_automatica(session, ativo.id)
            atualizados.append({"ativo_id": ativo.id, "ticker": ativo.ticker, "preco": cotacao.preco})
        except HTTPException as exc:
            falhas.append({"ativo_id": ativo.id, "ticker": ativo.ticker, "erro": exc.detail})
    return {"atualizados": atualizados, "falhas": falhas}
