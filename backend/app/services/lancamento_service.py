from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.base import NaturezaCategoria, StatusCompromisso, TipoAtivo, TipoLancamento, TipoMetodo, now_utc
from app.models.investimento import Ativo
from app.models.cartao import Cartao
from app.models.categoria import Categoria
from app.models.compromisso_cartao import CompromissoCartao
from app.models.lancamento import Lancamento
from app.models.metodo_pagamento import MetodoPagamento
from app.models.subcategoria import Subcategoria
from app.services.caixinha_service import obter_ou_criar_caixinha
from app.services.investimento_service import comprar
from app.schemas.lancamento_schema import LancamentoCreate, LancamentoUpdate


TIPOS_EXTERIOR_INVESTIMENTO = {TipoAtivo.EXTERIOR, TipoAtivo.ACAO_EXTERIOR, TipoAtivo.ETF_EXTERIOR}


def _ensure_non_negative(value: Decimal, field: str = "valor") -> None:
    if value < 0:
        raise HTTPException(status_code=422, detail=f"{field} nao pode ser negativo.")


def _get_method(session: Session, metodo_id: str | None) -> MetodoPagamento | None:
    if not metodo_id:
        return None
    metodo = session.get(MetodoPagamento, metodo_id)
    if not metodo or not metodo.ativo:
        raise HTTPException(status_code=404, detail="Metodo de pagamento nao encontrado.")
    return metodo


def _natureza_esperada(tipo: TipoLancamento) -> NaturezaCategoria | None:
    if tipo in {TipoLancamento.GASTO, TipoLancamento.SEPARAR}:
        return NaturezaCategoria.GASTO
    if tipo == TipoLancamento.RECEITA:
        return NaturezaCategoria.RECEITA
    if tipo == TipoLancamento.INVESTIMENTO:
        return NaturezaCategoria.INVESTIMENTO
    return None


def _validar_tipo_visivel(tipo: TipoLancamento) -> None:
    if tipo in {TipoLancamento.AJUSTE, TipoLancamento.DIVIDENDO}:
        raise HTTPException(status_code=422, detail="Tipo tecnico nao pode ser usado em novo lancamento comum.")


def _movimento_investimento_exterior(session: Session, payload: LancamentoCreate) -> bool:
    movimento = payload.movimento_investimento
    if payload.tipo != TipoLancamento.INVESTIMENTO or not movimento:
        return False
    if movimento.tipo_ativo in TIPOS_EXTERIOR_INVESTIMENTO:
        return True
    if movimento.ativo_id:
        ativo = session.get(Ativo, movimento.ativo_id)
        return bool(ativo and ativo.tipo_ativo in TIPOS_EXTERIOR_INVESTIMENTO)
    return False


def _atualizar_status_compromisso(compromisso: CompromissoCartao) -> None:
    if compromisso.valor_em_aberto <= 0:
        compromisso.status = StatusCompromisso.QUITADO
    elif compromisso.valor_separado > 0:
        compromisso.status = StatusCompromisso.PARCIAL
    else:
        compromisso.status = StatusCompromisso.ABERTO


def _validar_categoria_lancamento(
    session: Session,
    tipo: TipoLancamento,
    categoria_id: str | None,
    subcategoria_id: str | None,
) -> tuple[str | None, str | None]:
    natureza = _natureza_esperada(tipo)
    categoria = session.get(Categoria, categoria_id) if categoria_id else None
    subcategoria = session.get(Subcategoria, subcategoria_id) if subcategoria_id else None

    if not categoria:
        return None, None
    if not categoria.ativa:
        raise HTTPException(status_code=422, detail="Categoria inativa nao aparece em novos lancamentos.")
    if natureza and categoria.natureza != natureza:
        raise HTTPException(status_code=422, detail="Categoria nao pertence ao tipo de lancamento selecionado.")

    if subcategoria_id:
        if not subcategoria or subcategoria.categoria_id != categoria.id:
            raise HTTPException(status_code=404, detail="Subcategoria nao encontrada ou nao pertence a categoria.")
        if not subcategoria.ativa:
            raise HTTPException(status_code=422, detail="Subcategoria inativa nao aparece em novos lancamentos.")
        if subcategoria.natureza != categoria.natureza:
            raise HTTPException(status_code=422, detail="Subcategoria deve ter a mesma natureza da categoria.")

    return categoria.nome, subcategoria.nome if subcategoria else None


