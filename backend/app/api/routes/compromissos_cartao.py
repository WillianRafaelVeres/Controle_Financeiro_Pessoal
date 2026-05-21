from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.models.compromisso_cartao import CompromissoCartao
from app.schemas.compromisso_cartao_schema import CompromissoUpdate, SepararCompromisso
from app.services.cartao_service import listar_compromissos, separar_compromisso

router = APIRouter(prefix="/compromissos-cartao", tags=["compromissos-cartao"])


@router.get("")
def listar(cartao_id: str | None = None, session: Session = Depends(get_session)) -> list[CompromissoCartao]:
    return listar_compromissos(session, cartao_id)


@router.get("/{compromisso_id}")
def obter(compromisso_id: str, session: Session = Depends(get_session)) -> CompromissoCartao:
    compromisso = session.get(CompromissoCartao, compromisso_id)
    if not compromisso or not compromisso.ativo:
        raise HTTPException(status_code=404, detail="Compromisso de cartao nao encontrado.")
    return compromisso


@router.post("/{compromisso_id}/separar")
def separar(compromisso_id: str, payload: SepararCompromisso, session: Session = Depends(get_session)):
    return separar_compromisso(session, compromisso_id, payload)


@router.put("/{compromisso_id}")
def atualizar(compromisso_id: str, payload: CompromissoUpdate, session: Session = Depends(get_session)) -> CompromissoCartao:
    compromisso = session.get(CompromissoCartao, compromisso_id)
    if not compromisso or not compromisso.ativo:
        raise HTTPException(status_code=404, detail="Compromisso de cartao nao encontrado.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(compromisso, key, value)
    session.add(compromisso)
    session.commit()
    session.refresh(compromisso)
    return compromisso


@router.delete("/{compromisso_id}", status_code=204)
def excluir(compromisso_id: str, session: Session = Depends(get_session)) -> None:
    compromisso = session.get(CompromissoCartao, compromisso_id)
    if not compromisso:
        raise HTTPException(status_code=404, detail="Compromisso de cartao nao encontrado.")
    compromisso.ativo = False
    session.add(compromisso)
    session.commit()

