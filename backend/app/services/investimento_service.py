from datetime import date, datetime, timezone
from decimal import Decimal
from urllib.parse import quote

import httpx
from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.base import (
    Moeda,
    TipoAtivo,
    TipoControleInvestimento,
    TipoLancamento,
    TipoMovimentoDolar,
    TipoMovimentoInvestimento,
    now_utc,
)
from app.models.cotacao import Cotacao
from app.models.dividendo import Dividendo
from app.models.extrato_dolar import ExtratoDolar
from app.models.historico_investimento import HistoricoInvestimentoMensal
from app.models.investimento import Ativo, MovimentoInvestimento
from app.models.lancamento import Lancamento
from app.models.conta import Conta, ContaSaldo
from app.schemas.investimento_schema import MovimentoInvestimentoCreate, MovimentoInvestimentoUpdate
from app.services.dividendo_service import dividendos_recebidos_brl
from app.services.exterior_dolar_service import buscar_cotacao_dolar_atual, registrar_movimento_dolar, resumo_dolar, saldo_teorico_usd


TIPOS_EXTERIOR = {TipoAtivo.EXTERIOR, TipoAtivo.ACAO_EXTERIOR, TipoAtivo.ETF_EXTERIOR}
TIPOS_CONTROLE_VALOR = {
    TipoAtivo.CAIXINHA_CDB,
    TipoAtivo.RESERVA_EMERGENCIA,
    TipoAtivo.RENDA_FIXA,
    TipoAtivo.PREVIDENCIA,
    TipoAtivo.OUTRO,
}
TIPOS_CONTA_INVESTIMENTO = {TipoAtivo.CAIXINHA_CDB, TipoAtivo.RESERVA_EMERGENCIA, TipoAtivo.PREVIDENCIA}
TIPOS_SEM_TICKER = TIPOS_CONTROLE_VALOR
TIPOS_OCULTOS_POSICAO = {TipoAtivo.DOLAR_CAIXA}
TIPOS_COTACAO_AUTOMATICA_BR = {TipoAtivo.ACAO_BR, TipoAtivo.FII, TipoAtivo.ETF_BR}
TIPOS_COTACAO_AUTOMATICA = TIPOS_COTACAO_AUTOMATICA_BR | TIPOS_EXTERIOR | {TipoAtivo.CRIPTO}
TIPOS_COM_DIVIDENDOS = {TipoAtivo.ACAO_BR, TipoAtivo.FII, TipoAtivo.ETF_BR} | TIPOS_EXTERIOR
TIPOS_CONTA_SALDO_BRL = {
    "CONTA_CORRENTE",
    "CARTEIRA_DIGITAL",
    "DINHEIRO_FISICO",
    "GASTO",
    "RESERVA",
    "OUTRO",
    "OUTRA",
}
CONTA_SALDO_INVESTIMENTO_PREFIX = "AUTO_INVESTIMENTO"

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
    TipoAtivo.CAIXINHA_CDB: "Caixinhas CDB",
    TipoAtivo.RESERVA_EMERGENCIA: "Reserva de emergencia",
    TipoAtivo.ACAO_BR: "Acao BR",
    TipoAtivo.FII: "FII",
    TipoAtivo.ETF_BR: "ETF BR",
    TipoAtivo.EXTERIOR: "Exterior",
    TipoAtivo.ACAO_EXTERIOR: "Exterior",
    TipoAtivo.ETF_EXTERIOR: "Exterior",
    TipoAtivo.CRIPTO: "Cripto",
    TipoAtivo.RENDA_FIXA: "Renda fixa/Tesouro",
    TipoAtivo.PREVIDENCIA: "Previdencia",
    TipoAtivo.OUTRO: "Outro",
}


def _moeda_padrao(tipo_ativo: TipoAtivo) -> Moeda:
    if tipo_ativo in TIPOS_EXTERIOR:
        return Moeda.USD
    return Moeda.BRL


