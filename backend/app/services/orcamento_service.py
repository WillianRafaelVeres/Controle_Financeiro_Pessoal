from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from app.models.base import EscopoOrcamento, NaturezaCategoria, TipoItemOrcamento, TipoLancamento, month_bounds, now_utc
from app.models.categoria import Categoria
from app.models.lancamento import Lancamento
from app.models.orcamento import OrcamentoItem, OrcamentoItemPadrao, OrcamentoMensal, OrcamentoPadrao
from app.models.subcategoria import Subcategoria
from app.schemas.orcamento_schema import OrcamentoAlterar, OrcamentoCreate, OrcamentoItemCreate
from app.services.saldo_service import (
    calcular_gasto_real_mes,
    filtro_excluir_categoria_cartao_generica,
    ids_categorias_cartao_genericas,
)

ZERO = Decimal("0.00")


def _decimal(value: object) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))


def _month_key(ano: int, mes: int) -> int:
    return ano * 12 + mes


def _next_month(ano: int, mes: int) -> tuple[int, int]:
    if mes == 12:
        return ano + 1, 1
    return ano, mes + 1


def _previous_month(ano: int, mes: int) -> tuple[int, int]:
    if mes == 1:
        return ano - 1, 12
    return ano, mes - 1


def _same_identity(left: OrcamentoItem | OrcamentoItemPadrao, right: OrcamentoItem | OrcamentoItemPadrao) -> bool:
    return (
        left.tipo_item == right.tipo_item
        and left.natureza == right.natureza
        and left.categoria_id == right.categoria_id
        and left.subcategoria_id == right.subcategoria_id
    )


def _identity_filters(model, source: OrcamentoItem | OrcamentoItemPadrao | OrcamentoItemCreate):
    return [
        model.tipo_item == source.tipo_item,
        model.natureza == source.natureza,
        model.categoria_id == source.categoria_id,
        model.subcategoria_id == source.subcategoria_id,
    ]


def _categorias_por_id(session: Session, ids: set[str | None]) -> dict[str, Categoria]:
    ids_validos = [id_ for id_ in ids if id_]
    if not ids_validos:
        return {}
    categorias = session.exec(select(Categoria).where(Categoria.id.in_(ids_validos))).all()
    return {categoria.id: categoria for categoria in categorias}


def _subcategorias_por_id(session: Session, ids: set[str | None]) -> dict[str, Subcategoria]:
    ids_validos = [id_ for id_ in ids if id_]
    if not ids_validos:
        return {}
    subcategorias = session.exec(select(Subcategoria).where(Subcategoria.id.in_(ids_validos))).all()
    return {subcategoria.id: subcategoria for subcategoria in subcategorias}


def _natureza_lancamento(lancamento: Lancamento) -> NaturezaCategoria:
    if lancamento.tipo == TipoLancamento.INVESTIMENTO:
        return NaturezaCategoria.INVESTIMENTO
    if lancamento.tipo == TipoLancamento.RECEITA:
        return NaturezaCategoria.RECEITA
    return NaturezaCategoria.GASTO


def _nome_snapshots(session: Session, categoria_id: str | None, subcategoria_id: str | None) -> tuple[str | None, str | None]:
    categoria = session.get(Categoria, categoria_id) if categoria_id else None
    subcategoria = session.get(Subcategoria, subcategoria_id) if subcategoria_id else None
    return categoria.nome if categoria else None, subcategoria.nome if subcategoria else None


def _validate_item_payload(session: Session, payload: OrcamentoItemCreate) -> None:
    if payload.valor_orcado < 0:
        raise HTTPException(status_code=422, detail="Valor planejado nao pode ser negativo.")

    categoria = session.get(Categoria, payload.categoria_id)
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria nao encontrada.")
    if not categoria.ativa:
        raise HTTPException(status_code=422, detail="Categoria inativa nao pode ser adicionada ao planejamento atual.")
    if categoria.natureza != payload.natureza:
        raise HTTPException(status_code=422, detail="Natureza do item nao corresponde a categoria.")

    if payload.tipo_item == TipoItemOrcamento.CATEGORIA:
        payload.subcategoria_id = None
        return

    if not payload.subcategoria_id:
        raise HTTPException(status_code=422, detail="Subcategoria e obrigatoria para item do tipo SUBCATEGORIA.")
    subcategoria = session.get(Subcategoria, payload.subcategoria_id)
    if not subcategoria or subcategoria.categoria_id != payload.categoria_id:
        raise HTTPException(status_code=404, detail="Subcategoria nao encontrada ou nao pertence a categoria.")
    if not subcategoria.ativa:
        raise HTTPException(status_code=422, detail="Subcategoria inativa nao pode ser adicionada ao planejamento atual.")
    if subcategoria.natureza != categoria.natureza:
        raise HTTPException(status_code=422, detail="Subcategoria deve ter a mesma natureza da categoria.")


