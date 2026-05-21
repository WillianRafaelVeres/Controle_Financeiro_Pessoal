from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.base import now_utc
from app.models.conta import Conta, ContaSaldo
from app.schemas.conta_schema import ContaCreate, ContaSaldoCreate, ContaUpdate

router = APIRouter(prefix="/contas", tags=["contas"])


@router.get("")
def listar(incluir_inativas: bool = False, session: Session = Depends(get_session)) -> list[Conta]:
    statement = select(Conta).order_by(Conta.nome)
    if not incluir_inativas:
        statement = statement.where(Conta.ativa.is_(True))
    return session.exec(statement).all()


@router.post("")
def criar(payload: ContaCreate, session: Session = Depends(get_session)) -> Conta:
    data = payload.model_dump()
    if data.get("saldo_atual_informado") is None:
        data["saldo_atual_informado"] = data.get("saldo_inicial")
    conta = Conta(**data)
    session.add(conta)
    session.flush()
    session.add(
        ContaSaldo(
            conta_id=conta.id,
            data_referencia=date.today(),
            saldo_informado=conta.saldo_atual_informado,
            observacao="Saldo inicial informado",
        )
    )
    session.commit()
    session.refresh(conta)
    return conta


@router.put("/{conta_id}")
def atualizar(conta_id: str, payload: ContaUpdate, session: Session = Depends(get_session)) -> Conta:
    conta = session.get(Conta, conta_id)
    if not conta:
        raise HTTPException(status_code=404, detail="Conta nao encontrada.")
    data = payload.model_dump(exclude_unset=True)
    saldo_informado = data.get("saldo_atual_informado")
    for key, value in data.items():
        setattr(conta, key, value)
    if conta.ativa:
        conta.inativado_em = None
    elif "ativa" in data:
        conta.inativado_em = now_utc()
    if saldo_informado is not None:
        session.add(
            ContaSaldo(
                conta_id=conta.id,
                data_referencia=date.today(),
                saldo_informado=saldo_informado,
                observacao="Atualizacao pelo cadastro da conta",
            )
        )
    session.add(conta)
    session.commit()
    session.refresh(conta)
    return conta


@router.post("/{conta_id}/atualizar-saldo")
def atualizar_saldo(conta_id: str, payload: ContaSaldoCreate, session: Session = Depends(get_session)) -> Conta:
    conta = session.get(Conta, conta_id)
    if not conta:
        raise HTTPException(status_code=404, detail="Conta nao encontrada.")
    conta.saldo_atual_informado = payload.saldo_informado
    conta.atualizado_em = now_utc()
    saldo = ContaSaldo(
        conta_id=conta.id,
        data_referencia=payload.data_referencia or date.today(),
        saldo_informado=payload.saldo_informado,
        observacao=payload.observacao,
    )
    session.add(conta)
    session.add(saldo)
    session.commit()
    session.refresh(conta)
    return conta


@router.get("/{conta_id}/historico-saldos")
def historico_saldos(conta_id: str, session: Session = Depends(get_session)) -> list[ContaSaldo]:
    conta = session.get(Conta, conta_id)
    if not conta:
        raise HTTPException(status_code=404, detail="Conta nao encontrada.")
    return session.exec(
        select(ContaSaldo)
        .where(ContaSaldo.conta_id == conta_id)
        .order_by(ContaSaldo.data_referencia.desc(), ContaSaldo.criado_em.desc())
    ).all()


@router.delete("/{conta_id}", status_code=204)
def excluir(conta_id: str, session: Session = Depends(get_session)) -> None:
    conta = session.get(Conta, conta_id)
    if not conta:
        raise HTTPException(status_code=404, detail="Conta nao encontrada.")
    conta.ativa = False
    conta.inativado_em = now_utc()
    session.add(conta)
    session.commit()
