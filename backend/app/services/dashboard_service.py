from decimal import Decimal

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.base import NaturezaCategoria, TipoLancamento, month_bounds
from app.models.categoria import Categoria
from app.models.lancamento import Lancamento
from app.services.saldo_service import (
    ids_categorias_cartao_genericas,
)
from app.services.financeiro_service import resumo_painel


def _decimal(value: object) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))


def resumo_dashboard(session: Session, ano: int, mes: int) -> dict:
    return resumo_painel(session, ano, mes)


def graficos_dashboard(session: Session, ano: int, mes: int) -> dict:
    inicio, fim = month_bounds(ano, mes)
    categorias = session.exec(
        select(Categoria).where(Categoria.natureza == NaturezaCategoria.GASTO).order_by(Categoria.nome)
    ).all()
    categorias_por_id = {categoria.id: categoria for categoria in categorias}
    categorias_cartao = set(ids_categorias_cartao_genericas(session))
    totais_categoria = {categoria.id: Decimal("0.00") for categoria in categorias}
    gastos = Decimal("0.00")

    lancamentos_gastos = session.exec(
        select(Lancamento).where(
            Lancamento.ativo.is_(True),
            Lancamento.afeta_orcamento.is_(True),
            Lancamento.transferencia_interna.is_(False),
            Lancamento.data_lancamento >= inicio,
            Lancamento.data_lancamento < fim,
            Lancamento.tipo.in_([TipoLancamento.GASTO, TipoLancamento.SEPARAR]),
        )
    ).all()
    for lancamento in lancamentos_gastos:
        if lancamento.cartao_id and lancamento.categoria_id in categorias_cartao:
            continue
        gastos += lancamento.valor
        if lancamento.categoria_id in totais_categoria:
            totais_categoria[lancamento.categoria_id] += lancamento.valor

    gastos_categoria = [
        {"categoria": categoria.nome, "valor": totais_categoria.get(categoria.id, Decimal("0.00"))}
        for categoria in categorias_por_id.values()
    ]
    receitas = _decimal(
        session.exec(
            select(func.sum(Lancamento.valor)).where(
                Lancamento.ativo.is_(True),
                Lancamento.data_lancamento >= inicio,
                Lancamento.data_lancamento < fim,
                Lancamento.tipo == TipoLancamento.RECEITA,
            )
        ).one()
    )
    return {
        "gastos_por_categoria": [item for item in gastos_categoria if item["valor"] > 0],
        "receitas_vs_gastos": [{"nome": "Receitas", "valor": receitas}, {"nome": "Gastos", "valor": gastos}],
        "orcado_vs_realizado": [],
        "evolucao_saldo_livre": [],
    }