def _padrao_vale_no_mes(padrao: OrcamentoItemPadrao, ano: int, mes: int) -> bool:
    if not padrao.ativo:
        return False
    chave = _month_key(ano, mes)
    if chave < _month_key(padrao.inicio_ano, padrao.inicio_mes):
        return False
    if padrao.fim_ano is None or padrao.fim_mes is None:
        return True
    return chave <= _month_key(padrao.fim_ano, padrao.fim_mes)


def _upsert_monthly_item(
    session: Session,
    ano: int,
    mes: int,
    source: OrcamentoItemCreate | OrcamentoItemPadrao | OrcamentoItem,
    valor: Decimal,
) -> OrcamentoItem:
    existente = session.exec(
        select(OrcamentoItem).where(
            OrcamentoItem.ano == ano,
            OrcamentoItem.mes == mes,
            *_identity_filters(OrcamentoItem, source),
        )
    ).first()

    if existente:
        existente.valor_orcado = valor
        existente.ativo = True
        if not existente.categoria_nome_snapshot:
            existente.categoria_nome_snapshot, existente.subcategoria_nome_snapshot = _nome_snapshots(
                session, existente.categoria_id, existente.subcategoria_id
            )
        existente.inativado_em = None
        existente.motivo_inativacao = None
        existente.atualizado_em = now_utc()
        session.add(existente)
        return existente

    categoria_snapshot, subcategoria_snapshot = _nome_snapshots(session, source.categoria_id, source.subcategoria_id)
    item = OrcamentoItem(
        ano=ano,
        mes=mes,
        tipo_item=source.tipo_item,
        natureza=source.natureza,
        categoria_id=source.categoria_id,
        subcategoria_id=source.subcategoria_id,
        categoria_nome_snapshot=categoria_snapshot,
        subcategoria_nome_snapshot=subcategoria_snapshot,
        valor_orcado=valor,
        ativo=True,
    )
    session.add(item)
    return item


def _upsert_default_rule(
    session: Session,
    source: OrcamentoItemCreate | OrcamentoItem,
    valor: Decimal,
    inicio_ano: int,
    inicio_mes: int,
) -> OrcamentoItemPadrao:
    fim_ano, fim_mes = _previous_month(inicio_ano, inicio_mes)
    regras = session.exec(select(OrcamentoItemPadrao).where(*_identity_filters(OrcamentoItemPadrao, source))).all()

    for regra in regras:
        if not regra.ativo:
            continue
        regra_inicio = _month_key(regra.inicio_ano, regra.inicio_mes)
        regra_fim = None if regra.fim_ano is None or regra.fim_mes is None else _month_key(regra.fim_ano, regra.fim_mes)
        novo_inicio = _month_key(inicio_ano, inicio_mes)
        if regra_inicio == novo_inicio:
            regra.valor_padrao = valor
            if not regra.categoria_nome_snapshot:
                regra.categoria_nome_snapshot, regra.subcategoria_nome_snapshot = _nome_snapshots(
                    session, regra.categoria_id, regra.subcategoria_id
                )
            regra.fim_ano = None
            regra.fim_mes = None
            regra.atualizado_em = now_utc()
            session.add(regra)
            return regra
        if regra_inicio < novo_inicio and (regra_fim is None or regra_fim >= novo_inicio):
            regra.fim_ano = fim_ano
            regra.fim_mes = fim_mes
            regra.atualizado_em = now_utc()
            session.add(regra)
        elif regra_inicio > novo_inicio and (regra_fim is None or regra_fim >= novo_inicio):
            regra.ativo = False
            regra.inativado_em = now_utc()
            regra.motivo_inativacao = "Substituido por novo valor padrao"
            session.add(regra)

    categoria_snapshot, subcategoria_snapshot = _nome_snapshots(session, source.categoria_id, source.subcategoria_id)
    novo = OrcamentoItemPadrao(
        tipo_item=source.tipo_item,
        natureza=source.natureza,
        categoria_id=source.categoria_id,
        subcategoria_id=source.subcategoria_id,
        categoria_nome_snapshot=categoria_snapshot,
        subcategoria_nome_snapshot=subcategoria_snapshot,
        valor_padrao=valor,
        inicio_ano=inicio_ano,
        inicio_mes=inicio_mes,
        ativo=True,
    )
    session.add(novo)
    return novo