def criar_lancamento(session: Session, payload: LancamentoCreate) -> Lancamento:
    _ensure_non_negative(payload.valor)
    _validar_tipo_visivel(payload.tipo)
    data_lancamento = payload.data_lancamento or date.today()
    metodo = _get_method(session, payload.metodo_pagamento_id)
    categoria_snapshot, subcategoria_snapshot = _validar_categoria_lancamento(
        session, payload.tipo, payload.categoria_id, payload.subcategoria_id
    )

    if payload.tipo == TipoLancamento.GASTO and not payload.metodo_pagamento_id and not payload.cartao:
        raise HTTPException(status_code=422, detail="Gasto exige metodo de pagamento.")
    if payload.tipo == TipoLancamento.SEPARAR and payload.cartao:
        raise HTTPException(status_code=422, detail="Separar dinheiro nao usa cartao de credito.")
    if payload.tipo != TipoLancamento.INVESTIMENTO and payload.movimento_investimento:
        raise HTTPException(status_code=422, detail="Movimento de investimento so pode ser usado com tipo INVESTIMENTO.")

    if payload.transferencia_interna:
        lancamento = Lancamento(
            data_lancamento=data_lancamento,
            tipo=payload.tipo,
            valor=payload.valor,
            valor_original=payload.valor,
            categoria_id=payload.categoria_id,
            subcategoria_id=payload.subcategoria_id,
            categoria_nome_snapshot=categoria_snapshot,
            subcategoria_nome_snapshot=subcategoria_snapshot,
            metodo_pagamento_id=payload.metodo_pagamento_id,
            conta_id=payload.conta_id,
            observacao=payload.observacao,
            afeta_saldo_livre=False,
            afeta_orcamento=False,
            transferencia_interna=True,
        )
        session.add(lancamento)
        session.commit()
        session.refresh(lancamento)
        return lancamento

    if payload.cartao:
        return _criar_lancamento_cartao(session, payload, data_lancamento, metodo)

    investimento_exterior = _movimento_investimento_exterior(session, payload)
    afeta_orcamento = payload.tipo in {
        TipoLancamento.GASTO,
        TipoLancamento.RECEITA,
        TipoLancamento.INVESTIMENTO,
        TipoLancamento.SEPARAR,
    } and not investimento_exterior
    caixinha_id = payload.caixinha_id
    if payload.tipo == TipoLancamento.SEPARAR:
        if not payload.categoria_id or not payload.subcategoria_id:
            raise HTTPException(status_code=422, detail="Separar dinheiro exige categoria e subcategoria.")
        nome_caixinha = payload.caixinha_nome or payload.observacao or subcategoria_snapshot or categoria_snapshot or "Caixinha"
        caixinha = obter_ou_criar_caixinha(
            session,
            nome_caixinha,
            payload.categoria_id,
            payload.subcategoria_id,
            None,
            None,
            payload.observacao,
        )
        caixinha_id = caixinha.id
    lancamento = Lancamento(
        data_lancamento=data_lancamento,
        tipo=payload.tipo,
        valor=payload.valor,
        valor_original=payload.valor,
        categoria_id=payload.categoria_id,
        subcategoria_id=payload.subcategoria_id,
        categoria_nome_snapshot=categoria_snapshot,
        subcategoria_nome_snapshot=subcategoria_snapshot,
        metodo_pagamento_id=None if payload.tipo == TipoLancamento.SEPARAR else payload.metodo_pagamento_id,
        conta_id=None if payload.tipo == TipoLancamento.SEPARAR else payload.conta_id,
        caixinha_id=caixinha_id,
        observacao=payload.observacao,
        afeta_saldo_livre=not investimento_exterior,
        afeta_orcamento=afeta_orcamento,
    )
    session.add(lancamento)
    session.flush()

    if payload.tipo == TipoLancamento.INVESTIMENTO and payload.movimento_investimento:
        movimento = payload.movimento_investimento.model_copy(
            update={
                "data_movimento": payload.movimento_investimento.data_movimento or data_lancamento,
                "conta_id": payload.movimento_investimento.conta_id or payload.conta_id,
                "observacao": payload.movimento_investimento.observacao or payload.observacao,
            }
        )
        movimento_criado = comprar(session, movimento, commit=False)
        lancamento.origem_sistema = "INVESTIMENTO_COMPRA"
        lancamento.referencia_id = movimento_criado.id
        session.add(lancamento)

    session.commit()
    session.refresh(lancamento)
    return lancamento


