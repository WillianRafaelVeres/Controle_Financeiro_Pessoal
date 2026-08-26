from datetime import date, datetime, timedelta
from decimal import Decimal
import logging
from sqlalchemy import func
from sqlmodel import Session, select

from app.models.base import (
    Moeda,
    TipoAtivo,
    TipoControleInvestimento,
    TipoMovimentoInvestimento,
    month_bounds,
)
from app.models.cotacao import Cotacao
from app.models.dividendo import Dividendo
from app.models.historico_posicao import HistoricoPosicaoInvestimentoMensal
from app.models.investimento import Ativo, MovimentoInvestimento
from app.services.exterior_dolar_service import buscar_cotacao_dolar_data
from app.services.investimento_service import (
    TIPOS_CONTROLE_VALOR,
    TIPOS_EXTERIOR,
    _buscar_preco_cripto_brl,
    _buscar_preco_tesouro,
    _buscar_preco_yahoo,
    _controle_por_valor,
    _decimal,
)

logger = logging.getLogger(__name__)


def reconstruir_posicao_ativo_na_data(
    session: Session,
    ativo: Ativo,
    data_referencia: date,
) -> tuple[Decimal, Decimal, Decimal, str]:
    """Calcula (quantidade, preco_unitario_brl, valor_total_brl, qualidade_dado) de um ativo em data_referencia.
    
    Considera APENAS movimentos com data_movimento <= data_referencia.
    """
    movimentos = session.exec(
        select(MovimentoInvestimento).where(
            MovimentoInvestimento.ativo_id == ativo.id,
            MovimentoInvestimento.data_movimento <= data_referencia,
        )
    ).all()

    if not movimentos:
        return Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), "COMPLETO"

    is_valor = _controle_por_valor(ativo)

    if is_valor:
        # Ativo por valor (caixinhas, reserva, etc)
        saldo_brl = Decimal("0.00")
        for mov in movimentos:
            valor = mov.valor_total
            if mov.moeda == Moeda.USD:
                tx = buscar_cotacao_dolar_data(session, mov.data_movimento)
                valor = valor * (tx if tx > 0 else Decimal("1.00"))
            
            if mov.tipo_movimento in {TipoMovimentoInvestimento.COMPRA, TipoMovimentoInvestimento.APORTE}:
                saldo_brl += valor
            elif mov.tipo_movimento in {TipoMovimentoInvestimento.VENDA, TipoMovimentoInvestimento.RESGATE}:
                saldo_brl -= valor
            elif mov.tipo_movimento == TipoMovimentoInvestimento.AJUSTE:
                # Ajuste positivo aumenta, negativo reduz (depende de sinal ou valor)
                saldo_brl += valor

        saldo_brl = max(Decimal("0.00"), saldo_brl)
        return Decimal("1.00") if saldo_brl > 0 else Decimal("0.00"), saldo_brl, saldo_brl, "COMPLETO"

    # Ativo por quantidade
    qtd_total = Decimal("0.00")
    custo_total_brl = Decimal("0.00")

    for mov in movimentos:
        qtd = _decimal(mov.quantidade)
        valor_mov = mov.valor_total
        if mov.moeda == Moeda.USD:
            tx = buscar_cotacao_dolar_data(session, mov.data_movimento)
            valor_mov = valor_mov * (tx if tx > 0 else Decimal("1.00"))

        if mov.tipo_movimento in {TipoMovimentoInvestimento.COMPRA, TipoMovimentoInvestimento.APORTE}:
            qtd_total += qtd
            custo_total_brl += valor_mov
        elif mov.tipo_movimento in {TipoMovimentoInvestimento.VENDA, TipoMovimentoInvestimento.RESGATE}:
            if qtd_total > 0:
                proporcao = min(Decimal("1.00"), qtd / qtd_total)
                custo_total_brl -= (custo_total_brl * proporcao)
            qtd_total -= qtd

    qtd_total = max(Decimal("0.00"), qtd_total)
    if qtd_total == 0:
        return Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), "COMPLETO"

    # Preço do ativo na data de referência
    # 1. Tentar buscar em Cotacao registrada na base no próprio dia ou anterior
    cotacao_reg = session.exec(
        select(Cotacao)
        .where(
            Cotacao.ativo_id == ativo.id,
            Cotacao.data_cotacao <= data_referencia,
        )
        .order_by(Cotacao.data_cotacao.desc())
    ).first()

    qualidade = "COMPLETO"
    preco_unitario = None

    if cotacao_reg:
        preco_unitario = cotacao_reg.preco
    else:
        # 2. Tentar provedor automático se data_referencia é hoje ou recente
        if (date.today() - data_referencia).days <= 3:
            if ativo.tipo_ativo in {TipoAtivo.ACAO_BR, TipoAtivo.FII, TipoAtivo.ETF_BR, TipoAtivo.EXTERIOR, TipoAtivo.ACAO_EXTERIOR, TipoAtivo.ETF_EXTERIOR}:
                preco_unitario = _buscar_preco_yahoo(ativo)
            elif ativo.tipo_ativo == TipoAtivo.CRIPTO:
                preco_unitario = _buscar_preco_cripto_brl(session, ativo)
            elif ativo.tipo_ativo == TipoAtivo.RENDA_FIXA:
                preco_unitario = _buscar_preco_tesouro(ativo)

    if preco_unitario is None or preco_unitario <= 0:
        # Fallback: custo médio ponderado histórico
        if qtd_total > 0 and custo_total_brl > 0:
            preco_unitario = custo_total_brl / qtd_total
            qualidade = "PARCIAL"
        else:
            preco_unitario = Decimal("0.00")
            qualidade = "PARCIAL"

    # Câmbio USD se ativo for em USD
    tx_usd = Decimal("1.00")
    if ativo.moeda == Moeda.USD or ativo.tipo_ativo in TIPOS_EXTERIOR:
        tx_usd = buscar_cotacao_dolar_data(session, data_referencia)
        if tx_usd <= 0:
            tx_usd = Decimal("1.00")
            qualidade = "PARCIAL"

    valor_total_brl = qtd_total * preco_unitario * tx_usd
    return qtd_total, preco_unitario * tx_usd, valor_total_brl, qualidade


