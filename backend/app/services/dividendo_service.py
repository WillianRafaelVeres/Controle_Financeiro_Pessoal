from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.base import Moeda, TipoAtivo, TipoMovimentoDolar, TipoProvento, now_utc
from app.models.dividendo import Dividendo
from app.models.extrato_dolar import ExtratoDolar
from app.models.investimento import Ativo
from app.services.exterior_dolar_service import buscar_cotacao_dolar_data, registrar_movimento_dolar, resumo_dolar


TIPOS_EXTERIOR_PROVENTOS = {TipoAtivo.EXTERIOR, TipoAtivo.ACAO_EXTERIOR, TipoAtivo.ETF_EXTERIOR}

TIPO_ATIVO_LABELS_PROVENTOS = {
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

TIPO_PROVENTO_LABELS = {
    TipoProvento.DIVIDENDO: "Dividendos",
    TipoProvento.JCP: "JCP",
    TipoProvento.RENDIMENTO_FII: "Rendimentos FII",
    TipoProvento.DIVIDENDO_EXTERIOR: "Dividendos exterior",
    TipoProvento.JUROS_RENDA_FIXA: "Juros",
    TipoProvento.OUTRO: "Outros",
}


def _moeda_valor(moeda: Moeda | str | None) -> str:
    if hasattr(moeda, "value"):
        return moeda.value
    return str(moeda or Moeda.BRL.value)


def provento_em_dolar(dividendo: Dividendo) -> bool:
    return _moeda_valor(dividendo.moeda) == Moeda.USD.value


def desativar_movimentos_dolar_dividendo(session: Session, dividendo_id: str) -> None:
    movimentos = session.exec(
        select(ExtratoDolar).where(ExtratoDolar.referencia_id == dividendo_id, ExtratoDolar.origem == "DIVIDENDO")
    ).all()
    for movimento in movimentos:
        movimento.ativo = False
        movimento.atualizado_em = now_utc()
        session.add(movimento)


def registrar_movimento_dolar_dividendo(
    session: Session,
    dividendo: Dividendo,
    ativo: Ativo | None,
    movimento_existente: ExtratoDolar | None = None,
) -> None:
    if not provento_em_dolar(dividendo) or not ativo:
        if movimento_existente:
            movimento_existente.ativo = False
            movimento_existente.atualizado_em = now_utc()
            session.add(movimento_existente)
        return

    descricao = dividendo.observacao or f"Dividendo exterior {ativo.ticker}"
    if movimento_existente:
        movimento_existente.data_movimento = dividendo.data_recebimento
        movimento_existente.tipo = TipoMovimentoDolar.DIVIDENDO_EXTERIOR
        movimento_existente.descricao = descricao
        movimento_existente.entrada_usd = dividendo.valor
        movimento_existente.saida_usd = Decimal("0.00")
        movimento_existente.valor_brl = dividendo.valor_brl
        movimento_existente.cotacao_efetiva = Decimal("0.00") if dividendo.valor == 0 or dividendo.valor_brl == 0 else dividendo.valor_brl / dividendo.valor
        movimento_existente.origem = "DIVIDENDO"
        movimento_existente.referencia_id = dividendo.id
        movimento_existente.ativo = True
        movimento_existente.atualizado_em = now_utc()
        session.add(movimento_existente)
        return

    registrar_movimento_dolar(
        session,
        TipoMovimentoDolar.DIVIDENDO_EXTERIOR,
        dividendo.valor,
        valor_brl=dividendo.valor_brl,
        descricao=descricao,
        origem="DIVIDENDO",
        referencia_id=dividendo.id,
        data_movimento=dividendo.data_recebimento,
    )


def sincronizar_movimentos_dolar_dividendos_pendentes(session: Session) -> int:
    dividendos = session.exec(select(Dividendo).order_by(Dividendo.data_recebimento, Dividendo.criado_em)).all()
    sincronizados = 0
    for dividendo in dividendos:
        ativo = session.get(Ativo, dividendo.ativo_id)
        movimento = session.exec(
            select(ExtratoDolar).where(ExtratoDolar.referencia_id == dividendo.id, ExtratoDolar.origem == "DIVIDENDO")
        ).first()
        if not provento_em_dolar(dividendo):
            if movimento and movimento.ativo:
                registrar_movimento_dolar_dividendo(session, dividendo, ativo, movimento)
                sincronizados += 1
            continue
        if movimento and movimento.ativo:
            continue
        registrar_movimento_dolar_dividendo(session, dividendo, ativo, movimento)
        sincronizados += 1
    if sincronizados:
        session.flush()
    return sincronizados


def _tipo_grupo_provento(tipo_ativo: TipoAtivo) -> TipoAtivo:
    if tipo_ativo in TIPOS_EXTERIOR_PROVENTOS:
        return TipoAtivo.EXTERIOR
    return tipo_ativo


def calcular_conversao_provento(
    session: Session,
    valor: Decimal,
    moeda: Moeda | str,
    data_recebimento: date,
) -> dict:
    moeda_normalizada = _moeda_valor(moeda)
    if moeda_normalizada == Moeda.USD.value:
        cotacao = buscar_cotacao_dolar_data(session, data_recebimento)
        cotacao_brl = Decimal(str(cotacao.get("cotacao_brl") or "0"))
        if cotacao_brl <= 0:
            raise HTTPException(status_code=422, detail="Cotacao do dolar invalida para converter o provento.")
        data_cotacao = cotacao.get("data_cotacao")
        return {
            "valor_brl": valor * cotacao_brl,
            "cotacao_brl": cotacao_brl,
            "data_cotacao": data_cotacao if isinstance(data_cotacao, date) else data_recebimento,
            "fonte_cotacao": cotacao.get("fonte") or "AwesomeAPI",
        }
    return {
        "valor_brl": valor,
        "cotacao_brl": Decimal("1.00"),
        "data_cotacao": data_recebimento,
        "fonte_cotacao": "BRL",
    }


def valor_dividendo_brl(session: Session, dividendo: Dividendo) -> Decimal:
    valor_brl = Decimal(str(dividendo.valor_brl or "0"))
    if valor_brl > 0:
        return valor_brl
    if _moeda_valor(dividendo.moeda) != Moeda.USD.value:
        return Decimal(str(dividendo.valor or "0"))
    try:
        conversao = calcular_conversao_provento(session, dividendo.valor, dividendo.moeda, dividendo.data_recebimento)
        return Decimal(str(conversao["valor_brl"]))
    except HTTPException:
        resumo = resumo_dolar(session)
        cotacao = Decimal(str(resumo.get("cotacao_brl") or "0"))
        return dividendo.valor * cotacao if cotacao > 0 else Decimal("0.00")


def dividendos_recebidos_brl(session: Session, ativo_id: str) -> Decimal:
    dividendos = session.exec(select(Dividendo).where(Dividendo.ativo_id == ativo_id)).all()
    return sum((valor_dividendo_brl(session, dividendo) for dividendo in dividendos), Decimal("0.00"))


def listar_historico_proventos(
    session: Session,
    modo: str = "mensal",
    tipo_ativo: TipoAtivo | None = None,
    ativo_id: str | None = None,
    tipo_provento: TipoProvento | None = None,
) -> dict:
    modo_normalizado = (modo or "mensal").lower()
    if modo_normalizado not in {"mensal", "anual"}:
        raise HTTPException(status_code=422, detail="Modo deve ser mensal ou anual.")

    ativos = {ativo.id: ativo for ativo in session.exec(select(Ativo)).all()}
    dividendos = session.exec(select(Dividendo).order_by(Dividendo.data_recebimento)).all()
    por_periodo: dict[tuple[int, int], dict] = {}
    por_tipo: dict[str, dict] = {}
    por_classe: dict[str, dict] = {}
    por_ativo: dict[str, dict] = {}
    total_brl = Decimal("0.00")
    quantidade = 0

    for dividendo in dividendos:
        ativo = ativos.get(dividendo.ativo_id)
        if not ativo:
            continue
        grupo = _tipo_grupo_provento(ativo.tipo_ativo)
        if tipo_ativo and _tipo_grupo_provento(tipo_ativo) != grupo:
            continue
        if ativo_id and dividendo.ativo_id != ativo_id:
            continue
        if tipo_provento and dividendo.tipo_provento != tipo_provento:
            continue

        valor_brl = valor_dividendo_brl(session, dividendo)
        ano = dividendo.data_recebimento.year
        mes = 0 if modo_normalizado == "anual" else dividendo.data_recebimento.month
        periodo_key = (ano, mes)
        periodo = por_periodo.setdefault(
            periodo_key,
            {
                "ano": ano,
                "mes": mes,
                "periodo": str(ano) if modo_normalizado == "anual" else f"{mes:02d}/{ano}",
                "total_brl": Decimal("0.00"),
                "quantidade": 0,
            },
        )
        periodo["total_brl"] += valor_brl
        periodo["quantidade"] += 1

        tipo_key = dividendo.tipo_provento.value if hasattr(dividendo.tipo_provento, "value") else str(dividendo.tipo_provento)
        tipo_item = por_tipo.setdefault(
            tipo_key,
            {
                "tipo_provento": tipo_key,
                "tipo_label": TIPO_PROVENTO_LABELS.get(dividendo.tipo_provento, tipo_key),
                "total_brl": Decimal("0.00"),
                "quantidade": 0,
            },
        )
        tipo_item["total_brl"] += valor_brl
        tipo_item["quantidade"] += 1

        classe_key = grupo.value
        classe_item = por_classe.setdefault(
            classe_key,
            {
                "tipo_ativo": classe_key,
                "tipo_label": TIPO_ATIVO_LABELS_PROVENTOS.get(grupo, grupo.value),
                "total_brl": Decimal("0.00"),
                "quantidade": 0,
            },
        )
        classe_item["total_brl"] += valor_brl
        classe_item["quantidade"] += 1

        ativo_item = por_ativo.setdefault(
            ativo.id,
            {
                "ativo_id": ativo.id,
                "ticker": ativo.ticker,
                "nome": ativo.nome,
                "tipo_ativo": grupo.value,
                "tipo_label": TIPO_ATIVO_LABELS_PROVENTOS.get(grupo, grupo.value),
                "corretora": ativo.corretora,
                "total_brl": Decimal("0.00"),
                "quantidade": 0,
            },
        )
        ativo_item["total_brl"] += valor_brl
        ativo_item["quantidade"] += 1
        total_brl += valor_brl
        quantidade += 1

    periodos = [por_periodo[key] for key in sorted(por_periodo)]
    maior_periodo = max(periodos, key=lambda item: item["total_brl"], default=None)
    media_periodo = Decimal("0.00") if not periodos else total_brl / Decimal(len(periodos))

    return {
        "modo": modo_normalizado,
        "total_brl": total_brl,
        "media_periodo_brl": media_periodo,
        "maior_periodo_brl": maior_periodo["total_brl"] if maior_periodo else Decimal("0.00"),
        "maior_periodo": maior_periodo["periodo"] if maior_periodo else None,
        "quantidade": quantidade,
        "por_periodo": periodos,
        "por_classe": sorted(por_classe.values(), key=lambda item: item["total_brl"], reverse=True),
        "por_tipo": sorted(por_tipo.values(), key=lambda item: item["total_brl"], reverse=True),
        "por_ativo": sorted(por_ativo.values(), key=lambda item: item["total_brl"], reverse=True),
    }
