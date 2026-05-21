from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.models.conta_futura import ContaFutura
from app.models.lancamento import Lancamento
from app.schemas.conta_futura_schema import ContaFuturaCreate, ContaFuturaUpdate, PagarContaFutura
from app.services.conta_futura_service import (
    atualizar_conta_futura,
    cancelar_conta_futura,
    criar_conta_futura,
    listar_contas_futuras,
    pagar_conta_futura,
)

router = APIRouter(prefix="/contas-futuras", tags=["contas-futuras"])


@router.get("")
def listar(incluir_pagas: bool = True, session: Session = Depends(get_session)) -> list[ContaFutura]:
    return listar_contas_futuras(session, incluir_pagas)


@router.post("")
def criar(payload: ContaFuturaCreate, session: Session = Depends(get_session)) -> ContaFutura:
    return criar_conta_futura(session, payload)


@router.put("/{conta_id}")
def atualizar(conta_id: str, payload: ContaFuturaUpdate, session: Session = Depends(get_session)) -> ContaFutura:
    return atualizar_conta_futura(session, conta_id, payload)


@router.post("/{conta_id}/pagar")
def pagar(conta_id: str, payload: PagarContaFutura, session: Session = Depends(get_session)) -> Lancamento:
    return pagar_conta_futura(session, conta_id, payload)


@router.delete("/{conta_id}", status_code=204)
def cancelar(conta_id: str, session: Session = Depends(get_session)) -> None:
    cancelar_conta_futura(session, conta_id)
