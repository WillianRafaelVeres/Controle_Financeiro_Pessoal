from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.base import Moeda, TipoProvento
from app.models.dividendo import Dividendo
from app.models.investimento import Ativo
from app.schemas.dividendo_schema import DividendoCreate, DividendoUpdate
from app.services.cotacao_historica_service import buscar_cotacao_dolar_data
from app.services.dividendo_service import (
    desativar_movimentos_dolar_dividendo,
    registrar_movimento_dolar_dividendo,
)
from app.services.investimento_service import ativos_para_dividendos

router = APIRouter(prefix="/dividendos", tags=["dividendos"])


def _moeda_valor(moeda: Moeda | str | None) -> str:
    return moeda.value if hasattr(moeda, "value") else str(moeda or Moeda.BRL.value)


def _calcular_conversao(
    session: Session,
    valor: Decimal,
    moeda: Moeda | str,
    data_recebimento: date,
    cotacao_fallback: Decimal | None = None,
    data_cotacao_fallback: date | None = None,
    fonte_fallback: str | None = None,
) -> dict:
    if _moeda_valor(moeda) != Moeda.USD.value:
        return {
            "valor_brl": valor,
            "cotacao_brl": Decimal("1.00"),
            "data_cotacao": data_recebimento,
            "fonte_cotacao": "BRL",
        }

    try:
        cotacao = buscar_cotacao_dolar_data(session, data_recebimento)
    except Exception:
        cotacao = {}

    cotacao_brl = Decimal(str(cotacao.get("cotacao_brl") or "0"))
    data_cotacao = cotacao.get("data_cotacao")
    fonte = cotacao.get("fonte")

    if cotacao_brl <= 0 and cotacao_fallback is not None:
        fallback = Decimal(str(cotacao_fallback or "0"))
        if fallback > 0:
            cotacao_brl = fallback
            data_cotacao = data_cotacao_fallback or data_recebimento
            fonte = fonte_fallback or "COTACAO ANTERIOR PRESERVADA"

    if cotacao_brl <= 0:
        return {
            "valor_brl": Decimal("0.00"),
            "cotacao_brl": None,
            "data_cotacao": data_recebimento,
            "fonte_cotacao": "PENDENTE - SALVO SEM BLOQUEIO",
        }

    return {
        "valor_brl": valor * cotacao_brl,
        "cotacao_brl": cotacao_brl,
        "data_cotacao": data_cotacao if isinstance(data_cotacao, date) else data_recebimento,
        "fonte_cotacao": fonte or "CONTINGENCIA",
    }


@router.get("")
def listar(session: Session = Depends(get_session)) -> list[Dividendo]:
    return session.exec(select(Dividendo).order_by(Dividendo.data_recebimento.desc())).all()


@router.get("/ativos-disponiveis")
def ativos_disponiveis(session: Session = Depends(get_session)):
    return ativos_para_dividendos(session)


@router.post("")
def criar(payload: DividendoCreate, session: Session = Depends(get_session)) -> Dividendo:
    if not any(ativo.id == payload.ativo_id for ativo in ativos_para_dividendos(session)):
        raise HTTPException(status_code=422, detail="Dividendos so podem ser registrados para ativos em carteira.")
    data_recebimento = payload.data_recebimento or date.today()
    conversao = _calcular_conversao(session, payload.valor, payload.moeda, data_recebimento)
    dividendo = Dividendo(
        **{
            **payload.model_dump(exclude={"data_recebimento"}),
            "data_recebimento": data_recebimento,
            **conversao,
        }
    )
    session.add(dividendo)
    session.flush()
    ativo = session.get(Ativo, payload.ativo_id)
    registrar_movimento_dolar_dividendo(session, dividendo, ativo)
    session.commit()
    session.refresh(dividendo)
    return dividendo


@router.put("/{dividendo_id}")
def atualizar(dividendo_id: str, payload: DividendoUpdate, session: Session = Depends(get_session)) -> Dividendo:
    dividendo = session.get(Dividendo, dividendo_id)
    if not dividendo:
        raise HTTPException(status_code=404, detail="Dividendo nao encontrado.")

    dados = payload.model_dump(exclude_unset=True)
    novo_valor = dados.get("valor", dividendo.valor)
    nova_moeda = dados.get("moeda", dividendo.moeda)
    nova_data = dados.get("data_recebimento", dividendo.data_recebimento) or dividendo.data_recebimento
    cotacao_anterior = dividendo.cotacao_brl
    if (cotacao_anterior is None or cotacao_anterior <= 0) and dividendo.valor > 0 and dividendo.valor_brl > 0:
        cotacao_anterior = dividendo.valor_brl / dividendo.valor

    conversao = _calcular_conversao(
        session,
        novo_valor,
        nova_moeda,
        nova_data,
        cotacao_fallback=cotacao_anterior,
        data_cotacao_fallback=dividendo.data_cotacao,
        fonte_fallback=dividendo.fonte_cotacao,
    )

    for key, value in dados.items():
        setattr(dividendo, key, value)
    for key, value in conversao.items():
        setattr(dividendo, key, value)
    session.add(dividendo)
    session.flush()
    desativar_movimentos_dolar_dividendo(session, dividendo.id)
    registrar_movimento_dolar_dividendo(session, dividendo, session.get(Ativo, dividendo.ativo_id))
    session.commit()
    session.refresh(dividendo)
    return dividendo


@router.delete("/{dividendo_id}", status_code=204)
def excluir(dividendo_id: str, session: Session = Depends(get_session)) -> None:
    dividendo = session.get(Dividendo, dividendo_id)
    if not dividendo:
        raise HTTPException(status_code=404, detail="Dividendo nao encontrado.")
    desativar_movimentos_dolar_dividendo(session, dividendo.id)
    session.delete(dividendo)
    session.commit()
