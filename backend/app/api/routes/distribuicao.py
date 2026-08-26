from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.distribuicao_schema import DistribuicaoPlano, DistribuicaoPlanoCreate, DistribuicaoPlanoUpdate
from app.services.distribuicao_service import (
    atualizar_plano,
    criar_plano,
    excluir_plano,
    listar_planos,
)

router = APIRouter(prefix="/distribuicao", tags=["distribuicao"])


@router.get("/planos")
def listar(session: Session = Depends(get_session)) -> list[DistribuicaoPlano]:
    return listar_planos(session)


@router.post("/planos")
def criar(payload: DistribuicaoPlanoCreate, session: Session = Depends(get_session)) -> DistribuicaoPlano:
    return criar_plano(session, payload)


@router.put("/planos/{plano_id}")
def atualizar(plano_id: str, payload: DistribuicaoPlanoUpdate, session: Session = Depends(get_session)) -> DistribuicaoPlano:
    return atualizar_plano(session, plano_id, payload)


@router.delete("/planos/{plano_id}", status_code=204)
def excluir(plano_id: str, session: Session = Depends(get_session)) -> None:
    excluir_plano(session, plano_id)
