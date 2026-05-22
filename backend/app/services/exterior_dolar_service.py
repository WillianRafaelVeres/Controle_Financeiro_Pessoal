from datetime import date, datetime, timedelta
from decimal import Decimal

import httpx
from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from app.models.base import TipoLancamento, TipoMovimentoDolar
from app.models.configuracao import Configuracao
from app.models.extrato_dolar import ExtratoDolar
from app.models.lancamento import Lancamento
from app.schemas.exterior_dolar_schema import MovimentoDolarCreate, SaldoDolarInformado


ENTRADAS = {
    TipoMovimentoDolar.ENVIO,
    TipoMovimentoDolar.VENDA_EXTERIOR,
    TipoMovimentoDolar.DIVIDENDO_EXTERIOR,
    TipoMovimentoDolar.AJUSTE_POSITIVO,
}

SAIDAS = {
    TipoMovimentoDolar.RETIRADA,
    TipoMovimentoDolar.COMPRA_EXTERIOR,
    TipoMovimentoDolar.AJUSTE_NEGATIVO,
}

COTACAO_USD_BRL_URL = "https://economia.awesomeapi.com.br/json/last/USD-BRL"
COTACAO_USD_BRL_HISTORICO_URL = "https://economia.awesomeapi.com.br/json/daily/USD-BRL/7"


def registrar_movimento_dolar(
    session: Session,
    tipo: TipoMovimentoDolar,
    valor_usd: Decimal,
    valor_brl: Decimal | None = None,
    descricao: str | None = None,
    origem: str = "MANUAL",
    referencia_id: str | None = None,
    data_movimento: date | None = None,
) -> ExtratoDolar:
    if valor_usd < 0:
        raise HTTPException(status_code=422, detail="Valor em USD nao pode ser negativo.")
    if valor_brl is not None and valor_brl < 0:
        raise HTTPException(status_code=422, detail="Valor em BRL nao pode ser negativo.")
    if tipo in SAIDAS and saldo_teorico_usd(session) < valor_usd:
        raise HTTPException(status_code=422, detail="Saldo USD insuficiente para esta saida.")
    brl = valor_brl or Decimal("0.00")
    cotacao = Decimal("0.00") if valor_usd == 0 or brl == 0 else brl / valor_usd
    movimento = ExtratoDolar(
        data_movimento=data_movimento or date.today(),
        tipo=tipo,
        descricao=descricao,
        entrada_usd=valor_usd if tipo in ENTRADAS else Decimal("0.00"),
        saida_usd=valor_usd if tipo in SAIDAS else Decimal("0.00"),
        valor_brl=brl,
        cotacao_efetiva=cotacao,
        origem=origem,
        referencia_id=referencia_id,
    )
    session.add(movimento)
    session.flush()
    return movimento


def registrar_manual(session: Session, payload: MovimentoDolarCreate) -> ExtratoDolar:
    if payload.tipo not in ENTRADAS and payload.tipo not in SAIDAS:
        raise HTTPException(status_code=422, detail="Tipo de movimento manual invalido.")
    movimento = registrar_movimento_dolar(
        session,
        payload.tipo,
        payload.valor_usd,
        valor_brl=payload.valor_brl,
        descricao=payload.descricao,
        origem="MANUAL",
        data_movimento=payload.data_movimento,
    )
    if payload.tipo == TipoMovimentoDolar.ENVIO and payload.valor_brl and payload.valor_brl > 0:
        session.add(
            Lancamento(
                data_lancamento=payload.data_movimento or date.today(),
                tipo=TipoLancamento.INVESTIMENTO,
                valor=payload.valor_brl,
                valor_original=payload.valor_brl,
                observacao=payload.descricao or "Envio de dolar",
                afeta_saldo_livre=True,
                afeta_orcamento=True,
            )
        )
    session.commit()
    session.refresh(movimento)
    return movimento


