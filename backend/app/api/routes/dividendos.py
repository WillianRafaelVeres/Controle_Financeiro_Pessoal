from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.base import TipoProvento
from app.models.dividendo import Dividendo
from app.models.investimento import Ativo
from app.schemas.dividendo_schema import DividendoCreate, DividendoUpdate
from app.services.dividendo_service import (
    calcular_conversao_provento,
    desativar_movimentos_dolar_dividendo,
    registrar_movimento_dolar_dividendo,
)
from app.services.investimento_service import ativos_para_dividendos

router = APIRouter(prefix="/dividendos", tags=["dividendos"])


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
    conversao = calcular_conversao_provento(session, payload.valor, payload.moeda, data_recebimento)
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
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(dividendo, key, value)
    conversao = calcular_conversao_provento(session, dividendo.valor, dividendo.moeda, dividendo.data_recebimento)
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
