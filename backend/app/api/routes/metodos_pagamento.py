from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.base import now_utc
from app.models.metodo_pagamento import MetodoPagamento
from app.schemas.metodo_pagamento_schema import MetodoPagamentoCreate, MetodoPagamentoUpdate

router = APIRouter(prefix="/metodos-pagamento", tags=["metodos-pagamento"])


@router.get("")
def listar(session: Session = Depends(get_session)) -> list[MetodoPagamento]:
    return session.exec(select(MetodoPagamento).where(MetodoPagamento.ativo.is_(True)).order_by(MetodoPagamento.nome)).all()


@router.post("")
def criar(payload: MetodoPagamentoCreate, session: Session = Depends(get_session)) -> MetodoPagamento:
    metodo = MetodoPagamento(nome=payload.nome.strip(), tipo_metodo=payload.tipo_metodo)
    session.add(metodo)
    session.commit()
    session.refresh(metodo)
    return metodo


@router.put("/{metodo_id}")
def atualizar(metodo_id: str, payload: MetodoPagamentoUpdate, session: Session = Depends(get_session)) -> MetodoPagamento:
    metodo = session.get(MetodoPagamento, metodo_id)
    if not metodo:
        raise HTTPException(status_code=404, detail="Metodo de pagamento nao encontrado.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(metodo, key, value)
    if metodo.ativo:
        metodo.inativado_em = None
        metodo.motivo_inativacao = None
    metodo.atualizado_em = now_utc()
    session.add(metodo)
    session.commit()
    session.refresh(metodo)
    return metodo


@router.delete("/{metodo_id}", status_code=204)
def excluir(metodo_id: str, session: Session = Depends(get_session)) -> None:
    metodo = session.get(MetodoPagamento, metodo_id)
    if not metodo:
        raise HTTPException(status_code=404, detail="Metodo de pagamento nao encontrado.")
    metodo.ativo = False
    metodo.inativado_em = now_utc()
    metodo.motivo_inativacao = "Metodo removido pelo usuario"
    metodo.atualizado_em = now_utc()
    session.add(metodo)
    session.commit()