def saldo_teorico_usd(session: Session) -> Decimal:
    entradas = session.exec(
        select(func.sum(ExtratoDolar.entrada_usd)).where(ExtratoDolar.ativo.is_(True))
    ).one()
    saidas = session.exec(select(func.sum(ExtratoDolar.saida_usd)).where(ExtratoDolar.ativo.is_(True))).one()
    return Decimal(str(entradas or "0.00")) - Decimal(str(saidas or "0.00"))


def _get_config_decimal(session: Session, chave: str) -> Decimal:
    config = session.exec(select(Configuracao).where(Configuracao.chave == chave)).first()
    if not config or not config.valor:
        return Decimal("0.00")
    return Decimal(str(config.valor))


def _get_config_text(session: Session, chave: str) -> str | None:
    config = session.exec(select(Configuracao).where(Configuracao.chave == chave)).first()
    return config.valor if config and config.valor else None


def _set_config_decimal(session: Session, chave: str, value: Decimal) -> None:
    config = session.exec(select(Configuracao).where(Configuracao.chave == chave)).first()
    if not config:
        config = Configuracao(chave=chave, valor=str(value))
    else:
        config.valor = str(value)
    session.add(config)


def _set_config_text(session: Session, chave: str, value: str) -> None:
    config = session.exec(select(Configuracao).where(Configuracao.chave == chave)).first()
    if not config:
        config = Configuracao(chave=chave, valor=value)
    else:
        config.valor = value
    session.add(config)


def buscar_cotacao_dolar_atual(session: Session) -> dict:
    try:
        response = httpx.get(COTACAO_USD_BRL_URL, timeout=8)
        response.raise_for_status()
        item = response.json().get("USDBRL") or {}
        compra = Decimal(str(item.get("bid") or "0"))
        venda = Decimal(str(item.get("ask") or "0"))
        cotacao = venda if venda > 0 else compra
        if cotacao <= 0:
            raise ValueError("cotacao invalida")
    except Exception as exc:
        salva = _get_config_decimal(session, "dolar_cotacao_brl")
        if salva > 0:
            return {
                "cotacao_brl": salva,
                "compra_brl": salva,
                "venda_brl": salva,
                "variacao_brl": Decimal("0.00"),
                "percentual_variacao": Decimal("0.00"),
                "data_cotacao": _get_config_text(session, "dolar_cotacao_brl_data"),
                "fonte": "CONFIG",
                "erro": "Nao foi possivel atualizar a cotacao agora.",
            }
        raise HTTPException(status_code=502, detail="Nao foi possivel buscar cotacao do dolar agora.") from exc

    data_cotacao = str(item.get("create_date") or item.get("timestamp") or "")
    _set_config_decimal(session, "dolar_cotacao_brl", cotacao)
    _set_config_text(session, "dolar_cotacao_brl_data", data_cotacao)
    _set_config_text(session, "dolar_cotacao_brl_fonte", "AwesomeAPI")
    session.commit()
    return {
        "cotacao_brl": cotacao,
        "compra_brl": compra,
        "venda_brl": venda,
        "variacao_brl": Decimal(str(item.get("varBid") or "0")),
        "percentual_variacao": Decimal(str(item.get("pctChange") or "0")),
        "data_cotacao": data_cotacao,
        "fonte": "AwesomeAPI",
    }


def _data_item_cotacao(item: dict) -> date | None:
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


