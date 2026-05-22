from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.services.relatorio_service import (
    gastos_por_categoria,
    orcado_vs_realizado,
    gastos_por_metodo,
    evolucao_mensal,
    projetar_patrimonio,
    gerar_insights,
)

router = APIRouter(prefix="/relatorios", tags=["relatorios"])


@router.get("/gastos-por-categoria")
def rel_gastos_categoria(ano: int, mes: int, session: Session = Depends(get_session)) -> list[dict]:
    return gastos_por_categoria(session, ano, mes)


@router.get("/gastos-por-subcategoria")
def rel_gastos_subcategoria() -> list[dict]:
    return []


@router.get("/gastos-por-metodo")
def rel_gastos_metodo(ano: int, mes: int, session: Session = Depends(get_session)) -> list[dict]:
    return gastos_por_metodo(session, ano, mes)


@router.get("/gastos-por-cartao")
def rel_gastos_cartao() -> list[dict]:
    return []


@router.get("/orcado-vs-realizado")
def rel_orcado_vs_realizado(ano: int, mes: int, session: Session = Depends(get_session)) -> list[dict]:
    return orcado_vs_realizado(session, ano, mes)


@router.get("/evolucao-mensal")
def rel_evolucao_mensal(ano_inicio: int, mes_inicio: int, ano_fim: int, mes_fim: int, session: Session = Depends(get_session)) -> list[dict]:
    return evolucao_mensal(session, ano_inicio, mes_inicio, ano_fim, mes_fim)


@router.get("/investimentos")
def rel_investimentos() -> list[dict]:
    return []


@router.get("/dividendos")
def rel_dividendos() -> list[dict]:
    return []


@router.get("/insights")
def rel_insights(ano: int, mes: int, session: Session = Depends(get_session)) -> list[dict]:
    return gerar_insights(session, ano, mes)

