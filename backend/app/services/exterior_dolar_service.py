from datetime import date, datetime, timedelta
from decimal import Decimal

import httpx
from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from app.models.base import TipoLancamento, TipoMovimentoDolar, now_utc
from app.models.configuracao import Configuracao
from app.models.extrato_dolar import ExtratoDolar
from app.models.lancamento import Lancamento
from app.schemas.exterior_dolar_schema import MovimentoDolarCreate, MovimentoDolarUpdate, SaldoDolarInformado


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
COTACAO_USD_BRL_HISTORICO_URL = "https://economia.awesomeapi.com.br/json/daily/USD-BRL/15"
COTACAO_FALLBACK_URL = "https://api.frankfurter.dev/v1/latest?from=USD&to=BRL"
COTACAO_FALLBACK_HISTORICO_URL = "https://api.frankfurter.dev/v1/{data}?from=USD&to=BRL"

# Prefixo das chaves de configuracao que guardam as cotacoes USD-BRL ja
# consultadas. Serve de cache local: uma vez conhecida a cotacao de um dia,
# editar um provento daquela data nunca mais depende da internet.
PREFIXO_CACHE_COTACAO_DOLAR = "dolar_cotacao_hist_"


def saldo_teorico_usd(session: Session, ignorar_movimento_id: str | None = None) -> Decimal:
    filtros = [ExtratoDolar.ativo.is_(True)]
    if ignorar_movimento_id:
        filtros.append(ExtratoDolar.id != ignorar_movimento_id)
    entradas = session.exec(select(func.sum(ExtratoDolar.entrada_usd)).where(*filtros)).one()
    saidas = session.exec(select(func.sum(ExtratoDolar.saida_usd)).where(*filtros)).one()
    return Decimal(str(entradas or "0.00")) - Decimal(str(saidas or "0.00"))


def _entrada_saida(tipo: TipoMovimentoDolar, valor_usd: Decimal) -> tuple[Decimal, Decimal]:
    return (
        valor_usd if tipo in ENTRADAS else Decimal("0.00"),
        valor_usd if tipo in SAIDAS else Decimal("0.00"),
    )


def _cotacao_efetiva(valor_usd: Decimal, valor_brl: Decimal) -> Decimal:
    return Decimal("0.00") if valor_usd == 0 or valor_brl == 0 else valor_brl / valor_usd


def _origem_lancamento_dolar(tipo: TipoMovimentoDolar) -> str | None:
    if tipo == TipoMovimentoDolar.ENVIO:
        return "DOLAR_ENVIO"
    if tipo == TipoMovimentoDolar.RETIRADA:
        return "DOLAR_RETIRADA"
    return None


def _tipo_lancamento_dolar(tipo: TipoMovimentoDolar) -> TipoLancamento | None:
    if tipo == TipoMovimentoDolar.ENVIO:
        return TipoLancamento.INVESTIMENTO
    if tipo == TipoMovimentoDolar.RETIRADA:
        return TipoLancamento.RECEITA
    return None


def _descricao_padrao_dolar(tipo: TipoMovimentoDolar) -> str:
    return "Envio de dolar" if tipo == TipoMovimentoDolar.ENVIO else "Retirada de dolar"


def _buscar_lancamento_vinculado(session: Session, movimento: ExtratoDolar) -> Lancamento | None:
    vinculado = session.exec(
        select(Lancamento).where(
            Lancamento.ativo.is_(True),
            Lancamento.referencia_id == movimento.id,
        )
    ).first()
    if vinculado:
        return vinculado

    origem = _origem_lancamento_dolar(movimento.tipo)
    tipo_lancamento = _tipo_lancamento_dolar(movimento.tipo)
    if not origem or not tipo_lancamento or movimento.valor_brl <= 0:
        return None

    return session.exec(
        select(Lancamento).where(
            Lancamento.ativo.is_(True),
            Lancamento.referencia_id.is_(None),
            Lancamento.origem_sistema == origem,
            Lancamento.tipo == tipo_lancamento,
            Lancamento.data_lancamento == movimento.data_movimento,
            Lancamento.valor == movimento.valor_brl,
        )
    ).first()


