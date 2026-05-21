from decimal import Decimal

from sqlmodel import Session, select

from app.models.base import NaturezaCategoria, TipoLancamento, month_bounds
from app.models.categoria import Categoria
from app.models.lancamento import Lancamento
from app.services.saldo_service import (
    calcular_gasto_real_mes,
)
from app.services.financeiro_service import resumo_painel


def resumo_dashboard(session: Session, ano: int, mes: int) -> dict:
    return resumo_painel(session, ano, mes)


def graficos_dashboard(session: Session, ano: int, mes: int) -> dict:
    inicio, fim = month_bounds(ano, mes)
    categorias = session.exec(select(Categoria).where(Categoria.natureza == NaturezaCategoria.GASTO).order_by(Categoria.nome)).all()
    gastos_categoria = [
        {"categoria": categoria.nome, "valor": calcular_gasto_real_mes(session, ano, mes, categoria.id)}
        for categoria in categorias
    ]
    receitas = sum(
        [
            item.valor
            for item in session.exec(
                select(Lancamento).where(
                    Lancamento.ativo.is_(True),
                    Lancamento.data_lancamento >= inicio,
                    Lancamento.data_lancamento < fim,
                    Lancamento.tipo == TipoLancamento.RECEITA,
                )
            ).all()
        ],
        Decimal("0.00"),
    )
    gastos = calcular_gasto_real_mes(session, ano, mes)
    return {
        "gastos_por_categoria": [item for item in gastos_categoria if item["valor"] > 0],
        "receitas_vs_gastos": [{"nome": "Receitas", "valor": receitas}, {"nome": "Gastos", "valor": gastos}],
        "orcado_vs_realizado": [],
        "evolucao_saldo_livre": [],
    }
