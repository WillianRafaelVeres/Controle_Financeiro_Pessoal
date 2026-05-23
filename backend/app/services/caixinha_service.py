from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from app.models.base import NaturezaCategoria, TipoLancamento, TipoMetodo, now_utc
from app.models.caixinha import Caixinha
from app.models.cartao import Cartao
from app.models.categoria import Categoria
from app.models.conta import Conta
from app.models.lancamento import Lancamento
from app.models.metodo_pagamento import MetodoPagamento
from app.models.subcategoria import Subcategoria
from app.schemas.caixinha_schema import CaixinhaCreate, CaixinhaUpdate, UsarCaixinha


def _decimal(value: object) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))


def _validar_categoria(session: Session, categoria_id: str, subcategoria_id: str) -> tuple[Categoria, Subcategoria]:
    categoria = session.get(Categoria, categoria_id)
    if not categoria or not categoria.ativa or categoria.natureza != NaturezaCategoria.GASTO:
        raise HTTPException(status_code=422, detail="Caixinha precisa usar uma categoria de gasto ativa.")
    subcategoria = session.get(Subcategoria, subcategoria_id)
    if not subcategoria or not subcategoria.ativa or subcategoria.categoria_id != categoria.id:
        raise HTTPException(status_code=422, detail="Subcategoria invalida para a caixinha.")
    if subcategoria.natureza != NaturezaCategoria.GASTO:
        raise HTTPException(status_code=422, detail="Caixinha precisa usar uma subcategoria de gasto.")
    return categoria, subcategoria


def _validar_metodo(session: Session, metodo_id: str | None) -> MetodoPagamento | None:
    if not metodo_id:
        return None
    metodo = session.get(MetodoPagamento, metodo_id)
    if not metodo or not metodo.ativo:
        raise HTTPException(status_code=422, detail="Metodo de pagamento invalido ou inativo.")
    if metodo.tipo_metodo == TipoMetodo.CARTAO_CREDITO:
        raise HTTPException(status_code=422, detail="Cartao de credito deve ser controlado pela aba Cartoes.")
    return metodo


def _validar_conta(session: Session, conta_id: str | None) -> Conta | None:
    if not conta_id:
        return None
    conta = session.get(Conta, conta_id)
    if not conta or not conta.ativa:
        raise HTTPException(status_code=422, detail="Conta invalida ou inativa.")
    return conta


def calcular_saldo_caixinha(session: Session, caixinha_id: str) -> Decimal:
    separado = session.exec(
        select(func.sum(Lancamento.valor)).where(
            Lancamento.ativo.is_(True),
            Lancamento.caixinha_id == caixinha_id,
            Lancamento.tipo == TipoLancamento.SEPARAR,
        )
    ).one()
    usado = session.exec(
        select(func.sum(Lancamento.valor)).where(
            Lancamento.ativo.is_(True),
            Lancamento.caixinha_id == caixinha_id,
            Lancamento.tipo == TipoLancamento.GASTO,
            Lancamento.afeta_saldo_livre.is_(False),
            Lancamento.afeta_orcamento.is_(False),
        )
    ).one()
    return max(_decimal(separado) - _decimal(usado), Decimal("0.00"))


def recalcular_caixinha(session: Session, caixinha: Caixinha) -> Caixinha:
    caixinha.valor_total = calcular_saldo_caixinha(session, caixinha.id)
    caixinha.atualizado_em = now_utc()
    session.add(caixinha)
    return caixinha


def listar_caixinhas(session: Session) -> list[Caixinha]:
    caixinhas = session.exec(select(Caixinha).where(Caixinha.ativo.is_(True)).order_by(Caixinha.nome)).all()
    for caixinha in caixinhas:
        recalcular_caixinha(session, caixinha)
    session.commit()
    return caixinhas


def obter_caixinha(session: Session, caixinha_id: str) -> Caixinha:
    caixinha = session.get(Caixinha, caixinha_id)
    if not caixinha or not caixinha.ativo:
        raise HTTPException(status_code=404, detail="Caixinha nao encontrada.")
    recalcular_caixinha(session, caixinha)
    session.commit()
    session.refresh(caixinha)
    return caixinha


def criar_caixinha(session: Session, payload: CaixinhaCreate) -> Caixinha:
    nome = payload.nome.strip()
    if not nome:
        raise HTTPException(status_code=422, detail="Nome da caixinha e obrigatorio.")
    _validar_categoria(session, payload.categoria_id, payload.subcategoria_id)
    _validar_metodo(session, payload.metodo_pagamento_id)
    _validar_conta(session, payload.conta_id)
    caixinha = Caixinha(
        nome=nome,
        descricao=payload.descricao,
        categoria_id=payload.categoria_id,
        subcategoria_id=payload.subcategoria_id,
        metodo_pagamento_id=payload.metodo_pagamento_id,
        conta_id=payload.conta_id,
    )
    session.add(caixinha)
    session.commit()
    session.refresh(caixinha)
    return caixinha


