from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.base import now_utc
from app.models.cartao import Cartao
from app.schemas.cartao_schema import CartaoCreate, CartaoUpdate, InformarFatura, PagarFatura
from app.services.cartao_service import informar_fatura, pagar_fatura, resumo_cartao
from app.services.saldo_service import resumo_cartoes

router = APIRouter(prefix="/cartoes", tags=["cartoes"])


@router.get("")
def listar(session: Session = Depends(get_session)) -> list[dict]:
    return resumo_cartoes(session)


@router.post("")
def criar(payload: CartaoCreate, session: Session = Depends(get_session)) -> Cartao:
    cartao = Cartao(**payload.model_dump())
    session.add(cartao)
    session.commit()
    session.refresh(cartao)
    return cartao


@router.get("/{cartao_id}/resumo")
def obter_resumo(cartao_id: str, session: Session = Depends(get_session)) -> dict:
    return resumo_cartao(session, cartao_id)


@router.put("/{cartao_id}")
def atualizar(cartao_id: str, payload: CartaoUpdate, session: Session = Depends(get_session)) -> Cartao:
    cartao = session.get(Cartao, cartao_id)
    if not cartao:
        raise HTTPException(status_code=404, detail="Cartao nao encontrado.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(cartao, key, value)
    if cartao.ativo:
        cartao.inativado_em = None
        cartao.motivo_inativacao = None
    cartao.atualizado_em = now_utc()
    session.add(cartao)
    session.commit()
    session.refresh(cartao)
    return cartao


@router.delete("/{cartao_id}", status_code=204)
def excluir(cartao_id: str, session: Session = Depends(get_session)) -> None:
    cartao = session.get(Cartao, cartao_id)
    if not cartao:
        raise HTTPException(status_code=404, detail="Cartao nao encontrado.")
    cartao.ativo = False
    cartao.inativado_em = now_utc()
    cartao.motivo_inativacao = "Cartao removido pelo usuario"
    cartao.atualizado_em = now_utc()
    session.add(cartao)
    session.commit()


@router.post("/{cartao_id}/informar-fatura")
def informar(cartao_id: str, payload: InformarFatura, session: Session = Depends(get_session)) -> Cartao:
    return informar_fatura(session, cartao_id, payload.valor)


@router.post("/{cartao_id}/pagar-fatura")
def pagar(cartao_id: str, payload: PagarFatura, session: Session = Depends(get_session)):
    return pagar_fatura(session, cartao_id, payload)
