from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.models.orcamento import OrcamentoMensal, OrcamentoItem
from app.schemas.orcamento_schema import (
    OrcamentoAlterar,
    OrcamentoCreate,
    OrcamentoUpdate,
    OrcamentoItemCreate,
    OrcamentoItemUpdate,
    OrcamentoItemRemover,
)
from app.services.orcamento_service import (
    alterar_orcamento,
    listar_orcamento_mes,
    upsert_orcamento,
    adicionar_item_orcamento,
    remover_item_orcamento,
    atualizar_item_orcamento,
    listar_itens_orcamento_mes,
    listar_nao_planejados_mes,
    copiar_itens_mes_anterior,
)

router = APIRouter(prefix="/orcamentos", tags=["orcamentos"])


# ============================================================================
# NOVAS ROTAS PARA OrcamentoItem
# ============================================================================


@router.post("/itens")
def criar_item(payload: OrcamentoItemCreate, session: Session = Depends(get_session)) -> dict:
    """Adiciona um item ao orçamento de um determinado mês."""
    item = adicionar_item_orcamento(session, payload)
    return {
        "id": item.id,
        "ano": item.ano,
        "mes": item.mes,
        "tipo_item": item.tipo_item,
        "natureza": item.natureza,
        "categoria_id": item.categoria_id,
        "subcategoria_id": item.subcategoria_id,
        "valor_orcado": item.valor_orcado,
        "ativo": item.ativo,
    }


@router.get("/itens/{ano}/{mes}")
def listar_itens(ano: int, mes: int, session: Session = Depends(get_session)) -> list[dict]:
    """Lista os itens explicitamente adicionados ao orçamento de um mês."""
    return listar_itens_orcamento_mes(session, ano, mes)


@router.put("/itens/{item_id}")
def atualizar_item(
    item_id: str, payload: OrcamentoItemUpdate, session: Session = Depends(get_session)
) -> list[dict]:
    """Atualiza um item de orçamento."""
    atualizados = atualizar_item_orcamento(session, item_id, payload.valor_orcado, payload.escopo)
    return [
        {
            "id": item.id,
            "ano": item.ano,
            "mes": item.mes,
            "valor_orcado": item.valor_orcado,
        }
        for item in atualizados
    ]


@router.delete("/itens/{item_id}")
def deletar_item(item_id: str, payload: OrcamentoItemRemover, session: Session = Depends(get_session)) -> dict:
    """Remove um item do orçamento."""
    remover_item_orcamento(session, item_id, payload.escopo)
    return {"status": "removido"}


@router.post("/{ano}/{mes}/copiar-anterior")
def copiar_anterior(ano: int, mes: int, modo: str = "AUSENTES", session: Session = Depends(get_session)) -> list[dict]:
    """Copia todos os itens do mês anterior para o mês atual."""
    criados = copiar_itens_mes_anterior(session, ano, mes, modo=modo)
    return [
        {
            "id": item.id,
            "ano": item.ano,
            "mes": item.mes,
            "tipo_item": item.tipo_item,
            "categoria_id": item.categoria_id,
            "valor_orcado": item.valor_orcado,
        }
        for item in criados
    ]


@router.get("/nao-planejados/{ano}/{mes}")
def listar_nao_planejados(ano: int, mes: int, session: Session = Depends(get_session)) -> list[dict]:
    return listar_nao_planejados_mes(session, ano, mes)


# ============================================================================
# ROTAS LEGADAS (para compatibilidade)
# ============================================================================


@router.get("")
def listar(ano: int, mes: int, session: Session = Depends(get_session)) -> list[dict]:
    """LEGACY: Lista todas as categorias ativas. Use /itens/{ano}/{mes} em vez disso."""
    return listar_orcamento_mes(session, ano, mes)


@router.post("")
def criar(payload: OrcamentoCreate, session: Session = Depends(get_session)) -> OrcamentoMensal:
    """LEGACY: Use POST /orcamentos/itens em vez disso."""
    return upsert_orcamento(session, payload)


@router.put("/{orcamento_id}")
def atualizar(orcamento_id: str, payload: OrcamentoUpdate, session: Session = Depends(get_session)) -> OrcamentoMensal:
    """LEGACY: Use PUT /orcamentos/itens/{item_id} em vez disso."""
    orcamento = session.get(OrcamentoMensal, orcamento_id)
    if not orcamento:
        raise HTTPException(status_code=404, detail="Orcamento nao encontrado.")
    orcamento.valor_orcado = payload.valor_orcado
    session.add(orcamento)
    session.commit()
    session.refresh(orcamento)
    return orcamento


@router.post("/alterar")
def alterar(payload: OrcamentoAlterar, session: Session = Depends(get_session)) -> list[OrcamentoMensal]:
    """LEGACY: Use PUT /orcamentos/itens/{item_id} em vez disso."""
    return alterar_orcamento(session, payload)


@router.get("/medias")
def medias(ano: int, mes: int, session: Session = Depends(get_session)) -> list[dict]:
    """LEGACY: Use GET /orcamentos/itens/{ano}/{mes} em vez disso."""
    return listar_orcamento_mes(session, ano, mes)
