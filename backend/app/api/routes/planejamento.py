from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.services.financeiro_service import resumo_planejamento

router = APIRouter(prefix="/planejamento", tags=["planejamento"])


@router.get("/resumo")
def resumo(ano: int, mes: int, session: Session = Depends(get_session)) -> dict:
    return resumo_planejamento(session, ano, mes)