def _encerrar_default_rules(
    session: Session,
    source: OrcamentoItem,
    inicio_ano: int,
    inicio_mes: int,
    motivo: str,
) -> None:
    fim_ano, fim_mes = _previous_month(inicio_ano, inicio_mes)
    inicio_key = _month_key(inicio_ano, inicio_mes)
    regras = session.exec(select(OrcamentoItemPadrao).where(*_identity_filters(OrcamentoItemPadrao, source))).all()
    for regra in regras:
        regra_inicio = _month_key(regra.inicio_ano, regra.inicio_mes)
        regra_fim = None if regra.fim_ano is None or regra.fim_mes is None else _month_key(regra.fim_ano, regra.fim_mes)
        if regra_fim is not None and regra_fim < inicio_key:
            continue
        if regra_inicio >= inicio_key:
            regra.ativo = False
            regra.inativado_em = now_utc()
            regra.motivo_inativacao = motivo
        else:
            regra.fim_ano = fim_ano
            regra.fim_mes = fim_mes
        regra.atualizado_em = now_utc()
        session.add(regra)


def _materializar_padroes_mes(session: Session, ano: int, mes: int) -> None:
    padroes = session.exec(select(OrcamentoItemPadrao)).all()
    alterou = False
    for padrao in padroes:
        if not _padrao_vale_no_mes(padrao, ano, mes):
            continue
        existente = session.exec(
            select(OrcamentoItem).where(
                OrcamentoItem.ano == ano,
                OrcamentoItem.mes == mes,
                *_identity_filters(OrcamentoItem, padrao),
            )
        ).first()
        if existente:
            continue
        session.add(
            OrcamentoItem(
                ano=ano,
                mes=mes,
                tipo_item=padrao.tipo_item,
                natureza=padrao.natureza,
                categoria_id=padrao.categoria_id,
                subcategoria_id=padrao.subcategoria_id,
                categoria_nome_snapshot=padrao.categoria_nome_snapshot,
                subcategoria_nome_snapshot=padrao.subcategoria_nome_snapshot,
                valor_orcado=padrao.valor_padrao,
                ativo=True,
            )
        )
        alterou = True
    if alterou:
        session.commit()


def materializar_itens_orcamento_mes(session: Session, ano: int, mes: int) -> None:
    _materializar_padroes_mes(session, ano, mes)


def adicionar_item_orcamento(session: Session, payload: OrcamentoItemCreate) -> OrcamentoItem:
    _validate_item_payload(session, payload)

    item = _upsert_monthly_item(session, payload.ano, payload.mes, payload, payload.valor_orcado)

    if payload.escopo == EscopoOrcamento.DESTE_MES_EM_DIANTE:
        _upsert_default_rule(session, payload, payload.valor_orcado, payload.ano, payload.mes)
    elif payload.escopo == EscopoOrcamento.PADRAO_PROXIMOS_MESES:
        inicio_ano, inicio_mes = _next_month(payload.ano, payload.mes)
        _upsert_default_rule(session, payload, payload.valor_orcado, inicio_ano, inicio_mes)

    session.commit()
    session.refresh(item)
    return item