def _sincronizar_lancamento_brl(
    session: Session,
    movimento: ExtratoDolar,
    lancamento_existente: Lancamento | None = None,
) -> None:
    lancamento = lancamento_existente or _buscar_lancamento_vinculado(session, movimento)
    origem = _origem_lancamento_dolar(movimento.tipo)
    tipo_lancamento = _tipo_lancamento_dolar(movimento.tipo)
    if not origem or not tipo_lancamento or movimento.valor_brl <= 0:
        if lancamento:
            lancamento.ativo = False
            lancamento.atualizado_em = now_utc()
            session.add(lancamento)
        return

    descricao = movimento.descricao or _descricao_padrao_dolar(movimento.tipo)
    if not lancamento:
        lancamento = Lancamento(
            data_lancamento=movimento.data_movimento,
            tipo=tipo_lancamento,
            valor=movimento.valor_brl,
            valor_original=movimento.valor_brl,
            observacao=descricao,
            origem_sistema=origem,
            referencia_id=movimento.id,
            afeta_saldo_livre=True,
            afeta_orcamento=True,
        )
    else:
        lancamento.data_lancamento = movimento.data_movimento
        lancamento.tipo = tipo_lancamento
        lancamento.valor = movimento.valor_brl
        lancamento.valor_original = movimento.valor_brl
        lancamento.observacao = descricao
        lancamento.origem_sistema = origem
        lancamento.referencia_id = movimento.id
        lancamento.afeta_saldo_livre = True
        lancamento.afeta_orcamento = True
        lancamento.ativo = True
        lancamento.atualizado_em = now_utc()
    session.add(lancamento)


def _garantir_movimento_manual(movimento: ExtratoDolar | None) -> ExtratoDolar:
    if not movimento or not movimento.ativo:
        raise HTTPException(status_code=404, detail="Movimento em dolar nao encontrado.")
    if movimento.origem != "MANUAL":
        raise HTTPException(
            status_code=422,
            detail="Movimentos gerados por investimentos ou dividendos devem ser ajustados na tela de origem.",
        )
    return movimento


def _validar_movimento(tipo: TipoMovimentoDolar, valor_usd: Decimal, valor_brl: Decimal | None) -> None:
    if tipo not in ENTRADAS and tipo not in SAIDAS:
        raise HTTPException(status_code=422, detail="Tipo de movimento manual invalido.")
    if valor_usd < 0:
        raise HTTPException(status_code=422, detail="Valor em USD nao pode ser negativo.")
    if valor_brl is not None and valor_brl < 0:
        raise HTTPException(status_code=422, detail="Valor em BRL nao pode ser negativo.")


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
    _validar_movimento(tipo, valor_usd, valor_brl)
    if tipo in SAIDAS and saldo_teorico_usd(session) < valor_usd:
        raise HTTPException(
            status_code=422,
            detail="Saldo USD insuficiente para esta operacao. Verifique seu saldo em conta dolar.",
        )
    brl = valor_brl or Decimal("0.00")
    entrada_usd, saida_usd = _entrada_saida(tipo, valor_usd)
    movimento = ExtratoDolar(
        data_movimento=data_movimento or date.today(),
        tipo=tipo,
        descricao=descricao,
        entrada_usd=entrada_usd,
        saida_usd=saida_usd,
        valor_brl=brl,
        cotacao_efetiva=_cotacao_efetiva(valor_usd, brl),
        origem=origem,
        referencia_id=referencia_id,
    )
    session.add(movimento)
    session.flush()
    return movimento


def registrar_manual(session: Session, payload: MovimentoDolarCreate) -> ExtratoDolar:
    data_movimento = payload.data_movimento or date.today()
    movimento = registrar_movimento_dolar(
        session,
        payload.tipo,
        payload.valor_usd,
        valor_brl=payload.valor_brl,
        descricao=payload.descricao,
        origem="MANUAL",
        data_movimento=data_movimento,
    )
    if payload.tipo == TipoMovimentoDolar.ENVIO and payload.valor_brl and payload.valor_brl > 0:
        _sincronizar_lancamento_brl(session, movimento)
    if payload.tipo == TipoMovimentoDolar.RETIRADA and payload.valor_brl and payload.valor_brl > 0:
        _sincronizar_lancamento_brl(session, movimento)
    session.commit()
    session.refresh(movimento)
    return movimento


