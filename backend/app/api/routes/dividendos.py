from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.base import TipoMovimentoDolar, TipoProvento
from app.models.dividendo import Dividendo
from app.models.investimento import Ativo
from app.schemas.dividendo_schema import DividendoCreate, DividendoUpdate
from app.services.exterior_dolar_service import registrar_movimento_dolar
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
    dividendo = Dividendo(
        **{
            **payload.model_dump(exclude={"data_recebimento"}),
            "data_recebimento": payload.data_recebimento or date.today(),
        }
    )
    session.add(dividendo)
    session.flush()
    ativo = session.get(Ativo, payload.ativo_id)
    if payload.tipo_provento == TipoProvento.DIVIDENDO_EXTERIOR and payload.moeda == "USD" and ativo:
        registrar_movimento_dolar(
            session,
            TipoMovimentoDolar.DIVIDENDO_EXTERIOR,
            payload.valor,
            descricao=f"Dividendo exterior {ativo.ticker}",
            origem="DIVIDENDO",
            referencia_id=dividendo.id,
            data_movimento=dividendo.data_recebimento,
        )
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
    session.add(dividendo)
    session.commit()
    session.refresh(dividendo)
    return dividendo


@router.delete("/{dividendo_id}", status_code=204)
def excluir(dividendo_id: str, session: Session = Depends(get_session)) -> None:
    dividendo = session.get(Dividendo, dividendo_id)
    if not dividendo:
        raise HTTPException(status_code=404, detail="Dividendo nao encontrado.")
    session.delete(dividendo)
    session.commit()
