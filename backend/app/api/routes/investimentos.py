from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.base import TipoAtivo
from app.models.investimento import Ativo, MovimentoInvestimento
from app.schemas.investimento_schema import AtivoCreate, AtivoUpdate, CotacaoAtivoCreate, MovimentoInvestimentoCreate
from app.services.investimento_service import (
    atualizar_cotacao_automatica,
    atualizar_cotacoes_automaticas,
    calcular_desempenho,
    comprar,
    listar_posicoes,
    registrar_cotacao,
    vender,
)

router = APIRouter(prefix="/investimentos", tags=["investimentos"])


@router.get("/ativos")
def listar_ativos(session: Session = Depends(get_session)) -> list[Ativo]:
    return session.exec(
        select(Ativo)
        .where(Ativo.ativo.is_(True), Ativo.tipo_ativo != TipoAtivo.DOLAR_CAIXA)
        .order_by(Ativo.ticker)
    ).all()


@router.post("/ativos")
def criar_ativo(payload: AtivoCreate, session: Session = Depends(get_session)) -> Ativo:
    ativo = Ativo(**payload.model_dump())
    ativo.ticker = ativo.ticker.upper()
    session.add(ativo)
    session.commit()
    session.refresh(ativo)
    return ativo


@router.put("/ativos/{ativo_id}")
def atualizar_ativo(ativo_id: str, payload: AtivoUpdate, session: Session = Depends(get_session)) -> Ativo:
    ativo = session.get(Ativo, ativo_id)
    if not ativo:
        raise HTTPException(status_code=404, detail="Ativo nao encontrado.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(ativo, key, value.upper() if key == "ticker" and isinstance(value, str) else value)
    session.add(ativo)
    session.commit()
    session.refresh(ativo)
    return ativo


@router.delete("/ativos/{ativo_id}", status_code=204)
def excluir_ativo(ativo_id: str, session: Session = Depends(get_session)) -> None:
    ativo = session.get(Ativo, ativo_id)
    if not ativo:
        raise HTTPException(status_code=404, detail="Ativo nao encontrado.")
    ativo.ativo = False
    session.add(ativo)
    session.commit()


@router.post("/ativos/{ativo_id}/cotacao")
def informar_cotacao(ativo_id: str, payload: CotacaoAtivoCreate, session: Session = Depends(get_session)):
    return registrar_cotacao(session, ativo_id, payload.preco)


@router.post("/ativos/{ativo_id}/cotacao/auto")
def buscar_cotacao(ativo_id: str, session: Session = Depends(get_session)):
    return atualizar_cotacao_automatica(session, ativo_id)


@router.post("/cotacoes/atualizar")
def buscar_cotacoes(session: Session = Depends(get_session)):
    return atualizar_cotacoes_automaticas(session)


@router.get("/posicoes")
def posicoes(session: Session = Depends(get_session)) -> list[dict]:
    return listar_posicoes(session)


@router.get("/desempenho")
def desempenho(session: Session = Depends(get_session)) -> dict:
    return calcular_desempenho(session)


@router.post("/comprar")
def comprar_ativo(payload: MovimentoInvestimentoCreate, session: Session = Depends(get_session)) -> MovimentoInvestimento:
    return comprar(session, payload)


@router.post("/vender")
def vender_ativo(payload: MovimentoInvestimentoCreate, session: Session = Depends(get_session)) -> MovimentoInvestimento:
    return vender(session, payload)


@router.get("/movimentos")
def movimentos(session: Session = Depends(get_session)) -> list[MovimentoInvestimento]:
    return session.exec(select(MovimentoInvestimento).order_by(MovimentoInvestimento.data_movimento.desc())).all()