def _decimal(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal("0.00")


def _tipo_controle_padrao(tipo_ativo: TipoAtivo) -> TipoControleInvestimento:
    if tipo_ativo in TIPOS_CONTROLE_VALOR:
        return TipoControleInvestimento.VALOR
    return TipoControleInvestimento.QUANTIDADE


def _controle_por_valor(ativo: Ativo) -> bool:
    return (
        getattr(ativo, "tipo_controle", None) == TipoControleInvestimento.VALOR
        or ativo.tipo_ativo in TIPOS_CONTROLE_VALOR
    )


def _tipo_controle_efetivo(ativo: Ativo) -> TipoControleInvestimento:
    return TipoControleInvestimento.VALOR if _controle_por_valor(ativo) else TipoControleInvestimento.QUANTIDADE


def _permite_null_quantidade(session: Session) -> bool:
    try:
        from sqlalchemy import inspect

        inspector = inspect(session.connection())
        columns = {item["name"]: item for item in inspector.get_columns("movimentos_investimento")}
        quantidade = columns.get("quantidade")
        preco_unitario = columns.get("preco_unitario")
        return bool(
            quantidade
            and preco_unitario
            and quantidade.get("nullable")
            and preco_unitario.get("nullable")
        )
    except Exception:
        return False


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


def _dividendos_recebidos(session: Session, ativo_id: str) -> Decimal:
    dividendos = session.exec(select(Dividendo).where(Dividendo.ativo_id == ativo_id)).all()
    return sum((dividendo.valor for dividendo in dividendos), Decimal("0.00"))


def _candidatos_yahoo(ativo: Ativo) -> list[str]:
    ticker = ativo.ticker.upper().strip()
    if ativo.tipo_ativo in TIPOS_COTACAO_AUTOMATICA_BR:
        return [f"{ticker}.SA", ticker]
    if ativo.tipo_ativo == TipoAtivo.CRIPTO:
        ticker_base = ticker.removesuffix("-USD").removesuffix("-BRL")
        return [f"{ticker_base}-USD", ticker]
    if ativo.tipo_ativo in TIPOS_EXTERIOR:
        return [ticker]
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


def _registrar_snapshot_mensal(session: Session, desempenho: dict, data_referencia: date | None = None) -> HistoricoInvestimentoMensal:
    referencia = data_referencia or date.today()
    snapshot = session.exec(
        select(HistoricoInvestimentoMensal).where(
            HistoricoInvestimentoMensal.ano == referencia.year,
            HistoricoInvestimentoMensal.mes == referencia.month,
        )
    ).first()
    if not snapshot:
        snapshot = HistoricoInvestimentoMensal(ano=referencia.year, mes=referencia.month)
    snapshot.patrimonio_atual_brl = Decimal(str(desempenho.get("patrimonio_atual_brl") or "0"))
    snapshot.total_aportado_brl = Decimal(str(desempenho.get("total_aportado_brl") or "0"))
    snapshot.lucro_prejuizo_brl = Decimal(str(desempenho.get("lucro_prejuizo_brl") or "0"))
    snapshot.dividendos_brl = Decimal(str(desempenho.get("dividendos_brl") or "0"))
    snapshot.rentabilidade_percentual = Decimal(str(desempenho.get("rentabilidade_percentual") or "0"))
    snapshot.atualizado_em = datetime.now(timezone.utc)
    session.add(snapshot)
    session.commit()
    session.refresh(snapshot)
    return snapshot


def _snapshot_to_dict(snapshot: HistoricoInvestimentoMensal, periodo: str | None = None) -> dict:
    periodo_label = periodo or f"{snapshot.mes:02d}/{snapshot.ano}"
    return {
        "id": snapshot.id,
        "ano": snapshot.ano,
        "mes": snapshot.mes,
        "periodo": periodo_label,
        "patrimonio_atual_brl": snapshot.patrimonio_atual_brl,
        "total_aportado_brl": snapshot.total_aportado_brl,
        "lucro_prejuizo_brl": snapshot.lucro_prejuizo_brl,
        "dividendos_brl": snapshot.dividendos_brl,
        "rentabilidade_percentual": snapshot.rentabilidade_percentual,
    }


def _obter_ou_criar_ativo(session: Session, payload: MovimentoInvestimentoCreate) -> Ativo:
    if payload.ativo_id:
        ativo = session.get(Ativo, payload.ativo_id)
        if not ativo or not ativo.ativo:
            raise HTTPException(status_code=404, detail="Ativo nao encontrado.")
        corretora = _normalizar_texto(payload.corretora)
        if corretora:
            ativo.corretora = corretora
        if payload.tipo_controle:
            ativo.tipo_controle = payload.tipo_controle
        elif ativo.tipo_ativo in TIPOS_CONTROLE_VALOR:
            ativo.tipo_controle = TipoControleInvestimento.VALOR
        elif not getattr(ativo, "tipo_controle", None):
            ativo.tipo_controle = _tipo_controle_padrao(ativo.tipo_ativo)
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
        if payload.tipo_controle:
            ativo.tipo_controle = payload.tipo_controle
        elif ativo.tipo_ativo in TIPOS_CONTROLE_VALOR:
            ativo.tipo_controle = TipoControleInvestimento.VALOR
        elif not getattr(ativo, "tipo_controle", None):
            ativo.tipo_controle = _tipo_controle_padrao(ativo.tipo_ativo)
        session.add(ativo)
        return ativo
    moeda = _moeda_padrao(payload.tipo_ativo)
    ativo = Ativo(
        ticker=ticker,
        nome=_normalizar_texto(payload.nome) or _normalizar_texto(corretora) or payload.tipo_ativo.value.replace("_", " ").title(),
        tipo_ativo=payload.tipo_ativo,
        tipo_controle=payload.tipo_controle or _tipo_controle_padrao(payload.tipo_ativo),
        moeda=moeda,
        corretora=corretora or None,
    )
    session.add(ativo)
    session.flush()
    return ativo


def _movimento_entrada(tipo_movimento: TipoMovimentoInvestimento) -> bool:
    return tipo_movimento in [
        TipoMovimentoInvestimento.COMPRA,
        TipoMovimentoInvestimento.APORTE,
        TipoMovimentoInvestimento.AJUSTE,
    ]


def _movimento_saida(tipo_movimento: TipoMovimentoInvestimento) -> bool:
    return tipo_movimento in [TipoMovimentoInvestimento.VENDA, TipoMovimentoInvestimento.RESGATE]


def _valor_financeiro_compra(movimento: MovimentoInvestimento) -> Decimal:
    return _decimal(movimento.valor_total) + _decimal(movimento.taxas)


def _valor_financeiro_venda(movimento: MovimentoInvestimento) -> Decimal:
    return max(_decimal(movimento.valor_total) - _decimal(movimento.taxas), Decimal("0.00"))


def _efeito_conta_brl(
    tipo_movimento: TipoMovimentoInvestimento,
    valor_total: Decimal | None,
    taxas: Decimal | None,
) -> Decimal:
    if _movimento_entrada(tipo_movimento):
        return -(_decimal(valor_total) + _decimal(taxas))
    if _movimento_saida(tipo_movimento):
        return max(_decimal(valor_total) - _decimal(taxas), Decimal("0.00"))
    return Decimal("0.00")


def _marcador_conta_investimento(movimento_id: str) -> str:
    return f"{CONTA_SALDO_INVESTIMENTO_PREFIX}:{movimento_id}"


def _conta_saldo_aplicada(session: Session, movimento_id: str) -> bool:
    marcador = f"%{_marcador_conta_investimento(movimento_id)}%"
    return bool(session.exec(select(ContaSaldo).where(ContaSaldo.observacao.ilike(marcador))).first())


def _validar_conta_saldo_brl(conta: Conta) -> None:
    tipo_conta = conta.tipo_conta.value if hasattr(conta.tipo_conta, "value") else str(conta.tipo_conta)
    moeda = conta.moeda.value if hasattr(conta.moeda, "value") else str(conta.moeda)
    if not conta.ativa:
        raise HTTPException(status_code=422, detail="A conta selecionada esta inativa.")
    if moeda != Moeda.BRL.value:
        raise HTTPException(status_code=422, detail="Investimento nacional precisa usar uma conta em BRL.")
    if not conta.conta_gasto or not conta.entra_no_saldo_em_contas or tipo_conta not in TIPOS_CONTA_SALDO_BRL:
        raise HTTPException(
            status_code=422,
            detail="Selecione uma conta que entra no saldo em contas para movimentar investimento nacional.",
        )


def _aplicar_delta_saldo_conta(
    session: Session,
    conta_id: str | None,
    delta: Decimal,
    movimento: MovimentoInvestimento,
    descricao: str,
) -> None:
    if not conta_id or delta == Decimal("0.00"):
        return
    conta = session.get(Conta, conta_id)
    if not conta:
        raise HTTPException(status_code=404, detail="Conta do investimento nao encontrada.")
    _validar_conta_saldo_brl(conta)
    conta.saldo_atual_informado = _decimal(conta.saldo_atual_informado) + delta
    conta.atualizado_em = now_utc()
    session.add(conta)
    session.add(
        ContaSaldo(
            conta_id=conta.id,
            data_referencia=movimento.data_movimento,
            saldo_informado=conta.saldo_atual_informado,
            observacao=f"{_marcador_conta_investimento(movimento.id)} {descricao}",
        )
    )


def _aplicar_saldo_conta_criacao(session: Session, movimento: MovimentoInvestimento, descricao: str) -> None:
    if _conta_saldo_aplicada(session, movimento.id):
        return
    _aplicar_delta_saldo_conta(
        session,
        movimento.conta_id,
        _efeito_conta_brl(movimento.tipo_movimento, movimento.valor_total, movimento.taxas),
        movimento,
        descricao,
    )


def _reconciliar_saldo_conta_atualizacao(
    session: Session,
    movimento: MovimentoInvestimento,
    conta_id_anterior: str | None,
    efeito_anterior: Decimal,
) -> None:
    if _conta_saldo_aplicada(session, movimento.id):
        _aplicar_delta_saldo_conta(
            session,
            conta_id_anterior,
            -efeito_anterior,
            movimento,
            "Estorno do estado anterior.",
        )
    _aplicar_delta_saldo_conta(
        session,
        movimento.conta_id,
        _efeito_conta_brl(movimento.tipo_movimento, movimento.valor_total, movimento.taxas),
        movimento,
        "Atualizacao de movimento.",
    )


def _estornar_saldo_conta_exclusao(session: Session, movimento: MovimentoInvestimento) -> None:
    if not _conta_saldo_aplicada(session, movimento.id):
        return
    _aplicar_delta_saldo_conta(
        session,
        movimento.conta_id,
        -_efeito_conta_brl(movimento.tipo_movimento, movimento.valor_total, movimento.taxas),
        movimento,
        "Exclusao de movimento.",
    )


def _buscar_extrato_vinculado(session: Session, movimento_id: str) -> ExtratoDolar | None:
    return session.exec(
        select(ExtratoDolar).where(
            ExtratoDolar.ativo.is_(True),
            ExtratoDolar.origem == "INVESTIMENTO",
            ExtratoDolar.referencia_id == movimento_id,
        )
    ).first()


def _buscar_lancamento_investimento_vinculado(
    session: Session,
    movimento: MovimentoInvestimento,
    ativo: Ativo,
) -> Lancamento | None:
    vinculado = session.exec(
        select(Lancamento).where(
            Lancamento.ativo.is_(True),
            Lancamento.referencia_id == movimento.id,
            Lancamento.origem_sistema.in_(["INVESTIMENTO_COMPRA", "INVESTIMENTO_RESGATE"]),
        )
    ).first()
    if vinculado:
        return vinculado

    valor_financeiro = _valor_financeiro_compra(movimento)
    return session.exec(
        select(Lancamento).where(
            Lancamento.ativo.is_(True),
            Lancamento.referencia_id.is_(None),
            Lancamento.tipo == TipoLancamento.INVESTIMENTO,
            Lancamento.data_lancamento == movimento.data_movimento,
            Lancamento.valor == valor_financeiro,
            Lancamento.observacao.in_([movimento.observacao or "", f"Compra {ativo.ticker}"]),
        )
    ).first()


def _validar_fluxo_quantidade(session: Session, ativo_id: str, ignorar_movimento_id: str | None = None) -> None:
    ativo = session.get(Ativo, ativo_id)
    if not ativo:
        raise HTTPException(status_code=404, detail="Ativo nao encontrado.")
    movimentos = session.exec(
        select(MovimentoInvestimento)
        .where(MovimentoInvestimento.ativo_id == ativo_id)
        .order_by(MovimentoInvestimento.data_movimento, MovimentoInvestimento.criado_em)
    ).all()
    if _controle_por_valor(ativo):
        saldo = Decimal("0.00")
        for movimento in movimentos:
            if movimento.id == ignorar_movimento_id:
                continue
            if _movimento_entrada(movimento.tipo_movimento):
                saldo += _decimal(movimento.valor_total)
                continue
            if _movimento_saida(movimento.tipo_movimento):
                saldo -= _decimal(movimento.valor_total)
                if saldo < Decimal("0.00"):
                    raise HTTPException(
                        status_code=422,
                        detail="Esta alteracao deixaria o investimento negativo. Ajuste ou remova resgates posteriores primeiro.",
                    )
        return

    quantidade = Decimal("0.00")
    for movimento in movimentos:
        if movimento.id == ignorar_movimento_id:
            continue
        if _movimento_entrada(movimento.tipo_movimento):
            quantidade += _decimal(movimento.quantidade)
            continue
        if _movimento_saida(movimento.tipo_movimento):
            quantidade -= _decimal(movimento.quantidade)
            if quantidade < Decimal("0.00"):
                raise HTTPException(
                    status_code=422,
                    detail="Esta alteracao deixaria a posicao negativa. Ajuste ou remova vendas posteriores primeiro.",
                )


def _valor_total_por_valor(payload: MovimentoInvestimentoCreate | MovimentoInvestimentoUpdate) -> Decimal:
    valor_total = getattr(payload, "valor_total", None)
    if valor_total is not None:
        return valor_total

    preco_unitario = getattr(payload, "preco_unitario", None)
    quantidade = getattr(payload, "quantidade", None)
    if preco_unitario is not None and preco_unitario > 0:
        if quantidade is not None and quantidade > 0 and quantidade != Decimal("1.00"):
            return quantidade * preco_unitario
        return preco_unitario
    return Decimal("0.00")


def _normalizar_movimento(
    session: Session,
    ativo: Ativo,
    payload: MovimentoInvestimentoCreate | MovimentoInvestimentoUpdate,
) -> tuple[Decimal | None, Decimal | None, Decimal, Decimal]:
    taxas = _decimal(getattr(payload, "taxas", None))
    if taxas < 0:
        raise HTTPException(status_code=422, detail="Taxas nao podem ser negativas.")

    if _controle_por_valor(ativo):
        valor_total = _valor_total_por_valor(payload)
        if valor_total <= 0:
            raise HTTPException(status_code=422, detail="Valor deve ser maior que zero.")
        if _permite_null_quantidade(session):
            return None, None, valor_total, taxas
        return Decimal("0.00"), Decimal("0.00"), valor_total, taxas

    quantidade = getattr(payload, "quantidade", None)
    preco_unitario = getattr(payload, "preco_unitario", None)
    if quantidade is None or quantidade <= 0:
        raise HTTPException(status_code=422, detail="Quantidade deve ser maior que zero.")
    if preco_unitario is None or preco_unitario <= 0:
        raise HTTPException(status_code=422, detail="Preco unitario deve ser maior que zero.")
    return quantidade, preco_unitario, quantidade * preco_unitario, taxas


def _sincronizar_lancamento_investimento_brl(
    session: Session,
    ativo: Ativo,
    movimento: MovimentoInvestimento,
    lancamento_existente: Lancamento | None = None,
) -> None:
    lancamento = lancamento_existente
    # Um investimento nacional so afeta o saldo livre / saldo em contas quando o
    # usuario indica a conta de caixa de onde o dinheiro saiu (aporte) ou para
    # onde voltou (resgate). Posicoes ja existentes sem conta de origem ficam
    # neutras: nao reduzem nem aumentam o saldo livre.
    afeta_saldo = (
        _movimento_entrada(movimento.tipo_movimento) or _movimento_saida(movimento.tipo_movimento)
    ) and movimento.conta_id is not None
    if not afeta_saldo:
        if lancamento:
            lancamento.ativo = False
            lancamento.atualizado_em = now_utc()
            session.add(lancamento)
        return

    entrada = _movimento_entrada(movimento.tipo_movimento)
    valor_financeiro = _valor_financeiro_compra(movimento) if entrada else _valor_financeiro_venda(movimento)
    descricao_padrao = f"{'Aporte' if _controle_por_valor(ativo) and entrada else 'Compra'} {ativo.ticker}"
    if not entrada:
        descricao_padrao = f"{'Resgate' if _controle_por_valor(ativo) else 'Venda'} {ativo.ticker}"
    descricao = movimento.observacao or descricao_padrao
    tipo_lancamento = TipoLancamento.INVESTIMENTO if entrada else TipoLancamento.AJUSTE
    origem_sistema = "INVESTIMENTO_COMPRA" if entrada else "INVESTIMENTO_RESGATE"
    afeta_orcamento = entrada
    if not lancamento:
        lancamento = Lancamento(
            data_lancamento=movimento.data_movimento,
            tipo=tipo_lancamento,
            valor=valor_financeiro,
            valor_original=valor_financeiro,
            conta_id=movimento.conta_id,
            observacao=descricao,
            origem_sistema=origem_sistema,
            referencia_id=movimento.id,
            afeta_saldo_livre=True,
            afeta_orcamento=afeta_orcamento,
        )
    else:
        lancamento.data_lancamento = movimento.data_movimento
        lancamento.tipo = tipo_lancamento
        lancamento.valor = valor_financeiro
        lancamento.valor_original = valor_financeiro
        lancamento.conta_id = movimento.conta_id
        lancamento.observacao = descricao
        lancamento.origem_sistema = origem_sistema
        lancamento.referencia_id = movimento.id
        lancamento.afeta_saldo_livre = True
        lancamento.afeta_orcamento = afeta_orcamento
        lancamento.ativo = True
        lancamento.atualizado_em = now_utc()
    session.add(lancamento)


def _sincronizar_extrato_investimento_usd(
    session: Session,
    ativo: Ativo,
    movimento: MovimentoInvestimento,
    extrato_existente: ExtratoDolar | None = None,
) -> None:
    if _movimento_entrada(movimento.tipo_movimento):
        tipo_dolar = TipoMovimentoDolar.COMPRA_EXTERIOR
        valor_usd = _valor_financeiro_compra(movimento)
        entrada_usd = Decimal("0.00")
        saida_usd = valor_usd
        descricao = f"Compra {ativo.ticker}"
        if saldo_teorico_usd(session, ignorar_movimento_id=extrato_existente.id if extrato_existente else None) < valor_usd:
            raise HTTPException(
                status_code=422,
                detail="Saldo USD insuficiente para esta operacao. Verifique seu saldo em conta dolar.",
            )
    elif _movimento_saida(movimento.tipo_movimento):
        tipo_dolar = TipoMovimentoDolar.VENDA_EXTERIOR
        valor_usd = _valor_financeiro_venda(movimento)
        entrada_usd = valor_usd
        saida_usd = Decimal("0.00")
        descricao = f"Venda {ativo.ticker}"
    else:
        return

    descricao = movimento.observacao or descricao
    if not extrato_existente:
        registrar_movimento_dolar(
            session,
            tipo_dolar,
            valor_usd,
            valor_brl=Decimal("0.00"),
            descricao=descricao,
            origem="INVESTIMENTO",
            referencia_id=movimento.id,
            data_movimento=movimento.data_movimento,
        )
        return

    extrato_existente.data_movimento = movimento.data_movimento
    extrato_existente.tipo = tipo_dolar
    extrato_existente.descricao = descricao
    extrato_existente.entrada_usd = entrada_usd
    extrato_existente.saida_usd = saida_usd
    extrato_existente.valor_brl = Decimal("0.00")
    extrato_existente.cotacao_efetiva = Decimal("0.00")
    extrato_existente.origem = "INVESTIMENTO"
    extrato_existente.referencia_id = movimento.id
    extrato_existente.ativo = True
    extrato_existente.atualizado_em = now_utc()
    session.add(extrato_existente)


def _movimento_to_dict(session: Session, movimento: MovimentoInvestimento) -> dict:
    ativo = session.get(Ativo, movimento.ativo_id)
    if not ativo:
        raise HTTPException(status_code=404, detail="Ativo nao encontrado para movimento.")
    conta = session.get(Conta, movimento.conta_id) if movimento.conta_id else None
    valor_financeiro = _valor_financeiro_compra(movimento) if _movimento_entrada(movimento.tipo_movimento) else _valor_financeiro_venda(movimento)
    return {
        "id": movimento.id,
        "ativo_id": movimento.ativo_id,
        "ticker": ativo.ticker,
        "nome": ativo.nome,
        "tipo_ativo": ativo.tipo_ativo,
        "tipo_controle": _tipo_controle_efetivo(ativo),
        "tipo_movimento": movimento.tipo_movimento,
        "data_movimento": movimento.data_movimento,
        "quantidade": movimento.quantidade,
        "preco_unitario": movimento.preco_unitario,
        "valor_total": movimento.valor_total,
        "taxas": movimento.taxas,
        "valor_financeiro": valor_financeiro,
        "moeda": movimento.moeda,
        "corretora": ativo.corretora,
        "conta_id": movimento.conta_id,
        "conta_nome": conta.nome if conta else None,
        "observacao": movimento.observacao,
        "origem_dolar": ativo.tipo_ativo in TIPOS_EXTERIOR,
    }


def listar_movimentos(session: Session) -> list[dict]:
    movimentos = session.exec(
        select(MovimentoInvestimento).order_by(MovimentoInvestimento.data_movimento.desc(), MovimentoInvestimento.criado_em.desc())
    ).all()
    return [_movimento_to_dict(session, movimento) for movimento in movimentos if session.get(Ativo, movimento.ativo_id)]


def sincronizar_lancamentos_investimentos_brl_pendentes(session: Session) -> int:
    movimentos = session.exec(
        select(MovimentoInvestimento).order_by(MovimentoInvestimento.data_movimento, MovimentoInvestimento.criado_em)
    ).all()
    sincronizados = 0
    for movimento in movimentos:
        ativo = session.get(Ativo, movimento.ativo_id)
        if (
            not ativo
            or not ativo.ativo
            or ativo.tipo_ativo in TIPOS_EXTERIOR
            or ativo.tipo_ativo in TIPOS_OCULTOS_POSICAO
        ):
            continue
        lancamento = _buscar_lancamento_investimento_vinculado(session, movimento, ativo)
        _sincronizar_lancamento_investimento_brl(session, ativo, movimento, lancamento)
        sincronizados += 1
    if sincronizados:
        session.flush()
    return sincronizados


def atualizar_movimento(
    session: Session,
    movimento_id: str,
    payload: MovimentoInvestimentoUpdate,
) -> dict:
    movimento = session.get(MovimentoInvestimento, movimento_id)
    if not movimento:
        raise HTTPException(status_code=404, detail="Movimento de investimento nao encontrado.")
    ativo = session.get(Ativo, movimento.ativo_id)
    if not ativo or not ativo.ativo:
        raise HTTPException(status_code=404, detail="Ativo nao encontrado.")

    extrato_vinculado = _buscar_extrato_vinculado(session, movimento.id) if ativo.tipo_ativo in TIPOS_EXTERIOR else None
    lancamento_vinculado = (
        _buscar_lancamento_investimento_vinculado(session, movimento, ativo)
        if ativo.tipo_ativo not in TIPOS_EXTERIOR
        else None
    )
    conta_id_anterior = movimento.conta_id
    efeito_conta_anterior = _efeito_conta_brl(movimento.tipo_movimento, movimento.valor_total, movimento.taxas)
    data = payload.model_dump(exclude_unset=True)
    taxas = _decimal(data.get("taxas", movimento.taxas))
    if taxas < 0:
        raise HTTPException(status_code=422, detail="Taxas nao podem ser negativas.")
    if _controle_por_valor(ativo):
        valor_total = data.get("valor_total")
        if valor_total is None and "preco_unitario" in data:
            valor_total = data.get("preco_unitario")
        if valor_total is None:
            valor_total = movimento.valor_total
        if valor_total <= 0:
            raise HTTPException(status_code=422, detail="Valor deve ser maior que zero.")
        if _permite_null_quantidade(session):
            quantidade = None
            preco_unitario = None
        else:
            quantidade = Decimal("0.00")
            preco_unitario = Decimal("0.00")
    else:
        quantidade = data.get("quantidade", movimento.quantidade)
        preco_unitario = data.get("preco_unitario", movimento.preco_unitario)
        if quantidade is None or quantidade <= 0:
            raise HTTPException(status_code=422, detail="Quantidade deve ser maior que zero.")
        if preco_unitario is None or preco_unitario <= 0:
            raise HTTPException(status_code=422, detail="Preco unitario deve ser maior que zero.")
        valor_total = quantidade * preco_unitario

    movimento.data_movimento = data.get("data_movimento", movimento.data_movimento)
    movimento.quantidade = quantidade
    movimento.preco_unitario = preco_unitario
    movimento.taxas = taxas
    movimento.valor_total = valor_total
    movimento.conta_id = data.get("conta_id", movimento.conta_id)
    movimento.observacao = data.get("observacao", movimento.observacao)
    movimento.atualizado_em = now_utc()
    if "corretora" in data:
        ativo.corretora = _normalizar_texto(data.get("corretora")) or None
        session.add(ativo)
    session.add(movimento)

    _validar_fluxo_quantidade(session, ativo.id)
    if ativo.tipo_ativo in TIPOS_EXTERIOR:
        _sincronizar_extrato_investimento_usd(session, ativo, movimento, extrato_vinculado)
    else:
        _reconciliar_saldo_conta_atualizacao(session, movimento, conta_id_anterior, efeito_conta_anterior)
        _sincronizar_lancamento_investimento_brl(session, ativo, movimento, lancamento_vinculado)
    session.commit()
    session.refresh(movimento)
    return _movimento_to_dict(session, movimento)


def excluir_movimento(session: Session, movimento_id: str) -> None:
    movimento = session.get(MovimentoInvestimento, movimento_id)
    if not movimento:
        raise HTTPException(status_code=404, detail="Movimento de investimento nao encontrado.")
    ativo = session.get(Ativo, movimento.ativo_id)
    if not ativo:
        raise HTTPException(status_code=404, detail="Ativo nao encontrado.")

    _validar_fluxo_quantidade(session, ativo.id, ignorar_movimento_id=movimento.id)
    extrato_vinculado = _buscar_extrato_vinculado(session, movimento.id) if ativo.tipo_ativo in TIPOS_EXTERIOR else None
    lancamento_vinculado = (
        _buscar_lancamento_investimento_vinculado(session, movimento, ativo)
        if ativo.tipo_ativo not in TIPOS_EXTERIOR
        else None
    )
    if extrato_vinculado:
        extrato_vinculado.ativo = False
        extrato_vinculado.atualizado_em = now_utc()
        session.add(extrato_vinculado)
        session.flush()
        if saldo_teorico_usd(session) < Decimal("0.00"):
            session.rollback()
            raise HTTPException(
                status_code=422,
                detail="Nao foi possivel excluir: o saldo USD ficaria negativo depois desta remocao.",
            )
    if lancamento_vinculado:
        lancamento_vinculado.ativo = False
        lancamento_vinculado.atualizado_em = now_utc()
        session.add(lancamento_vinculado)
    if ativo.tipo_ativo not in TIPOS_EXTERIOR:
        _estornar_saldo_conta_exclusao(session, movimento)
    session.delete(movimento)
    session.commit()


def calcular_posicao(session: Session, ativo_id: str) -> dict:
    ativo = session.get(Ativo, ativo_id)
    if not ativo:
        raise HTTPException(status_code=404, detail="Ativo nao encontrado.")
    movimentos = session.exec(
        select(MovimentoInvestimento).where(MovimentoInvestimento.ativo_id == ativo_id)
        .order_by(MovimentoInvestimento.data_movimento, MovimentoInvestimento.criado_em)
    ).all()
    cotacao = _ultima_cotacao(session, ativo_id)
    if _controle_por_valor(ativo):
        saldo_valor = Decimal("0.00")
        for movimento in movimentos:
            if _movimento_entrada(movimento.tipo_movimento):
                saldo_valor += _decimal(movimento.valor_total)
            elif _movimento_saida(movimento.tipo_movimento):
                saldo_valor -= _decimal(movimento.valor_total)
        valor_aplicado = max(saldo_valor, Decimal("0.00"))
        valor_atual = cotacao.preco if cotacao and valor_aplicado > 0 else valor_aplicado
        return {
            "ativo_id": ativo_id,
            "tipo_controle": _tipo_controle_efetivo(ativo),
            "quantidade_atual": None,
            "preco_medio": None,
            "preco_atual": valor_atual,
            "valor_total_aportado": valor_aplicado,
            "valor_atual": valor_atual,
            "lucro_prejuizo": valor_atual - valor_aplicado,
            "data_cotacao": cotacao.data_cotacao if cotacao else None,
            "fonte_cotacao": cotacao.fonte if cotacao else None,
        }

    quantidade = Decimal("0.00")
    custo = Decimal("0.00")
    for movimento in movimentos:
        if movimento.tipo_movimento in [TipoMovimentoInvestimento.COMPRA, TipoMovimentoInvestimento.APORTE, TipoMovimentoInvestimento.AJUSTE]:
            quantidade += _decimal(movimento.quantidade)
            custo += _decimal(movimento.valor_total) + _decimal(movimento.taxas)
        elif movimento.tipo_movimento in [TipoMovimentoInvestimento.VENDA, TipoMovimentoInvestimento.RESGATE]:
            if quantidade > 0:
                preco_medio = custo / quantidade
                custo -= preco_medio * _decimal(movimento.quantidade)
            quantidade -= _decimal(movimento.quantidade)
    quantidade_atual = max(quantidade, Decimal("0.00"))
    custo_atual = max(custo, Decimal("0.00"))
    preco_medio = Decimal("0.00") if quantidade_atual <= 0 else custo_atual / quantidade_atual
    preco_atual = cotacao.preco if cotacao else preco_medio
    valor_atual = quantidade_atual * preco_atual
    return {
        "ativo_id": ativo_id,
        "tipo_controle": _tipo_controle_efetivo(ativo),
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
        posicao_aberta = (
            Decimal(str(posicao["valor_atual"])) > 0
            if _controle_por_valor(ativo)
            else _decimal(posicao["quantidade_atual"]) > 0
        )
        if posicao_aberta:
            tem_dividendos = _tipo_grupo(ativo.tipo_ativo) in TIPOS_COM_DIVIDENDOS
            dividendos_recebidos = _dividendos_recebidos(session, ativo.id) if tem_dividendos else Decimal("0.00")
            valor_aportado = Decimal(str(posicao["valor_total_aportado"]))
            resultado = Decimal(str(posicao["lucro_prejuizo"]))
            resultado_com_dividendos = resultado + dividendos_recebidos
            rentabilidade = Decimal("0.00") if valor_aportado <= 0 else (resultado / valor_aportado) * Decimal("100")
            rentabilidade_com_dividendos = (
                Decimal("0.00") if valor_aportado <= 0 else (resultado_com_dividendos / valor_aportado) * Decimal("100")
            )
            result.append(
                {
                    **posicao,
                    "ticker": ativo.ticker,
                    "nome": ativo.nome,
                    "tipo_ativo": ativo.tipo_ativo,
                    "tipo_controle": _tipo_controle_efetivo(ativo),
                    "moeda": ativo.moeda,
                    "corretora": ativo.corretora,
                    "rentabilidade_percentual": rentabilidade,
                    "tem_dividendos": tem_dividendos,
                    "dividendos_recebidos": dividendos_recebidos,
                    "lucro_prejuizo_com_dividendos": resultado_com_dividendos,
                    "rentabilidade_com_dividendos_percentual": rentabilidade_com_dividendos,
                }
            )
    return result


def calcular_desempenho(session: Session, registrar_historico: bool = True) -> dict:
    posicoes = listar_posicoes(session)
    cotacao_dolar, benchmark_dolar = _cotacao_dolar_desempenho(session)
    patrimonio_atual = Decimal("0.00")
    total_aportado = Decimal("0.00")
    lucro_prejuizo = Decimal("0.00")
    dividendos_total = Decimal("0.00")
    lucro_prejuizo_com_dividendos = Decimal("0.00")
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
        dividendos_original = Decimal(str(posicao.get("dividendos_recebidos") or "0"))
        valor_atual_brl = valor_atual_original * fator
        valor_aportado_brl = valor_aportado_original * fator
        resultado_brl = resultado_original * fator
        dividendos_brl = dividendos_recebidos_brl(session, posicao["ativo_id"]) if posicao.get("tem_dividendos") else Decimal("0.00")
        resultado_com_dividendos_brl = resultado_brl + dividendos_brl
        rentabilidade = Decimal("0.00")
        if valor_aportado_brl > 0:
            rentabilidade = (resultado_brl / valor_aportado_brl) * Decimal("100")
        rentabilidade_com_dividendos = Decimal("0.00")
        if valor_aportado_brl > 0:
            rentabilidade_com_dividendos = (resultado_com_dividendos_brl / valor_aportado_brl) * Decimal("100")

        patrimonio_atual += valor_atual_brl
        total_aportado += valor_aportado_brl
        lucro_prejuizo += resultado_brl
        dividendos_total += dividendos_brl
        lucro_prejuizo_com_dividendos += resultado_com_dividendos_brl
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
                "tipo_controle": posicao.get("tipo_controle"),
                "tipo_label": TIPO_ATIVO_LABELS.get(tipo, tipo.value),
                "moeda": moeda_valor,
                "corretora": posicao.get("corretora"),
                "valor_atual_brl": valor_atual_brl,
                "valor_atual_original": valor_atual_original,
                "total_aportado_brl": valor_aportado_brl,
                "resultado_brl": resultado_brl,
                "rentabilidade_percentual": rentabilidade,
                "dividendos_brl": dividendos_brl,
                "dividendos_original": dividendos_original,
                "resultado_com_dividendos_brl": resultado_com_dividendos_brl,
                "rentabilidade_com_dividendos_percentual": rentabilidade_com_dividendos,
                "tem_dividendos": bool(posicao.get("tem_dividendos")),
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
    rentabilidade_carteira_com_dividendos = (
        Decimal("0.00") if total_aportado <= 0 else (lucro_prejuizo_com_dividendos / total_aportado) * Decimal("100")
    )
    ativos_ordenados = sorted(ativos, key=lambda item: item["valor_atual_brl"], reverse=True)
    maiores_ganhos = sorted([item for item in ativos if item["resultado_brl"] > 0], key=lambda item: item["resultado_brl"], reverse=True)[:5]
    maiores_perdas = sorted([item for item in ativos if item["resultado_brl"] < 0], key=lambda item: item["resultado_brl"])[:5]

    resultado = {
        "patrimonio_atual_brl": patrimonio_atual,
        "total_aportado_brl": total_aportado,
        "lucro_prejuizo_brl": lucro_prejuizo,
        "rentabilidade_percentual": rentabilidade_carteira,
        "dividendos_brl": dividendos_total,
        "lucro_prejuizo_com_dividendos_brl": lucro_prejuizo_com_dividendos,
        "rentabilidade_com_dividendos_percentual": rentabilidade_carteira_com_dividendos,
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
    if registrar_historico:
        _registrar_snapshot_mensal(session, resultado)
    return resultado


def listar_historico_desempenho(session: Session, modo: str = "mensal") -> list[dict]:
    modo_normalizado = (modo or "mensal").lower()
    if modo_normalizado not in {"mensal", "anual"}:
        raise HTTPException(status_code=422, detail="Modo deve ser mensal ou anual.")

    calcular_desempenho(session, registrar_historico=True)
    snapshots = session.exec(
        select(HistoricoInvestimentoMensal).order_by(HistoricoInvestimentoMensal.ano, HistoricoInvestimentoMensal.mes)
    ).all()
    if modo_normalizado == "mensal":
        return [_snapshot_to_dict(snapshot) for snapshot in snapshots]

    por_ano: dict[int, HistoricoInvestimentoMensal] = {}
    for snapshot in snapshots:
        atual = por_ano.get(snapshot.ano)
        if atual is None or snapshot.mes >= atual.mes:
            por_ano[snapshot.ano] = snapshot
    return [_snapshot_to_dict(snapshot, periodo=str(ano)) for ano, snapshot in sorted(por_ano.items())]


def comprar(session: Session, payload: MovimentoInvestimentoCreate, commit: bool = True) -> MovimentoInvestimento:
    ativo = _obter_ou_criar_ativo(session, payload)
    if ativo.tipo_ativo in TIPOS_OCULTOS_POSICAO:
        raise HTTPException(status_code=422, detail="Dolar em caixa deve ser controlado pela aba Exterior/Dolar, nao como ativo.")
    moeda = _moeda_padrao(ativo.tipo_ativo)
    ativo.moeda = moeda
    session.add(ativo)
    quantidade, preco_unitario, valor_total, taxas = _normalizar_movimento(session, ativo, payload)
    valor_financeiro = valor_total + taxas
    movimento = MovimentoInvestimento(
        ativo_id=ativo.id,
        tipo_movimento=TipoMovimentoInvestimento.APORTE if _controle_por_valor(ativo) else TipoMovimentoInvestimento.COMPRA,
        data_movimento=payload.data_movimento or date.today(),
        quantidade=quantidade,
        preco_unitario=preco_unitario,
        valor_total=valor_total,
        taxas=taxas,
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
    else:
        _aplicar_saldo_conta_criacao(session, movimento, "Compra/aporte de investimento.")
        if commit:
            _sincronizar_lancamento_investimento_brl(session, ativo, movimento)
    if commit:
        session.commit()
        session.refresh(movimento)
    return movimento


def vender(session: Session, payload: MovimentoInvestimentoCreate) -> MovimentoInvestimento:
    if not payload.ativo_id:
        raise HTTPException(status_code=422, detail="Informe o ativo para venda.")
    ativo = session.get(Ativo, payload.ativo_id)
    if not ativo or not ativo.ativo:
        raise HTTPException(status_code=404, detail="Ativo nao encontrado.")
    posicao = calcular_posicao(session, payload.ativo_id)
    quantidade, preco_unitario, valor_total, taxas = _normalizar_movimento(session, ativo, payload)
    if _controle_por_valor(ativo):
        if valor_total > Decimal(str(posicao["valor_atual"])):
            raise HTTPException(status_code=422, detail="Resgate maior que valor atual bloqueado.")
    elif quantidade is not None and quantidade > posicao["quantidade_atual"]:
        raise HTTPException(status_code=422, detail="Venda maior que quantidade atual bloqueada.")
    moeda = _moeda_padrao(ativo.tipo_ativo)
    movimento = MovimentoInvestimento(
        ativo_id=payload.ativo_id,
        tipo_movimento=TipoMovimentoInvestimento.RESGATE if _controle_por_valor(ativo) else TipoMovimentoInvestimento.VENDA,
        data_movimento=payload.data_movimento or date.today(),
        quantidade=quantidade,
        preco_unitario=preco_unitario,
        valor_total=valor_total,
        taxas=taxas,
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
            max(valor_total - taxas, Decimal("0.00")),
            descricao=f"Venda {ativo.ticker}",
            origem="INVESTIMENTO",
            referencia_id=movimento.id,
            data_movimento=movimento.data_movimento,
        )
    else:
        _aplicar_saldo_conta_criacao(session, movimento, "Venda/resgate de investimento.")
        _sincronizar_lancamento_investimento_brl(session, ativo, movimento)
    session.commit()
    session.refresh(movimento)
    return movimento


def ativos_para_dividendos(session: Session) -> list[Ativo]:
    ativos = session.exec(select(Ativo).where(Ativo.ativo.is_(True)).order_by(Ativo.ticker)).all()
    return [
        ativo
        for ativo in ativos
        if ativo.tipo_ativo not in TIPOS_OCULTOS_POSICAO
        and not _controle_por_valor(ativo)
        and _decimal(calcular_posicao(session, ativo.id)["quantidade_atual"]) > 0
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
        raise HTTPException(status_code=422, detail="Cotacao automatica disponivel apenas para acoes BR, FIIs, ETFs BR, exterior e criptos.")
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
