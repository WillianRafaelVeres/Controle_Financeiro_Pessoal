from datetime import date

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.base import NaturezaCategoria, StatusContaFutura, TipoLancamento, TipoMetodo, now_utc
from app.models.categoria import Categoria
from app.models.conta import Conta
from app.models.conta_futura import ContaFutura
from app.models.lancamento import Lancamento
from app.models.metodo_pagamento import MetodoPagamento
from app.models.subcategoria import Subcategoria
from app.schemas.conta_futura_schema import ContaFuturaCreate, ContaFuturaUpdate, PagarContaFutura


def _validar_categoria(
    session: Session,
    categoria_id: str,
    subcategoria_id: str,
) -> tuple[Categoria, Subcategoria]:
    categoria = session.get(Categoria, categoria_id)
    if not categoria or not categoria.ativa:
        raise HTTPException(status_code=422, detail="Item de gasto invalido ou inativo.")
    if categoria.natureza != NaturezaCategoria.GASTO:
        raise HTTPException(status_code=422, detail="Conta futura precisa usar item de gasto.")

    subcategoria = session.get(Subcategoria, subcategoria_id)
    if not subcategoria or subcategoria.categoria_id != categoria.id or not subcategoria.ativa:
        raise HTTPException(status_code=422, detail="Subitem invalido, inativo ou fora do item.")
    if subcategoria.natureza != NaturezaCategoria.GASTO:
        raise HTTPException(status_code=422, detail="Conta futura precisa usar subitem de gasto.")
    return categoria, subcategoria


def _validar_metodo_pagamento(session: Session, metodo_id: str) -> MetodoPagamento:
    metodo = session.get(MetodoPagamento, metodo_id)
    if not metodo or not metodo.ativo:
        raise HTTPException(status_code=422, detail="Metodo de pagamento invalido ou inativo.")
    if metodo.tipo_metodo == TipoMetodo.CARTAO_CREDITO:
        raise HTTPException(status_code=422, detail="Pagamento com cartao deve ser controlado pela aba Cartoes.")
    return metodo


def _validar_conta(session: Session, conta_id: str) -> Conta:
    conta = session.get(Conta, conta_id)
    if not conta or not conta.ativa:
        raise HTTPException(status_code=422, detail="Conta invalida ou inativa.")
    return conta


def listar_contas_futuras(session: Session, incluir_pagas: bool = True) -> list[ContaFutura]:
    statement = select(ContaFutura).where(ContaFutura.ativo.is_(True))
    if not incluir_pagas:
        statement = statement.where(ContaFutura.status == StatusContaFutura.ABERTA)
    else:
        statement = statement.where(ContaFutura.status != StatusContaFutura.CANCELADA)
    return session.exec(statement.order_by(ContaFutura.status, ContaFutura.data_vencimento, ContaFutura.criado_em)).all()


def criar_conta_futura(session: Session, payload: ContaFuturaCreate) -> ContaFutura:
    descricao = payload.descricao.strip()
    if not descricao:
        raise HTTPException(status_code=422, detail="Descricao e obrigatoria.")
    if payload.valor <= 0:
        raise HTTPException(status_code=422, detail="Valor precisa ser maior que zero.")
    _validar_categoria(session, payload.categoria_id, payload.subcategoria_id)
    _validar_metodo_pagamento(session, payload.metodo_pagamento_id)
    if payload.conta_id:
        _validar_conta(session, payload.conta_id)

    conta = ContaFutura(
        descricao=descricao,
        valor=payload.valor,
        categoria_id=payload.categoria_id,
        subcategoria_id=payload.subcategoria_id,
        metodo_pagamento_id=payload.metodo_pagamento_id,
        conta_id=payload.conta_id,
        data_vencimento=payload.data_vencimento,
        observacao=payload.observacao,
    )
    session.add(conta)
    session.commit()
    session.refresh(conta)
    return conta


