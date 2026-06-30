from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.models.lancamento import Lancamento
from app.schemas.lancamento_schema import LancamentoCreate, LancamentoUpdate
from app.services.lancamento_service import (
    atualizar_lancamento,
    criar_lancamento,
    excluir_lancamento,
    listar_lancamentos,
    listar_opcoes_lancamento,
)

router = APIRouter(prefix="/lancamentos", tags=["lancamentos"])


@router.get("")
def listar(ano: int | None = None, mes: int | None = None, session: Session = Depends(get_session)) -> list[Lancamento]:
    return listar_lancamentos(session, ano, mes)


@router.get("/opcoes")
def opcoes(session: Session = Depends(get_session)) -> dict:
    return listar_opcoes_lancamento(session)


@router.post("")
def criar(payload: LancamentoCreate, session: Session = Depends(get_session)) -> Lancamento:
    return criar_lancamento(session, payload)


@router.get("/{lancamento_id}")
def obter(lancamento_id: str, session: Session = Depends(get_session)) -> Lancamento:
    lancamento = session.get(Lancamento, lancamento_id)
    if not lancamento or not lancamento.ativo:
        raise HTTPException(status_code=404, detail="Lancamento nao encontrado.")
    return lancamento


@router.put("/{lancamento_id}")
def atualizar(lancamento_id: str, payload: LancamentoUpdate, session: Session = Depends(get_session)) -> Lancamento:
    return atualizar_lancamento(session, lancamento_id, payload)


@router.delete("/{lancamento_id}", status_code=204)
def excluir(lancamento_id: str, session: Session = Depends(get_session)) -> None:
    excluir_lancamento(session, lancamento_id)

