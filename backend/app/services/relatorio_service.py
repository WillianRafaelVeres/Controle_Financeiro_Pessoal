from sqlmodel import Session

from app.services.dashboard_service import graficos_dashboard
from app.services.orcamento_service import listar_orcamento_mes


def gastos_por_categoria(session: Session, ano: int, mes: int) -> list[dict]:
    return graficos_dashboard(session, ano, mes)["gastos_por_categoria"]


def orcado_vs_realizado(session: Session, ano: int, mes: int) -> list[dict]:
    return listar_orcamento_mes(session, ano, mes)