def atualizar_manual(session: Session, movimento_id: str, payload: MovimentoDolarUpdate) -> ExtratoDolar:
    movimento = _garantir_movimento_manual(session.get(ExtratoDolar, movimento_id))
    lancamento_vinculado = _buscar_lancamento_vinculado(session, movimento)
    data = payload.model_dump(exclude_unset=True)
    tipo = data.get("tipo", movimento.tipo)
    valor_usd = data.get("valor_usd", movimento.entrada_usd if movimento.tipo in ENTRADAS else movimento.saida_usd)
    valor_brl = data.get("valor_brl", movimento.valor_brl)
    _validar_movimento(tipo, valor_usd, valor_brl)
    if tipo in SAIDAS and saldo_teorico_usd(session, ignorar_movimento_id=movimento.id) < valor_usd:
        raise HTTPException(
            status_code=422,
            detail="Saldo USD insuficiente para esta operacao. Verifique seu saldo em conta dolar.",
        )

    brl = valor_brl or Decimal("0.00")
    entrada_usd, saida_usd = _entrada_saida(tipo, valor_usd)
    movimento.tipo = tipo
    movimento.data_movimento = data.get("data_movimento", movimento.data_movimento)
    movimento.descricao = data.get("descricao", movimento.descricao)
    movimento.entrada_usd = entrada_usd
    movimento.saida_usd = saida_usd
    movimento.valor_brl = brl
    movimento.cotacao_efetiva = _cotacao_efetiva(valor_usd, brl)
    movimento.atualizado_em = now_utc()
    session.add(movimento)
    _sincronizar_lancamento_brl(session, movimento, lancamento_vinculado)
    session.commit()
    session.refresh(movimento)
    return movimento


def excluir_manual(session: Session, movimento_id: str) -> None:
    movimento = _garantir_movimento_manual(session.get(ExtratoDolar, movimento_id))
    lancamento_vinculado = _buscar_lancamento_vinculado(session, movimento)
    movimento.ativo = False
    movimento.atualizado_em = now_utc()
    session.add(movimento)
    if lancamento_vinculado:
        lancamento_vinculado.ativo = False
        lancamento_vinculado.atualizado_em = now_utc()
        session.add(lancamento_vinculado)
    session.commit()


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


def _buscar_cotacao_awesomeapi() -> dict | None:
    try:
        response = httpx.get(
            COTACAO_USD_BRL_URL,
            timeout=8,
            headers={"User-Agent": "CentralFinanceira/1.0"},
            follow_redirects=True,
        )
        response.raise_for_status()
        item = response.json().get("USDBRL") or {}
        compra = Decimal(str(item.get("bid") or "0"))
        venda = Decimal(str(item.get("ask") or "0"))
        cotacao = venda if venda > 0 else compra
        if cotacao <= 0:
            return None
        data_cotacao = str(item.get("create_date") or item.get("timestamp") or "")
        return {
            "cotacao_brl": cotacao,
            "compra_brl": compra,
            "venda_brl": venda,
            "variacao_brl": Decimal(str(item.get("varBid") or "0")),
            "percentual_variacao": Decimal(str(item.get("pctChange") or "0")),
            "data_cotacao": data_cotacao,
            "fonte": "AwesomeAPI",
        }
    except Exception:
        return None


def _buscar_cotacao_frankfurter() -> dict | None:
    try:
        response = httpx.get(COTACAO_FALLBACK_URL, timeout=8, follow_redirects=True)
        response.raise_for_status()
        data = response.json()
        brl_rate = Decimal(str(data.get("rates", {}).get("BRL") or "0"))
        if brl_rate <= 0:
            return None
        return {
            "cotacao_brl": brl_rate,
            "compra_brl": brl_rate,
            "venda_brl": brl_rate,
            "variacao_brl": Decimal("0.00"),
            "percentual_variacao": Decimal("0.00"),
            "data_cotacao": str(data.get("date", "")),
            "fonte": "Frankfurter",
        }
    except Exception:
        return None


