from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.exterior_dolar_schema import MovimentoDolarCreate, MovimentoDolarUpdate, SaldoDolarInformado
from app.services.exterior_dolar_service import (
    atualizar_manual,
    buscar_cotacao_dolar_atual,
    excluir_manual,
    informar_saldo_real,
    listar_extrato,
    registrar_manual,
    resumo_dolar,
)

router = APIRouter(prefix="/exterior-dolar", tags=["exterior-dolar"])


@router.get("/resumo")
def resumo(session: Session = Depends(get_session)) -> dict:
    return resumo_dolar(session)


@router.get("/extrato")
def extrato(session: Session = Depends(get_session)) -> list[dict]:
    return listar_extrato(session)


@router.post("/movimentos")
def movimento(payload: MovimentoDolarCreate, session: Session = Depends(get_session)):
    return registrar_manual(session, payload)


@router.put("/movimentos/{movimento_id}")
def atualizar_movimento(movimento_id: str, payload: MovimentoDolarUpdate, session: Session = Depends(get_session)):
    return atualizar_manual(session, movimento_id, payload)


@router.delete("/movimentos/{movimento_id}", status_code=204)
def excluir_movimento(movimento_id: str, session: Session = Depends(get_session)) -> None:
    excluir_manual(session, movimento_id)


@router.post("/informar-saldo")
def informar_saldo(payload: SaldoDolarInformado, session: Session = Depends(get_session)) -> dict:
    return informar_saldo_real(session, payload)


@router.get("/cotacao-atual")
def cotacao_atual(session: Session = Depends(get_session)) -> dict:
    return buscar_cotacao_dolar_atual(session)
