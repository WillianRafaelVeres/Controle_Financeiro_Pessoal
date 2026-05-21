from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.base import now_utc
from app.models.categoria import Categoria
from app.models.subcategoria import Subcategoria
from app.schemas.subcategoria_schema import SubcategoriaCreate, SubcategoriaUpdate

router = APIRouter(prefix="/subcategorias", tags=["subcategorias"])


@router.get("")
def listar(
    categoria_id: str | None = None,
    incluir_inativas: bool = False,
    session: Session = Depends(get_session),
) -> list[Subcategoria]:
    statement = select(Subcategoria)
    if not incluir_inativas:
        statement = statement.where(Subcategoria.ativa.is_(True))
    if categoria_id:
        statement = statement.where(Subcategoria.categoria_id == categoria_id)
    return session.exec(statement.order_by(Subcategoria.nome)).all()


@router.post("")
def criar(payload: SubcategoriaCreate, session: Session = Depends(get_session)) -> Subcategoria:
    categoria = session.get(Categoria, payload.categoria_id)
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria nao encontrada.")
    if not categoria.ativa:
        raise HTTPException(status_code=422, detail="Nao e possivel criar subcategoria em categoria inativa.")

    if payload.natureza and payload.natureza != categoria.natureza:
        raise HTTPException(status_code=422, detail="Subcategoria deve ter a mesma natureza da categoria.")

    subcategoria = Subcategoria(
        nome=payload.nome.strip(),
        categoria_id=payload.categoria_id,
        natureza=categoria.natureza,
    )
    session.add(subcategoria)
    session.commit()
    session.refresh(subcategoria)
    return subcategoria


@router.put("/{subcategoria_id}")
def atualizar(subcategoria_id: str, payload: SubcategoriaUpdate, session: Session = Depends(get_session)) -> Subcategoria:
    subcategoria = session.get(Subcategoria, subcategoria_id)
    if not subcategoria:
        raise HTTPException(status_code=404, detail="Subcategoria nao encontrada.")

    data = payload.model_dump(exclude_unset=True)
    if "categoria_id" in data:
        categoria = session.get(Categoria, data["categoria_id"])
        if not categoria:
            raise HTTPException(status_code=404, detail="Categoria nao encontrada.")
        data["natureza"] = categoria.natureza
    elif "natureza" in data:
        categoria = session.get(Categoria, subcategoria.categoria_id)
        if categoria and data["natureza"] != categoria.natureza:
            raise HTTPException(status_code=422, detail="Subcategoria deve ter a mesma natureza da categoria.")

    for key, value in data.items():
        if key == "ativa" and value is False and subcategoria.ativa:
            subcategoria.ativa = False
            subcategoria.inativado_em = now_utc()
            subcategoria.motivo_inativacao = data.get("motivo_inativacao")
        else:
            setattr(subcategoria, key, value)

    subcategoria.atualizado_em = now_utc()
    session.add(subcategoria)
    session.commit()
    session.refresh(subcategoria)
    return subcategoria


@router.post("/{subcategoria_id}/reativar")
def reativar(subcategoria_id: str, session: Session = Depends(get_session)) -> Subcategoria:
    subcategoria = session.get(Subcategoria, subcategoria_id)
    if not subcategoria:
        raise HTTPException(status_code=404, detail="Subcategoria nao encontrada.")

    categoria = session.get(Categoria, subcategoria.categoria_id)
    if categoria and not categoria.ativa:
        raise HTTPException(status_code=422, detail="Reative a categoria antes de reativar a subcategoria.")

    subcategoria.ativa = True
    subcategoria.inativado_em = None
    subcategoria.motivo_inativacao = None
    subcategoria.atualizado_em = now_utc()

    session.add(subcategoria)
    session.commit()
    session.refresh(subcategoria)
    return subcategoria


@router.delete("/{subcategoria_id}", status_code=204)
def excluir(subcategoria_id: str, session: Session = Depends(get_session)) -> None:
    subcategoria = session.get(Subcategoria, subcategoria_id)
    if not subcategoria:
        raise HTTPException(status_code=404, detail="Subcategoria nao encontrada.")

    from app.models.lancamento import Lancamento
    from app.models.orcamento import OrcamentoItem, OrcamentoItemPadrao

    usada = (
        session.exec(select(Lancamento).where(Lancamento.subcategoria_id == subcategoria_id)).first()
        or session.exec(select(OrcamentoItem).where(OrcamentoItem.subcategoria_id == subcategoria_id)).first()
        or session.exec(select(OrcamentoItemPadrao).where(OrcamentoItemPadrao.subcategoria_id == subcategoria_id)).first()
    )

    if usada:
        subcategoria.ativa = False
        subcategoria.inativado_em = now_utc()
        subcategoria.motivo_inativacao = "Subcategoria removida pelo usuario"
        subcategoria.atualizado_em = now_utc()
        session.add(subcategoria)
    else:
        session.delete(subcategoria)
    session.commit()