def _criar_lancamento_cartao(
    session: Session,
    payload: LancamentoCreate,
    data_lancamento: date,
    metodo: MetodoPagamento | None,
) -> Lancamento:
    if payload.tipo != TipoLancamento.GASTO:
        raise HTTPException(status_code=422, detail="Lancamento de cartao deve ser do tipo GASTO.")
    if metodo and metodo.tipo_metodo != TipoMetodo.CARTAO_CREDITO:
        raise HTTPException(status_code=422, detail="Metodo informado nao e cartao de credito.")
    if not payload.categoria_id or not payload.subcategoria_id:
        raise HTTPException(status_code=422, detail="Compra no cartao exige item e subitem.")

    cartao_input = payload.cartao
    assert cartao_input is not None
    _ensure_non_negative(cartao_input.valor_separado_agora, "valor separado agora")
    if cartao_input.valor_separado_agora > payload.valor:
        raise HTTPException(status_code=422, detail="Valor separado agora nao pode ser maior que a compra.")

    cartao = session.get(Cartao, cartao_input.cartao_id)
    if not cartao or not cartao.ativo:
        raise HTTPException(status_code=404, detail="Cartao nao encontrado.")

    valor_futuro = payload.valor - cartao_input.valor_separado_agora
    lancamento = Lancamento(
        data_lancamento=data_lancamento,
        tipo=TipoLancamento.GASTO,
        valor=cartao_input.valor_separado_agora,
        valor_original=payload.valor,
        categoria_id=payload.categoria_id,
        subcategoria_id=payload.subcategoria_id,
        categoria_nome_snapshot=session.get(Categoria, payload.categoria_id).nome if payload.categoria_id and session.get(Categoria, payload.categoria_id) else None,
        subcategoria_nome_snapshot=session.get(Subcategoria, payload.subcategoria_id).nome if payload.subcategoria_id and session.get(Subcategoria, payload.subcategoria_id) else None,
        metodo_pagamento_id=payload.metodo_pagamento_id,
        conta_id=payload.conta_id,
        cartao_id=cartao.id,
        observacao=payload.observacao,
        afeta_saldo_livre=cartao_input.valor_separado_agora > 0,
        afeta_orcamento=cartao_input.valor_separado_agora > 0,
    )
    session.add(lancamento)
    session.flush()

    if valor_futuro > 0:
        compromisso = CompromissoCartao(
            cartao_id=cartao.id,
            lancamento_origem_id=lancamento.id,
            categoria_id=payload.categoria_id,
            subcategoria_id=payload.subcategoria_id,
            metodo_pagamento_id=payload.metodo_pagamento_id,
            data_compra=data_lancamento,
            valor_original=valor_futuro,
            valor_separado=Decimal("0.00"),
            valor_em_aberto=valor_futuro,
            quantidade_parcelas=cartao_input.quantidade_parcelas,
            descricao=cartao_input.descricao_compromisso or payload.observacao,
            status=StatusCompromisso.ABERTO,
        )
        session.add(compromisso)
        session.flush()
        lancamento.compromisso_cartao_id = compromisso.id

    session.commit()
    session.refresh(lancamento)
    return lancamento


