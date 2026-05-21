from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.services.relatorio_service import gastos_por_categoria, orcado_vs_realizado

router = APIRouter(prefix="/relatorios", tags=["relatorios"])


@router.get("/gastos-por-categoria")
def rel_gastos_categoria(ano: int, mes: int, session: Session = Depends(get_session)) -> list[dict]:
    return gastos_por_categoria(session, ano, mes)


@router.get("/gastos-por-subcategoria")
def rel_gastos_subcategoria() -> list[dict]:
    return []


@router.get("/gastos-por-metodo")
def rel_gastos_metodo() -> list[dict]:
    return []


@router.get("/gastos-por-cartao")
def rel_gastos_cartao() -> list[dict]:
    return []


@router.get("/orcado-vs-realizado")
def rel_orcado_vs_realizado(ano: int, mes: int, session: Session = Depends(get_session)) -> list[dict]:
    return orcado_vs_realizado(session, ano, mes)


@router.get("/evolucao-mensal")
def evolucao_mensal() -> list[dict]:
    return []


@router.get("/investimentos")
def rel_investimentos() -> list[dict]:
    return []


@router.get("/dividendos")
def rel_dividendos() -> list[dict]:
    return []

