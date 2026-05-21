from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.base import StatusCompromisso, TipoLancamento, now_utc
from app.models.cartao import Cartao
from app.models.compromisso_cartao import CompromissoCartao
from app.models.lancamento import Lancamento
from app.models.pagamento_fatura import PagamentoFatura
from app.schemas.cartao_schema import PagarFatura
from app.schemas.compromisso_cartao_schema import SepararCompromisso
from app.services.saldo_service import calcular_reservado_cartao, resumo_cartoes


def resumo_cartao(session: Session, cartao_id: str) -> dict:
    for item in resumo_cartoes(session):
        if item["id"] == cartao_id:
            return item
    raise HTTPException(status_code=404, detail="Cartao nao encontrado.")


def informar_fatura(session: Session, cartao_id: str, valor: Decimal) -> Cartao:
    if valor < 0:
        raise HTTPException(status_code=422, detail="Valor de fatura nao pode ser negativo.")
    cartao = session.get(Cartao, cartao_id)
    if not cartao or not cartao.ativo:
        raise HTTPException(status_code=404, detail="Cartao nao encontrado.")
    cartao.fatura_atual_informada = valor
    cartao.limite_utilizado_informado = valor
    cartao.atualizado_em = now_utc()
    session.add(cartao)
    session.commit()
    session.refresh(cartao)
    return cartao


def pagar_fatura(session: Session, cartao_id: str, payload: PagarFatura) -> PagamentoFatura:
    if payload.valor_pago < 0:
        raise HTTPException(status_code=422, detail="Valor pago nao pode ser negativo.")
    cartao = session.get(Cartao, cartao_id)
    if not cartao or not cartao.ativo:
        raise HTTPException(status_code=404, detail="Cartao nao encontrado.")
    reservado = calcular_reservado_cartao(session, cartao_id)
    if payload.valor_pago > reservado:
        raise HTTPException(status_code=422, detail="Pagamento nao pode ser maior que o reservado para o cartao.")
    pagamento = PagamentoFatura(
        cartao_id=cartao_id,
        data_pagamento=date.today(),
        valor_pago=payload.valor_pago,
        conta_id=payload.conta_id,
        observacao=payload.observacao,
    )
    session.add(pagamento)
    session.commit()
    session.refresh(pagamento)
    return pagamento


def separar_compromisso(session: Session, compromisso_id: str, payload: SepararCompromisso) -> Lancamento:
    if payload.valor <= 0:
        raise HTTPException(status_code=422, detail="Valor separado deve ser maior que zero.")
    compromisso = session.get(CompromissoCartao, compromisso_id)
    if not compromisso or not compromisso.ativo:
        raise HTTPException(status_code=404, detail="Compromisso de cartao nao encontrado.")
    if payload.valor > compromisso.valor_em_aberto:
        raise HTTPException(status_code=422, detail="Valor separado nao pode ser maior que valor em aberto.")
    if not compromisso.categoria_id or not compromisso.subcategoria_id:
        raise HTTPException(status_code=422, detail="Compra parcelada exige item e subitem para virar gasto no orcamento.")

    lancamento = Lancamento(
        data_lancamento=payload.data or date.today(),
        tipo=TipoLancamento.GASTO,
        valor=payload.valor,
        valor_original=payload.valor,
        categoria_id=compromisso.categoria_id,
        subcategoria_id=compromisso.subcategoria_id,
        metodo_pagamento_id=compromisso.metodo_pagamento_id,
        cartao_id=compromisso.cartao_id,
        compromisso_cartao_id=compromisso.id,
        observacao=payload.observacao or compromisso.descricao,
        afeta_saldo_livre=True,
        afeta_orcamento=True,
    )
    session.add(lancamento)

    compromisso.valor_separado += payload.valor
    compromisso.valor_em_aberto -= payload.valor
    compromisso.status = StatusCompromisso.QUITADO if compromisso.valor_em_aberto == 0 else StatusCompromisso.PARCIAL
    compromisso.atualizado_em = now_utc()
    session.add(compromisso)
    session.commit()
    session.refresh(lancamento)
    return lancamento


def listar_compromissos(session: Session, cartao_id: str | None = None) -> list[CompromissoCartao]:
    statement = select(CompromissoCartao).where(CompromissoCartao.ativo.is_(True))
    if cartao_id:
        statement = statement.where(CompromissoCartao.cartao_id == cartao_id)
    return session.exec(statement.order_by(CompromissoCartao.data_compra.desc())).all()
