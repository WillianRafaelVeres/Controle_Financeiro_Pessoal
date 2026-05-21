from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.services.financeiro_service import resumo_painel

router = APIRouter(prefix="/painel", tags=["painel"])


@router.get("/resumo")
def resumo(ano: int, mes: int, session: Session = Depends(get_session)) -> dict:
    return resumo_painel(session, ano, mes)