def remover_item_orcamento(session: Session, item_id: str, escopo: EscopoOrcamento) -> None:
    item = session.get(OrcamentoItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item de planejamento nao encontrado.")

    if escopo == EscopoOrcamento.PADRAO_PROXIMOS_MESES:
        _encerrar_default_rules(session, item, item.ano, item.mes, "Removido do modelo padrao futuro")
        session.commit()
        return

    if escopo == EscopoOrcamento.SOMENTE_ESTE_MES:
        itens = [item]
    else:
        itens = session.exec(
            select(OrcamentoItem).where(
                *_identity_filters(OrcamentoItem, item),
                ((OrcamentoItem.ano > item.ano) | ((OrcamentoItem.ano == item.ano) & (OrcamentoItem.mes >= item.mes))),
            )
        ).all()
        _encerrar_default_rules(session, item, item.ano, item.mes, "Removido do planejamento futuro")

    for atual in itens:
        atual.ativo = False
        atual.inativado_em = now_utc()
        atual.motivo_inativacao = "Removido do planejamento"
        atual.atualizado_em = now_utc()
        session.add(atual)
    session.commit()


def atualizar_item_orcamento(
    session: Session, item_id: str, valor_orcado: Decimal, escopo: EscopoOrcamento
) -> list[OrcamentoItem]:
    if valor_orcado < 0:
        raise HTTPException(status_code=422, detail="Valor planejado nao pode ser negativo.")

    item = session.get(OrcamentoItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item de planejamento nao encontrado.")

    if escopo == EscopoOrcamento.PADRAO_PROXIMOS_MESES:
        inicio_ano, inicio_mes = _next_month(item.ano, item.mes)
        _upsert_default_rule(session, item, valor_orcado, inicio_ano, inicio_mes)
        session.commit()
        return []

    if escopo == EscopoOrcamento.SOMENTE_ESTE_MES:
        itens = [item]
    else:
        itens = session.exec(
            select(OrcamentoItem).where(
                *_identity_filters(OrcamentoItem, item),
                ((OrcamentoItem.ano > item.ano) | ((OrcamentoItem.ano == item.ano) & (OrcamentoItem.mes >= item.mes))),
            )
        ).all()
        _upsert_default_rule(session, item, valor_orcado, item.ano, item.mes)

    for atual in itens:
        atual.valor_orcado = valor_orcado
        atual.ativo = True
        atual.inativado_em = None
        atual.motivo_inativacao = None
        atual.atualizado_em = now_utc()
        session.add(atual)

    session.commit()
    for atual in itens:
        session.refresh(atual)
    return list(itens)


def _tipos_lancamento_por_natureza(natureza: NaturezaCategoria) -> list[TipoLancamento]:
    if natureza == NaturezaCategoria.INVESTIMENTO:
        return [TipoLancamento.INVESTIMENTO]
    if natureza == NaturezaCategoria.RECEITA:
        return [TipoLancamento.RECEITA]
    return [TipoLancamento.GASTO, TipoLancamento.SEPARAR]


def _realizado_item(session: Session, item: OrcamentoItem, ano: int, mes: int) -> Decimal:
    inicio, fim = month_bounds(ano, mes)
    filtros = [
        Lancamento.ativo.is_(True),
        Lancamento.tipo.in_(_tipos_lancamento_por_natureza(item.natureza)),
        Lancamento.afeta_orcamento.is_(True),
        Lancamento.transferencia_interna.is_(False),
        Lancamento.data_lancamento >= inicio,
        Lancamento.data_lancamento < fim,
    ]
    if item.natureza == NaturezaCategoria.GASTO:
        filtro_categoria_generica = filtro_excluir_categoria_cartao_generica(session)
        if filtro_categoria_generica is not None:
            filtros.append(filtro_categoria_generica)
    if item.tipo_item == TipoItemOrcamento.SUBCATEGORIA and item.subcategoria_id:
        filtros.append(Lancamento.subcategoria_id == item.subcategoria_id)
    else:
        filtros.append(Lancamento.categoria_id == item.categoria_id)
    return _decimal(session.exec(select(func.sum(Lancamento.valor)).where(*filtros)).one())


def _agrupar_lancamentos_orcamento(
    session: Session,
    ano: int,
    mes: int,
    meses_historico: int = 12,
) -> tuple[
    dict[tuple[int, int, NaturezaCategoria, str | None], Decimal],
    dict[tuple[int, int, NaturezaCategoria, str | None, str | None], Decimal],
]:
    meses_anteriores = _previous_months(ano, mes, meses_historico)
    ano_inicial, mes_inicial = meses_anteriores[-1] if meses_anteriores else (ano, mes)
    inicio, _ = month_bounds(ano_inicial, mes_inicial)
    _, fim = month_bounds(ano, mes)
    categorias_cartao = set(ids_categorias_cartao_genericas(session))

    filtros = [
        Lancamento.ativo.is_(True),
        Lancamento.afeta_orcamento.is_(True),
        Lancamento.transferencia_interna.is_(False),
        Lancamento.data_lancamento >= inicio,
        Lancamento.data_lancamento < fim,
        Lancamento.tipo.in_(
            [
                TipoLancamento.RECEITA,
                TipoLancamento.GASTO,
                TipoLancamento.SEPARAR,
                TipoLancamento.INVESTIMENTO,
            ]
        ),
    ]

    lancamentos = session.exec(select(Lancamento).where(*filtros)).all()
    por_categoria: dict[tuple[int, int, NaturezaCategoria, str | None], Decimal] = {}
    por_subcategoria: dict[tuple[int, int, NaturezaCategoria, str | None, str | None], Decimal] = {}

    for lancamento in lancamentos:
        if lancamento.cartao_id and lancamento.categoria_id in categorias_cartao:
            continue

        natureza = _natureza_lancamento(lancamento)
        chave_categoria = (
            lancamento.data_lancamento.year,
            lancamento.data_lancamento.month,
            natureza,
            lancamento.categoria_id,
        )
        por_categoria[chave_categoria] = por_categoria.get(chave_categoria, ZERO) + lancamento.valor

        if lancamento.subcategoria_id:
            chave_subcategoria = (
                lancamento.data_lancamento.year,
                lancamento.data_lancamento.month,
                natureza,
                lancamento.categoria_id,
                lancamento.subcategoria_id,
            )
            por_subcategoria[chave_subcategoria] = (
                por_subcategoria.get(chave_subcategoria, ZERO) + lancamento.valor
            )

    return por_categoria, por_subcategoria


def _realizado_item_agregado(
    item: OrcamentoItem,
    por_categoria: dict[tuple[int, int, NaturezaCategoria, str | None], Decimal],
    por_subcategoria: dict[tuple[int, int, NaturezaCategoria, str | None, str | None], Decimal],
    ano: int,
    mes: int,
) -> Decimal:
    if item.tipo_item == TipoItemOrcamento.SUBCATEGORIA and item.subcategoria_id:
        return por_subcategoria.get((ano, mes, item.natureza, item.categoria_id, item.subcategoria_id), ZERO)
    return por_categoria.get((ano, mes, item.natureza, item.categoria_id), ZERO)


def _media_historica_item_agregada(
    item: OrcamentoItem,
    por_categoria: dict[tuple[int, int, NaturezaCategoria, str | None], Decimal],
    por_subcategoria: dict[tuple[int, int, NaturezaCategoria, str | None, str | None], Decimal],
    ano: int,
    mes: int,
    quantidade_meses: int,
) -> Decimal:
    valores = [
        _realizado_item_agregado(item, por_categoria, por_subcategoria, ano_ref, mes_ref)
        for ano_ref, mes_ref in _previous_months(ano, mes, quantidade_meses)
    ]
    valores_com_dados = [valor for valor in valores if valor > 0]
    if not valores_com_dados:
        return ZERO
    return sum(valores_com_dados, ZERO) / Decimal(len(valores_com_dados))


def _situacao(item: OrcamentoItem, realizado: Decimal) -> str:
    if item.valor_orcado <= 0:
        return "SEM_PLANEJAMENTO"
    percentual = (realizado / item.valor_orcado) * Decimal("100")
    if item.natureza in {NaturezaCategoria.INVESTIMENTO, NaturezaCategoria.RECEITA}:
        if realizado <= 0:
            return "NAO_INICIADO"
        if percentual >= 100:
            return "CONCLUIDO"
        if percentual >= 80:
            return "DENTRO_DO_PLANEJADO"
        return "ABAIXO_DO_PLANEJADO"
    if percentual <= 80:
        return "DENTRO"
    if percentual <= 100:
        return "ATENCAO"
    return "ESTOURADO"


def listar_itens_orcamento_mes(session: Session, ano: int, mes: int) -> list[dict]:
    _materializar_padroes_mes(session, ano, mes)

    itens = session.exec(
        select(OrcamentoItem)
        .where(
            OrcamentoItem.ano == ano,
            OrcamentoItem.mes == mes,
            OrcamentoItem.ativo.is_(True),
        )
        .order_by(OrcamentoItem.natureza, OrcamentoItem.categoria_id, OrcamentoItem.subcategoria_id)
    ).all()

    categorias = _categorias_por_id(session, {item.categoria_id for item in itens})
    subcategorias = _subcategorias_por_id(session, {item.subcategoria_id for item in itens})
    por_categoria, por_subcategoria = _agrupar_lancamentos_orcamento(session, ano, mes)

    result: list[dict] = []
    for item in itens:
        categoria = categorias.get(item.categoria_id)
        subcategoria = subcategorias.get(item.subcategoria_id) if item.subcategoria_id else None
        categoria_nome = item.categoria_nome_snapshot or (categoria.nome if categoria else "")
        subcategoria_nome = item.subcategoria_nome_snapshot or (subcategoria.nome if subcategoria else None)
        realizado = _realizado_item_agregado(item, por_categoria, por_subcategoria, ano, mes)
        diferenca = item.valor_orcado - realizado
        percentual = Decimal("0.00") if item.valor_orcado == 0 else (realizado / item.valor_orcado) * Decimal("100")

        result.append(
            {
                "item_orcamento_id": item.id,
                "tipo_item": item.tipo_item,
                "natureza": item.natureza,
                "categoria_id": item.categoria_id,
                "categoria": categoria_nome,
                "categoria_ativa": categoria.ativa if categoria else False,
                "subcategoria_id": item.subcategoria_id,
                "subcategoria": subcategoria_nome,
                "subcategoria_ativa": subcategoria.ativa if subcategoria else None,
                "inativo_hoje": (categoria is not None and not categoria.ativa)
                or (subcategoria is not None and not subcategoria.ativa),
                "valor_orcado": item.valor_orcado,
                "gasto_real": realizado,
                "diferenca": diferenca,
                "percentual_usado": percentual,
                "media_3_meses": _media_historica_item_agregada(item, por_categoria, por_subcategoria, ano, mes, 3),
                "media_6_meses": _media_historica_item_agregada(item, por_categoria, por_subcategoria, ano, mes, 6),
                "media_12_meses": _media_historica_item_agregada(item, por_categoria, por_subcategoria, ano, mes, 12),
                "situacao": _situacao(item, realizado),
            }
        )
    return result


def _media_historica_item(session: Session, item: OrcamentoItem, quantidade: int) -> Decimal:
    meses = _previous_months(item.ano, item.mes, quantidade)
    valores = [_realizado_item(session, item, ano, mes) for ano, mes in meses]
    valores_com_dados = [value for value in valores if value > 0]
    if not valores_com_dados:
        return Decimal("0.00")
    return sum(valores_com_dados, Decimal("0.00")) / Decimal(len(valores_com_dados))


def copiar_itens_mes_anterior(session: Session, ano: int, mes: int, modo: str = "AUSENTES") -> list[OrcamentoItem]:
    mes_anterior, ano_anterior = (12, ano - 1) if mes == 1 else (mes - 1, ano)
    _materializar_padroes_mes(session, ano_anterior, mes_anterior)

    if modo == "SUBSTITUIR":
        existentes_mes = session.exec(
            select(OrcamentoItem).where(
                OrcamentoItem.ano == ano,
                OrcamentoItem.mes == mes,
                OrcamentoItem.ativo.is_(True),
            )
        ).all()
        for existente in existentes_mes:
            existente.ativo = False
            existente.inativado_em = now_utc()
            existente.motivo_inativacao = "Substituido pela copia do mes anterior"
            existente.atualizado_em = now_utc()
            session.add(existente)
        session.flush()

    itens_anterior = session.exec(
        select(OrcamentoItem).where(
            OrcamentoItem.ano == ano_anterior,
            OrcamentoItem.mes == mes_anterior,
            OrcamentoItem.ativo.is_(True),
        )
    ).all()

    criados: list[OrcamentoItem] = []
    for item_anterior in itens_anterior:
        existente = session.exec(
            select(OrcamentoItem).where(
                OrcamentoItem.ano == ano,
                OrcamentoItem.mes == mes,
                *_identity_filters(OrcamentoItem, item_anterior),
            )
        ).first()
        if existente:
            continue
        novo_item = OrcamentoItem(
            ano=ano,
            mes=mes,
            tipo_item=item_anterior.tipo_item,
            natureza=item_anterior.natureza,
            categoria_id=item_anterior.categoria_id,
            subcategoria_id=item_anterior.subcategoria_id,
            categoria_nome_snapshot=item_anterior.categoria_nome_snapshot,
            subcategoria_nome_snapshot=item_anterior.subcategoria_nome_snapshot,
            valor_orcado=item_anterior.valor_orcado,
            ativo=True,
        )
        session.add(novo_item)
        criados.append(novo_item)

    session.commit()
    for item in criados:
        session.refresh(item)
    return criados


def listar_nao_planejados_mes(
    session: Session,
    ano: int,
    mes: int,
    itens_planejados: list[dict] | None = None,
) -> list[dict]:
    if itens_planejados is None:
        itens_planejados = listar_itens_orcamento_mes(session, ano, mes)

    categorias_planejadas = {
        (item["natureza"], item["categoria_id"])
        for item in itens_planejados
        if item["tipo_item"] == TipoItemOrcamento.CATEGORIA
    }
    subcategorias_planejadas = {
        (item["natureza"], item["categoria_id"], item["subcategoria_id"])
        for item in itens_planejados
        if item["tipo_item"] == TipoItemOrcamento.SUBCATEGORIA
    }

    inicio, fim = month_bounds(ano, mes)
    filtros_lancamentos = [
        Lancamento.ativo.is_(True),
        Lancamento.afeta_orcamento.is_(True),
        Lancamento.transferencia_interna.is_(False),
        Lancamento.tipo.in_([TipoLancamento.GASTO, TipoLancamento.SEPARAR, TipoLancamento.INVESTIMENTO, TipoLancamento.RECEITA]),
        Lancamento.data_lancamento >= inicio,
        Lancamento.data_lancamento < fim,
    ]
    filtro_categoria_generica = filtro_excluir_categoria_cartao_generica(session)
    if filtro_categoria_generica is not None:
        filtros_lancamentos.append(filtro_categoria_generica)
    lancamentos = session.exec(
        select(Lancamento).where(*filtros_lancamentos)
    ).all()

    def esta_planejado(lancamento: Lancamento) -> bool:
        natureza = _natureza_lancamento(lancamento)
        return (natureza, lancamento.categoria_id) in categorias_planejadas or (
            natureza,
            lancamento.categoria_id,
            lancamento.subcategoria_id,
        ) in subcategorias_planejadas

    grupos: dict[tuple[NaturezaCategoria, str | None, str | None], dict] = {}
    for lancamento in lancamentos:
        if esta_planejado(lancamento):
            continue
        natureza = _natureza_lancamento(lancamento)
        chave = (natureza, lancamento.categoria_id, lancamento.subcategoria_id)
        if chave not in grupos:
            grupos[chave] = {
                "natureza": natureza,
                "categoria_id": lancamento.categoria_id,
                "categoria_snapshot": lancamento.categoria_nome_snapshot,
                "subcategoria_id": lancamento.subcategoria_id,
                "subcategoria_snapshot": lancamento.subcategoria_nome_snapshot,
                "valor_realizado": ZERO,
                "quantidade_lancamentos": 0,
            }
        grupos[chave]["valor_realizado"] += lancamento.valor
        grupos[chave]["quantidade_lancamentos"] += 1

    categorias = _categorias_por_id(session, {grupo["categoria_id"] for grupo in grupos.values()})
    subcategorias = _subcategorias_por_id(session, {grupo["subcategoria_id"] for grupo in grupos.values()})

    for grupo in grupos.values():
        categoria = categorias.get(grupo["categoria_id"])
        subcategoria = subcategorias.get(grupo["subcategoria_id"])
        grupo["categoria"] = grupo.pop("categoria_snapshot") or (categoria.nome if categoria else "Sem categoria")
        grupo["subcategoria"] = grupo.pop("subcategoria_snapshot") or (subcategoria.nome if subcategoria else None)

    return sorted(grupos.values(), key=lambda item: (str(item["natureza"]), item["categoria"], item["subcategoria"] or ""))


def upsert_orcamento(session: Session, payload: OrcamentoCreate) -> OrcamentoMensal:
    if payload.valor_orcado < 0:
        raise HTTPException(status_code=422, detail="Valor orcado nao pode ser negativo.")
    existente = session.exec(
        select(OrcamentoMensal).where(
            OrcamentoMensal.ano == payload.ano,
            OrcamentoMensal.mes == payload.mes,
            OrcamentoMensal.categoria_id == payload.categoria_id,
        )
    ).first()
    if existente:
        existente.valor_orcado = payload.valor_orcado
        existente.atualizado_em = now_utc()
        session.add(existente)
        session.commit()
        session.refresh(existente)
        return existente
    orcamento = OrcamentoMensal(**payload.model_dump())
    session.add(orcamento)
    session.commit()
    session.refresh(orcamento)
    return orcamento


def alterar_orcamento(session: Session, payload: OrcamentoAlterar) -> list[OrcamentoMensal]:
    if payload.valor_orcado < 0:
        raise HTTPException(status_code=422, detail="Valor orcado nao pode ser negativo.")
    categoria = session.get(Categoria, payload.categoria_id)
    if not categoria or not categoria.ativa:
        raise HTTPException(status_code=404, detail="Categoria nao encontrada.")

    alterados: list[OrcamentoMensal] = []
    if payload.escopo == EscopoOrcamento.SOMENTE_ESTE_MES:
        alterados.append(
            upsert_orcamento(
                session,
                OrcamentoCreate(
                    ano=payload.ano,
                    mes=payload.mes,
                    categoria_id=payload.categoria_id,
                    valor_orcado=payload.valor_orcado,
                ),
            )
        )
        return alterados

    if payload.escopo == EscopoOrcamento.PADRAO_PROXIMOS_MESES:
        padrao = session.exec(
            select(OrcamentoPadrao).where(OrcamentoPadrao.categoria_id == payload.categoria_id)
        ).first()
        if not padrao:
            padrao = OrcamentoPadrao(categoria_id=payload.categoria_id, valor_padrao=payload.valor_orcado)
        else:
            padrao.valor_padrao = payload.valor_orcado
            padrao.ativo = True
            padrao.atualizado_em = now_utc()
        session.add(padrao)
        session.commit()
        return []

    existentes = session.exec(
        select(OrcamentoMensal).where(
            OrcamentoMensal.categoria_id == payload.categoria_id,
            ((OrcamentoMensal.ano > payload.ano) | ((OrcamentoMensal.ano == payload.ano) & (OrcamentoMensal.mes >= payload.mes))),
        )
    ).all()
    if not any(item.ano == payload.ano and item.mes == payload.mes for item in existentes):
        existentes.append(
            OrcamentoMensal(
                ano=payload.ano,
                mes=payload.mes,
                categoria_id=payload.categoria_id,
                valor_orcado=payload.valor_orcado,
            )
        )
    for item in existentes:
        item.valor_orcado = payload.valor_orcado
        item.atualizado_em = now_utc()
        session.add(item)
        alterados.append(item)
    session.commit()
    for item in alterados:
        session.refresh(item)
    return alterados


def _previous_months(ano: int, mes: int, quantidade: int) -> list[tuple[int, int]]:
    result: list[tuple[int, int]] = []
    y, m = ano, mes
    for _ in range(quantidade):
        y, m = _previous_month(y, m)
        result.append((y, m))
    return result


def media_historica(session: Session, categoria_id: str, ano: int, mes: int, quantidade: int) -> Decimal:
    meses = _previous_months(ano, mes, quantidade)
    valores = [calcular_gasto_real_mes(session, y, m, categoria_id) for y, m in meses]
    valores_com_dados = [value for value in valores if value > 0]
    if not valores_com_dados:
        return Decimal("0.00")
    return sum(valores_com_dados, Decimal("0.00")) / Decimal(len(valores_com_dados))


def listar_orcamento_mes(session: Session, ano: int, mes: int) -> list[dict]:
    return listar_itens_orcamento_mes(session, ano, mes)