def buscar_cotacao_dolar_atual(session: Session) -> dict:
    resultado = _buscar_cotacao_awesomeapi() or _buscar_cotacao_frankfurter()

    if resultado:
        _set_config_decimal(session, "dolar_cotacao_brl", resultado["cotacao_brl"])
        _set_config_text(session, "dolar_cotacao_brl_data", resultado["data_cotacao"])
        _set_config_text(session, "dolar_cotacao_brl_fonte", resultado["fonte"])
        _cotacao_cache_salvar(session, {**resultado, "data_cotacao": date.today()})
        session.commit()
        return resultado

    # Usa valor salvo em cache se disponivel
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

    # Retorna indisponivel sem erro 502
    return {
        "cotacao_brl": Decimal("0.00"),
        "compra_brl": Decimal("0.00"),
        "venda_brl": Decimal("0.00"),
        "variacao_brl": Decimal("0.00"),
        "percentual_variacao": Decimal("0.00"),
        "data_cotacao": "",
        "fonte": "INDISPONIVEL",
        "erro": "Nao foi possivel buscar cotacao do dolar. Informe manualmente.",
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


def _chave_cache_cotacao(data_cotacao: date) -> str:
    # Data em ISO no fim da chave: a ordem alfabetica das chaves e a ordem
    # cronologica, o que permite buscar o dia util anterior por comparacao.
    return f"{PREFIXO_CACHE_COTACAO_DOLAR}{data_cotacao.isoformat()}"


def _cotacao_cache_buscar(session: Session, data_referencia: date) -> dict | None:
    """Cotacao ja consultada antes para a data (ou o dia util anterior mais proximo)."""
    registro = session.exec(
        select(Configuracao)
        .where(
            Configuracao.chave.like(f"{PREFIXO_CACHE_COTACAO_DOLAR}%"),
            Configuracao.chave >= _chave_cache_cotacao(data_referencia - timedelta(days=15)),
            Configuracao.chave <= _chave_cache_cotacao(data_referencia),
        )
        .order_by(Configuracao.chave.desc())
    ).first()
    if not registro or not registro.valor:
        return None

    preco_texto, _, fonte = registro.valor.partition("|")
    try:
        cotacao = Decimal(preco_texto)
        data_cotacao = date.fromisoformat(registro.chave.removeprefix(PREFIXO_CACHE_COTACAO_DOLAR))
    except (ArithmeticError, ValueError):
        return None
    if cotacao <= 0:
        return None

    return {
        "cotacao_brl": cotacao,
        "compra_brl": cotacao,
        "venda_brl": cotacao,
        "variacao_brl": Decimal("0.00"),
        "percentual_variacao": Decimal("0.00"),
        "data_cotacao": data_cotacao,
        "fonte": fonte or "CACHE",
    }


def _cotacao_cache_salvar(session: Session, resultado: dict) -> None:
    """Guarda a cotacao consultada para nao depender da internet nas proximas vezes.

    Fica em ``configuracoes`` (texto) e nao em ``cotacoes``, cuja coluna de preco
    tem so duas casas decimais -- insuficiente para uma taxa de cambio.
    """
    cotacao = Decimal(str(resultado.get("cotacao_brl") or "0"))
    data_cotacao = resultado.get("data_cotacao")
    if cotacao <= 0 or not isinstance(data_cotacao, date):
        return
    _set_config_text(session, _chave_cache_cotacao(data_cotacao), f"{cotacao}|{resultado.get('fonte') or ''}")


def _buscar_cotacao_awesomeapi_historico(data_referencia: date) -> dict | None:
    try:
        response = httpx.get(
            COTACAO_USD_BRL_HISTORICO_URL,
            params={
                "start_date": (data_referencia - timedelta(days=10)).strftime("%Y%m%d"),
                "end_date": data_referencia.strftime("%Y%m%d"),
            },
            timeout=8,
            headers={"User-Agent": "CentralFinanceira/1.0"},
            follow_redirects=True,
        )
        response.raise_for_status()
        payload = response.json()
        # A API responde com um objeto de erro (e nao uma lista) quando o
        # periodo nao existe ou o limite de requisicoes foi atingido.
        itens = [item for item in payload if isinstance(item, dict)] if isinstance(payload, list) else []
        candidatos = [
            (data_item, item)
            for item, data_item in ((item, _data_item_cotacao(item)) for item in itens)
            if data_item and data_item <= data_referencia
        ]
        if not candidatos:
            return None
        data_cotacao, item = sorted(candidatos, key=lambda valor: valor[0])[-1]
        compra = Decimal(str(item.get("bid") or "0"))
        venda = Decimal(str(item.get("ask") or "0"))
        cotacao = venda if venda > 0 else compra
        if cotacao <= 0:
            return None
        return {
            "cotacao_brl": cotacao,
            "compra_brl": compra,
            "venda_brl": venda,
            "variacao_brl": Decimal(str(item.get("varBid") or "0")),
            "percentual_variacao": Decimal(str(item.get("pctChange") or "0")),
            "data_cotacao": data_cotacao,
            "fonte": "AwesomeAPI",
        }
    except Exception:
        return None


def _buscar_cotacao_frankfurter_historico(data_referencia: date) -> dict | None:
    try:
        response = httpx.get(
            COTACAO_FALLBACK_HISTORICO_URL.format(data=data_referencia.strftime("%Y-%m-%d")),
            timeout=8,
            follow_redirects=True,
        )
        response.raise_for_status()
        payload = response.json() or {}
        cotacao = Decimal(str((payload.get("rates") or {}).get("BRL") or "0"))
        if cotacao <= 0:
            return None
        try:
            data_cotacao = date.fromisoformat(str(payload.get("date")))
        except ValueError:
            data_cotacao = data_referencia
        return {
            "cotacao_brl": cotacao,
            "compra_brl": cotacao,
            "venda_brl": cotacao,
            "variacao_brl": Decimal("0.00"),
            "percentual_variacao": Decimal("0.00"),
            "data_cotacao": data_cotacao,
            "fonte": "Frankfurter",
        }
    except Exception:
        return None


def buscar_cotacao_dolar_data(session: Session, data_referencia: date) -> dict:
    """Cotacao USD-BRL de uma data passada.

    Nunca levanta erro: um provento em dolar precisa poder ser lancado e editado
    mesmo com a API de cotacao fora do ar. A busca desce por cache local, APIs
    externas e, por ultimo, a ultima cotacao conhecida. Se nada existir, devolve
    zero com ``erro`` preenchido para quem chamou decidir o que fazer.
    """
    if data_referencia >= date.today():
        return buscar_cotacao_dolar_atual(session)

    cache = _cotacao_cache_buscar(session, data_referencia)
    if cache and cache["data_cotacao"] == data_referencia:
        return cache

    resultado = _buscar_cotacao_awesomeapi_historico(data_referencia) or _buscar_cotacao_frankfurter_historico(
        data_referencia
    )
    if resultado:
        _cotacao_cache_salvar(session, resultado)
        return resultado

    if cache:
        return cache

    salva = _get_config_decimal(session, "dolar_cotacao_brl")
    if salva > 0:
        return {
            "cotacao_brl": salva,
            "compra_brl": salva,
            "venda_brl": salva,
            "variacao_brl": Decimal("0.00"),
            "percentual_variacao": Decimal("0.00"),
            "data_cotacao": data_referencia,
            "fonte": "CONFIG",
            "erro": "Cotacao historica indisponivel. Usando a ultima cotacao conhecida.",
        }

    return {
        "cotacao_brl": Decimal("0.00"),
        "compra_brl": Decimal("0.00"),
        "venda_brl": Decimal("0.00"),
        "variacao_brl": Decimal("0.00"),
        "percentual_variacao": Decimal("0.00"),
        "data_cotacao": data_referencia,
        "fonte": "INDISPONIVEL",
        "erro": "Nao foi possivel buscar a cotacao desta data. Informe a cotacao manualmente.",
    }


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
                "editavel": item.origem == "MANUAL",
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