def buscar_cotacao_dolar_data(session: Session, data_referencia: date) -> dict:
    if data_referencia >= date.today():
        return buscar_cotacao_dolar_atual(session)

    inicio = (data_referencia - timedelta(days=7)).strftime("%Y%m%d")
    fim = data_referencia.strftime("%Y%m%d")
    try:
        response = httpx.get(
            COTACAO_USD_BRL_HISTORICO_URL,
            params={"start_date": inicio, "end_date": fim},
            timeout=8,
        )
        response.raise_for_status()
        itens = response.json() or []
        candidatos = []
        for item in itens:
            data_item = _data_item_cotacao(item)
            if data_item and data_item <= data_referencia:
                candidatos.append((data_item, item))
        if not candidatos and itens:
            candidatos.append((data_referencia, itens[0]))
        if not candidatos:
            raise ValueError("sem cotacao historica")
        data_cotacao, item = sorted(candidatos, key=lambda valor: valor[0])[-1]
        compra = Decimal(str(item.get("bid") or "0"))
        venda = Decimal(str(item.get("ask") or "0"))
        cotacao = venda if venda > 0 else compra
        if cotacao <= 0:
            raise ValueError("cotacao historica invalida")
        return {
            "cotacao_brl": cotacao,
            "compra_brl": compra,
            "venda_brl": venda,
            "variacao_brl": Decimal(str(item.get("varBid") or "0")),
            "percentual_variacao": Decimal(str(item.get("pctChange") or "0")),
            "data_cotacao": data_cotacao,
            "fonte": "AwesomeAPI",
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Nao foi possivel buscar cotacao historica do dolar.") from exc


def informar_saldo_real(session: Session, payload: SaldoDolarInformado) -> dict:
    if payload.saldo_usd < 0:
        raise HTTPException(status_code=422, detail="Saldo informado nao pode ser negativo.")
    _set_config_decimal(session, "dolar_saldo_informado_usd", payload.saldo_usd)
    if payload.cotacao_brl is not None:
        _set_config_decimal(session, "dolar_cotacao_brl", payload.cotacao_brl)
    session.commit()
    return resumo_dolar(session)


def listar_extrato(session: Session) -> list[dict]:
    movimentos = session.exec(
        select(ExtratoDolar).where(ExtratoDolar.ativo.is_(True)).order_by(ExtratoDolar.data_movimento, ExtratoDolar.criado_em)
    ).all()
    saldo = Decimal("0.00")
    linhas: list[dict] = []
    for item in movimentos:
        saldo += item.entrada_usd - item.saida_usd
        linhas.append(
            {
                "id": item.id,
                "data_movimento": item.data_movimento,
                "tipo": item.tipo,
                "descricao": item.descricao,
                "entrada_usd": item.entrada_usd,
                "saida_usd": item.saida_usd,
                "valor_brl": item.valor_brl,
                "cotacao_efetiva": item.cotacao_efetiva,
                "saldo_acumulado_usd": saldo,
                "origem": item.origem,
                "referencia_id": item.referencia_id,
            }
        )
    return list(reversed(linhas))


def resumo_dolar(session: Session) -> dict:
    teorico = saldo_teorico_usd(session)
    informado = _get_config_decimal(session, "dolar_saldo_informado_usd")
    cotacao = _get_config_decimal(session, "dolar_cotacao_brl")
    diferenca = informado - teorico
    total_brl_enviado = Decimal(str(session.exec(
        select(func.sum(ExtratoDolar.valor_brl)).where(
            ExtratoDolar.ativo.is_(True),
            ExtratoDolar.tipo == TipoMovimentoDolar.ENVIO,
        )
    ).one() or "0.00"))
    total_usd_recebido = Decimal(str(session.exec(
        select(func.sum(ExtratoDolar.entrada_usd)).where(
            ExtratoDolar.ativo.is_(True),
            ExtratoDolar.tipo == TipoMovimentoDolar.ENVIO,
        )
    ).one() or "0.00"))
    dolar_medio = Decimal("0.00") if total_usd_recebido == 0 else total_brl_enviado / total_usd_recebido
    return {
        "saldo_teorico_usd": teorico,
        "saldo_informado_usd": informado,
        "diferenca_conciliacao_usd": diferenca,
        "cotacao_brl": cotacao,
        "cotacao_brl_data": _get_config_text(session, "dolar_cotacao_brl_data"),
        "cotacao_brl_fonte": _get_config_text(session, "dolar_cotacao_brl_fonte"),
        "valor_estimado_brl": teorico * cotacao,
        "total_brl_enviado": total_brl_enviado,
        "total_usd_recebido": total_usd_recebido,
        "dolar_medio": dolar_medio,
        "status": "Conta dolar conciliada."
        if abs(diferenca) < Decimal("0.01")
        else "Existe diferenca entre o saldo teorico e o saldo informado.",
    }