def atualizar_lancamento(session: Session, lancamento_id: str, payload: LancamentoUpdate) -> Lancamento:
    lancamento = session.get(Lancamento, lancamento_id)
    if not lancamento or not lancamento.ativo:
        raise HTTPException(status_code=404, detail="Lancamento nao encontrado.")
    data = payload.model_dump(exclude_unset=True)
    data.pop("movimento_investimento", None)
    caixinha_nome = data.pop("caixinha_nome", None)

    if (lancamento.cartao_id or lancamento.compromisso_cartao_id) and data.get("tipo", lancamento.tipo) != TipoLancamento.GASTO:
        raise HTTPException(status_code=422, detail="Lancamento de cartao deve permanecer como gasto.")

    old_valor = lancamento.valor
    if "valor" in data:
        _ensure_non_negative(data["valor"])
        if lancamento.cartao_id or lancamento.compromisso_cartao_id:
            compromisso = session.get(CompromissoCartao, lancamento.compromisso_cartao_id) if lancamento.compromisso_cartao_id else None
            if compromisso:
                if compromisso.lancamento_origem_id == lancamento.id:
                    novo_futuro = lancamento.valor_original - data["valor"]
                    if novo_futuro < compromisso.valor_separado:
                        raise HTTPException(
                            status_code=422,
                            detail="Valor separado agora nao pode deixar o futuro menor que o que ja foi separado.",
                        )
                    compromisso.valor_original = max(novo_futuro, Decimal("0.00"))
                    compromisso.valor_em_aberto = compromisso.valor_original - compromisso.valor_separado
                else:
                    delta = data["valor"] - old_valor
                    if compromisso.valor_separado + delta < 0:
                        raise HTTPException(status_code=422, detail="Ajuste deixaria o valor separado negativo.")
                    if compromisso.valor_em_aberto - delta < 0:
                        raise HTTPException(status_code=422, detail="Valor separado nao pode ser maior que o compromisso em aberto.")
                    compromisso.valor_separado += delta
                    compromisso.valor_em_aberto -= delta
                _atualizar_status_compromisso(compromisso)
                compromisso.atualizado_em = now_utc()
                session.add(compromisso)
            else:
                lancamento.valor_original = data["valor"]
        else:
            lancamento.valor_original = data["valor"]
    for key, value in data.items():
        setattr(lancamento, key, value)
    if lancamento.tipo:
        _validar_tipo_visivel(lancamento.tipo)
    if lancamento.tipo == TipoLancamento.GASTO and not lancamento.metodo_pagamento_id and not lancamento.cartao_id:
        raise HTTPException(status_code=422, detail="Gasto exige metodo de pagamento.")
    if lancamento.cartao_id and (not lancamento.categoria_id or not lancamento.subcategoria_id):
        raise HTTPException(status_code=422, detail="Compra no cartao exige item e subitem.")
    _get_method(session, lancamento.metodo_pagamento_id)
    categoria_snapshot, subcategoria_snapshot = _validar_categoria_lancamento(
        session, lancamento.tipo, lancamento.categoria_id, lancamento.subcategoria_id
    )
    if lancamento.tipo == TipoLancamento.SEPARAR:
        lancamento.metodo_pagamento_id = None
        lancamento.conta_id = None
        if not lancamento.categoria_id or not lancamento.subcategoria_id:
            raise HTTPException(status_code=422, detail="Separar dinheiro exige categoria e subcategoria.")
        if not lancamento.caixinha_id:
            nome_caixinha = caixinha_nome or lancamento.observacao or subcategoria_snapshot or categoria_snapshot or "Caixinha"
            caixinha = obter_ou_criar_caixinha(
                session,
                nome_caixinha,
                lancamento.categoria_id,
                lancamento.subcategoria_id,
                None,
                None,
                lancamento.observacao,
            )
            lancamento.caixinha_id = caixinha.id
    lancamento.categoria_nome_snapshot = categoria_snapshot
    lancamento.subcategoria_nome_snapshot = subcategoria_snapshot
    lancamento.afeta_orcamento = lancamento.tipo in {
        TipoLancamento.GASTO,
        TipoLancamento.RECEITA,
        TipoLancamento.INVESTIMENTO,
        TipoLancamento.SEPARAR,
    } and not lancamento.transferencia_interna

    if lancamento.compromisso_cartao_id:
        compromisso = session.get(CompromissoCartao, lancamento.compromisso_cartao_id)
        if compromisso and compromisso.lancamento_origem_id == lancamento.id:
            compromisso.categoria_id = lancamento.categoria_id
            compromisso.subcategoria_id = lancamento.subcategoria_id
            compromisso.metodo_pagamento_id = lancamento.metodo_pagamento_id
            compromisso.data_compra = lancamento.data_lancamento
            compromisso.descricao = lancamento.observacao
            compromisso.atualizado_em = now_utc()
            session.add(compromisso)

    lancamento.atualizado_em = now_utc()
    session.add(lancamento)
    session.commit()
    session.refresh(lancamento)
    return lancamento


def excluir_lancamento(session: Session, lancamento_id: str, excluir_vinculados: bool = True) -> None:
    lancamento = session.get(Lancamento, lancamento_id)
    if not lancamento or not lancamento.ativo:
        raise HTTPException(status_code=404, detail="Lancamento nao encontrado.")

    if lancamento.compromisso_cartao_id:
        compromisso = session.get(CompromissoCartao, lancamento.compromisso_cartao_id)
        if compromisso:
            if compromisso.lancamento_origem_id == lancamento.id and excluir_vinculados:
                compromisso.ativo = False
                compromisso.status = StatusCompromisso.CANCELADO
                compromisso.valor_em_aberto = Decimal("0.00")
            elif compromisso.lancamento_origem_id != lancamento.id:
                compromisso.valor_separado = max(Decimal("0.00"), compromisso.valor_separado - lancamento.valor)
                compromisso.valor_em_aberto = compromisso.valor_em_aberto + lancamento.valor
                compromisso.status = StatusCompromisso.PARCIAL if compromisso.valor_separado > 0 else StatusCompromisso.ABERTO
            compromisso.atualizado_em = now_utc()
            session.add(compromisso)

    lancamento.ativo = False
    lancamento.atualizado_em = now_utc()
    session.add(lancamento)
    session.commit()


def listar_lancamentos(session: Session, ano: int | None = None, mes: int | None = None) -> list[Lancamento]:
    statement = select(Lancamento).where(Lancamento.ativo.is_(True))
    if ano and mes:
        from app.models.base import month_bounds

        inicio, fim = month_bounds(ano, mes)
        statement = statement.where(Lancamento.data_lancamento >= inicio, Lancamento.data_lancamento < fim)
    return session.exec(statement.order_by(Lancamento.data_lancamento.desc(), Lancamento.criado_em.desc())).all()