def garantir_backfill_historico_posicoes(session: Session) -> None:
    """Percorre todos os ativos e gera os snapshots mensais faltantes."""
    ativos = session.exec(select(Ativo)).all()
    if not ativos:
        return

    hoje = date.today()
    novos_snapshots = []

    for ativo in ativos:
        # Encontrar o primeiro movimento do ativo
        primeiro_mov = session.exec(
            select(MovimentoInvestimento)
            .where(MovimentoInvestimento.ativo_id == ativo.id)
            .order_by(MovimentoInvestimento.data_movimento.asc())
        ).first()

        if not primeiro_mov:
            continue

        dt_inicio = primeiro_mov.data_movimento
        ano_curr, mes_curr = dt_inicio.year, dt_inicio.month
        ano_fim, mes_fim = hoje.year, hoje.month

        curr_ano, curr_mes = ano_curr, mes_curr

        while (curr_ano < ano_fim) or (curr_ano == ano_fim and curr_mes <= mes_fim):
            # Verificar se snapshot já existe
            existente = session.exec(
                select(HistoricoPosicaoInvestimentoMensal).where(
                    HistoricoPosicaoInvestimentoMensal.ativo_id == ativo.id,
                    HistoricoPosicaoInvestimentoMensal.ano == curr_ano,
                    HistoricoPosicaoInvestimentoMensal.mes == curr_mes,
                )
            ).first()

            # Data de fechamento do mês
            d_ini, d_fim = month_bounds(curr_ano, curr_mes)
            dt_ref = min(d_fim - timedelta(days=1), hoje)

            # Fluxos do mês
            movs_mes = session.exec(
                select(MovimentoInvestimento).where(
                    MovimentoInvestimento.ativo_id == ativo.id,
                    MovimentoInvestimento.data_movimento >= d_ini,
                    MovimentoInvestimento.data_movimento <= dt_ref,
                )
            ).all()

            aportes_brl = Decimal("0.00")
            retiradas_brl = Decimal("0.00")

            for m in movs_mes:
                val = m.valor_total
                if m.moeda == Moeda.USD:
                    tx = buscar_cotacao_dolar_data(session, m.data_movimento)
                    val = val * (tx if tx > 0 else Decimal("1.00"))
                
                if m.tipo_movimento in {TipoMovimentoInvestimento.COMPRA, TipoMovimentoInvestimento.APORTE}:
                    aportes_brl += val
                elif m.tipo_movimento in {TipoMovimentoInvestimento.VENDA, TipoMovimentoInvestimento.RESGATE}:
                    retiradas_brl += val

            # Proventos do mês para este ativo
            divs_mes = session.exec(
                select(func.sum(Dividendo.valor_brl)).where(
                    Dividendo.ativo_id == ativo.id,
                    Dividendo.data_recebimento >= d_ini,
                    Dividendo.data_recebimento <= dt_ref,
                )
            ).one()
            proventos_brl = Decimal(str(divs_mes or "0.00"))

            # Posição no fechamento do mês
            qtd_fim, preco_fim, valor_fim_brl, qualidade = reconstruir_posicao_ativo_na_data(session, ativo, dt_ref)

            if existente:
                # Atualizar snapshot do mês corrente se for o mês atual ou se valor mudou
                if (curr_ano == ano_fim and curr_mes == mes_fim) or existente.valor_fim_brl != valor_fim_brl:
                    existente.quantidade_fim = qtd_fim
                    existente.preco_fim_original = preco_fim
                    existente.valor_fim_brl = valor_fim_brl
                    existente.aportes_periodo_brl = aportes_brl
                    existente.retiradas_periodo_brl = retiradas_brl
                    existente.proventos_periodo_brl = proventos_brl
                    existente.qualidade_dado = qualidade
                    session.add(existente)
            else:
                snap = HistoricoPosicaoInvestimentoMensal(
                    ativo_id=ativo.id,
                    ano=curr_ano,
                    mes=curr_mes,
                    data_referencia=dt_ref,
                    quantidade_fim=qtd_fim,
                    preco_fim_original=preco_fim,
                    moeda=ativo.moeda,
                    cotacao_brl=Decimal("1.00"),
                    valor_fim_brl=valor_fim_brl,
                    aportes_periodo_brl=aportes_brl,
                    retiradas_periodo_brl=retiradas_brl,
                    proventos_periodo_brl=proventos_brl,
                    qualidade_dado=qualidade,
                )
                novos_snapshots.append(snap)

            # Avançar mês
            if curr_mes == 12:
                curr_ano += 1
                curr_mes = 1
            else:
                curr_mes += 1

    if novos_snapshots:
        for s in novos_snapshots:
            session.add(s)
    try:
        session.commit()
    except Exception as e:
        logger.warning(f"Erro ao salvar backfill de posições históricas: {e}")
        session.rollback()