def atualizar_caixinha(session: Session, caixinha_id: str, payload: CaixinhaUpdate) -> Caixinha:
    caixinha = obter_caixinha(session, caixinha_id)
    data = payload.model_dump(exclude_unset=True)
    categoria_id = data.get("categoria_id", caixinha.categoria_id)
    subcategoria_id = data.get("subcategoria_id", caixinha.subcategoria_id)
    if categoria_id and subcategoria_id:
        _validar_categoria(session, categoria_id, subcategoria_id)
    if "metodo_pagamento_id" in data:
        _validar_metodo(session, data["metodo_pagamento_id"])
    if "conta_id" in data:
        _validar_conta(session, data["conta_id"])
    if "nome" in data:
        data["nome"] = data["nome"].strip()
        if not data["nome"]:
            raise HTTPException(status_code=422, detail="Nome da caixinha e obrigatorio.")
    for key, value in data.items():
        setattr(caixinha, key, value)
    caixinha.atualizado_em = now_utc()
    session.add(caixinha)
    session.commit()
    session.refresh(caixinha)
    return caixinha


def obter_ou_criar_caixinha(
    session: Session,
    nome: str,
    categoria_id: str,
    subcategoria_id: str,
    metodo_pagamento_id: str | None,
    conta_id: str | None,
    descricao: str | None = None,
) -> Caixinha:
    nome_limpo = nome.strip()
    if not nome_limpo:
        raise HTTPException(status_code=422, detail="Informe o nome da caixinha.")
    _validar_categoria(session, categoria_id, subcategoria_id)
    _validar_metodo(session, metodo_pagamento_id)
    _validar_conta(session, conta_id)
    existente = session.exec(
        select(Caixinha).where(
            Caixinha.ativo.is_(True),
            Caixinha.nome == nome_limpo,
            Caixinha.categoria_id == categoria_id,
            Caixinha.subcategoria_id == subcategoria_id,
        )
    ).first()
    if existente:
        if metodo_pagamento_id and not existente.metodo_pagamento_id:
            existente.metodo_pagamento_id = metodo_pagamento_id
        if conta_id and not existente.conta_id:
            existente.conta_id = conta_id
        session.add(existente)
        return existente
    caixinha = Caixinha(
        nome=nome_limpo,
        descricao=descricao,
        categoria_id=categoria_id,
        subcategoria_id=subcategoria_id,
        metodo_pagamento_id=metodo_pagamento_id,
        conta_id=conta_id,
    )
    session.add(caixinha)
    session.flush()
    return caixinha


def usar_caixinha(session: Session, caixinha_id: str, payload: UsarCaixinha) -> Lancamento:
    caixinha = obter_caixinha(session, caixinha_id)
    if payload.valor <= 0:
        raise HTTPException(status_code=422, detail="Valor precisa ser maior que zero.")
    saldo = calcular_saldo_caixinha(session, caixinha.id)
    if payload.valor > saldo:
        raise HTTPException(status_code=422, detail="Valor maior que o saldo da caixinha.")
    if payload.cartao_id and payload.metodo_pagamento_id:
        raise HTTPException(status_code=422, detail="Escolha cartao ou metodo comum, nao os dois.")
    cartao = session.get(Cartao, payload.cartao_id) if payload.cartao_id else None
    if payload.cartao_id and (not cartao or not cartao.ativo):
        raise HTTPException(status_code=422, detail="Cartao invalido ou inativo.")
    metodo = None if cartao else _validar_metodo(session, payload.metodo_pagamento_id or caixinha.metodo_pagamento_id)
    _validar_conta(session, payload.conta_id or caixinha.conta_id)
    categoria, subcategoria = _validar_categoria(session, caixinha.categoria_id or "", caixinha.subcategoria_id or "")
    lancamento = Lancamento(
        data_lancamento=payload.data_lancamento or date.today(),
        tipo=TipoLancamento.GASTO,
        valor=payload.valor,
        valor_original=payload.valor,
        categoria_id=caixinha.categoria_id,
        subcategoria_id=caixinha.subcategoria_id,
        categoria_nome_snapshot=categoria.nome,
        subcategoria_nome_snapshot=subcategoria.nome,
        metodo_pagamento_id=None if cartao else (metodo.id if metodo else caixinha.metodo_pagamento_id),
        cartao_id=cartao.id if cartao else None,
        conta_id=payload.conta_id or caixinha.conta_id,
        caixinha_id=caixinha.id,
        observacao=payload.observacao or f"Uso da caixinha: {caixinha.nome}",
        afeta_saldo_livre=False,
        afeta_orcamento=False,
    )
    session.add(lancamento)
    session.flush()
    recalcular_caixinha(session, caixinha)
    session.commit()
    session.refresh(lancamento)
    return lancamento


def excluir_caixinha(session: Session, caixinha_id: str) -> None:
    caixinha = obter_caixinha(session, caixinha_id)
    if calcular_saldo_caixinha(session, caixinha.id) > 0:
        raise HTTPException(status_code=422, detail="Use ou mova o saldo antes de excluir a caixinha.")
    caixinha.ativo = False
    caixinha.atualizado_em = now_utc()
    session.add(caixinha)
    session.commit()
