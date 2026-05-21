from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.services.financeiro_service import resumo_conciliacao
from app.services.dashboard_service import graficos_dashboard, resumo_dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/resumo")
def resumo(ano: int, mes: int, session: Session = Depends(get_session)) -> dict:
    return resumo_dashboard(session, ano, mes)


@router.get("/conciliacao")
def conciliacao(session: Session = Depends(get_session)) -> dict:
    return resumo_conciliacao(session)


@router.get("/graficos")
def graficos(ano: int, mes: int, session: Session = Depends(get_session)) -> dict:
    return graficos_dashboard(session, ano, mes)