def atualizar_conta_futura(session: Session, conta_id: str, payload: ContaFuturaUpdate) -> ContaFutura:
    conta = session.get(ContaFutura, conta_id)
    if not conta or not conta.ativo:
        raise HTTPException(status_code=404, detail="Conta futura nao encontrada.")
    if conta.status != StatusContaFutura.ABERTA:
        raise HTTPException(status_code=422, detail="Somente contas futuras abertas podem ser editadas.")

    data = payload.model_dump(exclude_unset=True)
    categoria_id = data.get("categoria_id", conta.categoria_id)
    subcategoria_id = data.get("subcategoria_id", conta.subcategoria_id)
    metodo_pagamento_id = data.get("metodo_pagamento_id", conta.metodo_pagamento_id)
    conta_id = data.get("conta_id", conta.conta_id)
    if "valor" in data and data["valor"] <= 0:
        raise HTTPException(status_code=422, detail="Valor precisa ser maior que zero.")
    if "descricao" in data:
        data["descricao"] = data["descricao"].strip()
        if not data["descricao"]:
            raise HTTPException(status_code=422, detail="Descricao e obrigatoria.")
    _validar_categoria(session, categoria_id, subcategoria_id)
    if metodo_pagamento_id:
        _validar_metodo_pagamento(session, metodo_pagamento_id)
    if "conta_id" in data and conta_id is not None:
        _validar_conta(session, conta_id)

    for key, value in data.items():
        setattr(conta, key, value)
    conta.atualizado_em = now_utc()
    session.add(conta)
    session.commit()
    session.refresh(conta)
    return conta


def pagar_conta_futura(session: Session, conta_id: str, payload: PagarContaFutura) -> Lancamento:
    conta = session.get(ContaFutura, conta_id)
    if not conta or not conta.ativo:
        raise HTTPException(status_code=404, detail="Conta futura nao encontrada.")
    if conta.status != StatusContaFutura.ABERTA:
        raise HTTPException(status_code=422, detail="Conta futura ja foi paga ou cancelada.")

    metodo_id = payload.metodo_pagamento_id or conta.metodo_pagamento_id
    if not metodo_id:
        raise HTTPException(status_code=422, detail="Informe o metodo de pagamento.")
    metodo = _validar_metodo_pagamento(session, metodo_id)
    categoria, subcategoria = _validar_categoria(session, conta.categoria_id, conta.subcategoria_id)
    if payload.conta_id:
        _validar_conta(session, payload.conta_id)

    lancamento = Lancamento(
        data_lancamento=payload.data_pagamento or date.today(),
        tipo=TipoLancamento.GASTO,
        valor=conta.valor,
        valor_original=conta.valor,
        categoria_id=conta.categoria_id,
        subcategoria_id=conta.subcategoria_id,
        categoria_nome_snapshot=categoria.nome,
        subcategoria_nome_snapshot=subcategoria.nome,
        metodo_pagamento_id=metodo.id,
        conta_id=payload.conta_id or conta.conta_id,
        observacao=payload.observacao or conta.observacao or conta.descricao,
        afeta_saldo_livre=True,
        afeta_orcamento=True,
    )
    session.add(lancamento)
    session.flush()

    conta.status = StatusContaFutura.PAGA
    conta.lancamento_pagamento_id = lancamento.id
    conta.atualizado_em = now_utc()
    session.add(conta)
    session.commit()
    session.refresh(lancamento)
    return lancamento


def cancelar_conta_futura(session: Session, conta_id: str) -> None:
    conta = session.get(ContaFutura, conta_id)
    if not conta or not conta.ativo:
        raise HTTPException(status_code=404, detail="Conta futura nao encontrada.")
    if conta.status != StatusContaFutura.ABERTA:
        raise HTTPException(status_code=422, detail="Somente contas futuras abertas podem ser canceladas.")
    conta.status = StatusContaFutura.CANCELADA
    conta.ativo = False
    conta.atualizado_em = now_utc()
    session.add(conta)
    session.commit()
