from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from decimal import Decimal

from app.core.database import get_session
from app.models.base import TipoAtivo, TipoProvento
from app.models.investimento import Ativo, MovimentoInvestimento
from app.schemas.investimento_schema import AtivoCreate, AtivoUpdate, CotacaoAtivoCreate, MovimentoInvestimentoCreate
from app.services.dividendo_service import listar_historico_proventos
from app.services.relatorio_service import projetar_patrimonio
from app.services.investimento_service import (
    atualizar_cotacao_automatica,
    atualizar_cotacoes_automaticas,
    calcular_desempenho,
    comprar,
    listar_historico_desempenho,
    listar_posicoes,
    registrar_cotacao,
    vender,
)

router = APIRouter(prefix="/investimentos", tags=["investimentos"])


@router.get("/ativos")
def listar_ativos(session: Session = Depends(get_session)) -> list[Ativo]:
    return session.exec(
        select(Ativo)
        .where(Ativo.ativo.is_(True), Ativo.tipo_ativo.notin_([TipoAtivo.DOLAR_CAIXA, TipoAtivo.OUTRO]))
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


@router.get("/desempenho/historico")
def historico_desempenho(modo: str = "mensal", session: Session = Depends(get_session)) -> list[dict]:
    return listar_historico_desempenho(session, modo)


@router.get("/desempenho/proventos")
def historico_proventos(
    modo: str = "mensal",
    tipo_ativo: TipoAtivo | None = None,
    ativo_id: str | None = None,
    tipo_provento: TipoProvento | None = None,
    session: Session = Depends(get_session),
) -> dict:
    return listar_historico_proventos(session, modo, tipo_ativo, ativo_id, tipo_provento)


@router.post("/comprar")
def comprar_ativo(payload: MovimentoInvestimentoCreate, session: Session = Depends(get_session)) -> MovimentoInvestimento:
    return comprar(session, payload)


@router.post("/vender")
def vender_ativo(payload: MovimentoInvestimentoCreate, session: Session = Depends(get_session)) -> MovimentoInvestimento:
    return vender(session, payload)


@router.get("/movimentos")
def movimentos(session: Session = Depends(get_session)) -> list[MovimentoInvestimento]:
    return session.exec(select(MovimentoInvestimento).order_by(MovimentoInvestimento.data_movimento.desc())).all()


@router.get("/projecao")
def projecao(
    aporte_mensal: Decimal = 1000,
    taxa_anual: Decimal = 10,
    meses: int = 60,
    session: Session = Depends(get_session),
) -> list[dict]:
    """
    Projeta crescimento de patrimônio dado um aporte mensal e taxa de retorno anual.
    
    Args:
        aporte_mensal: Valor do aporte mensal em R$
        taxa_anual: Taxa de retorno anual em % (ex: 10 para 10%)
        meses: Número de meses para projetar (ex: 60 para 5 anos)
    
    Returns:
        Lista com projeção mês a mês
    """
    return projetar_patrimonio(session, aporte_mensal, taxa_anual, meses)
