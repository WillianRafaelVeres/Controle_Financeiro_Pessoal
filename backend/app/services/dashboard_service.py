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


MESES_MEDIA_CATEGORIA = 6


def _mes_deslocado(ano: int, mes: int, quantidade: int) -> tuple[int, int]:
    indice = ano * 12 + (mes - 1) - quantidade
    return indice // 12, indice % 12 + 1


def _totais_gasto_categoria_periodo(
    session: Session,
    inicio,
    fim,
    categorias_cartao: set[str],
    categoria_ids: list[str],
) -> tuple[dict[str, Decimal], Decimal]:
    totais = {categoria_id: Decimal("0.00") for categoria_id in categoria_ids}
    total_geral = Decimal("0.00")
    lancamentos = session.exec(
        select(Lancamento).where(
            Lancamento.ativo.is_(True),
            Lancamento.afeta_orcamento.is_(True),
            Lancamento.transferencia_interna.is_(False),
            Lancamento.data_lancamento >= inicio,
            Lancamento.data_lancamento < fim,
            Lancamento.tipo.in_([TipoLancamento.GASTO, TipoLancamento.SEPARAR]),
        )
    ).all()
    for lancamento in lancamentos:
        if lancamento.cartao_id and lancamento.categoria_id in categorias_cartao:
            continue
        total_geral += lancamento.valor
        if lancamento.categoria_id in totais:
            totais[lancamento.categoria_id] += lancamento.valor
    return totais, total_geral


def resumo_dashboard(session: Session, ano: int, mes: int) -> dict:
    return resumo_painel(session, ano, mes)


def graficos_dashboard(session: Session, ano: int, mes: int) -> dict:
    inicio, fim = month_bounds(ano, mes)
    categorias = session.exec(
        select(Categoria).where(Categoria.natureza == NaturezaCategoria.GASTO).order_by(Categoria.nome)
    ).all()
    categoria_ids = [categoria.id for categoria in categorias]
    categorias_cartao = set(ids_categorias_cartao_genericas(session))

    totais_categoria, gastos = _totais_gasto_categoria_periodo(session, inicio, fim, categorias_cartao, categoria_ids)

    ano_media, mes_media = _mes_deslocado(ano, mes, MESES_MEDIA_CATEGORIA)
    inicio_media, _ = month_bounds(ano_media, mes_media)
    totais_media, _ = _totais_gasto_categoria_periodo(session, inicio_media, inicio, categorias_cartao, categoria_ids)

    gastos_categoria = [
        {
            "categoria": categoria.nome,
            "valor": totais_categoria.get(categoria.id, Decimal("0.00")),
            "media": (totais_media.get(categoria.id, Decimal("0.00")) / MESES_MEDIA_CATEGORIA).quantize(Decimal("0.01")),
        }
        for categoria in categorias
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
