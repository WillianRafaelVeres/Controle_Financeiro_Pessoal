from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.base import NaturezaCategoria, now_utc
from app.models.categoria import Categoria
from app.schemas.categoria_schema import CategoriaCreate, CategoriaUpdate

router = APIRouter(prefix="/categorias", tags=["categorias"])


@router.get("")
def listar(
    natureza: NaturezaCategoria | None = None,
    incluir_inativas: bool = False,
    session: Session = Depends(get_session),
) -> list[Categoria]:
    query = select(Categoria)
    if not incluir_inativas:
        query = query.where(Categoria.ativa.is_(True))
    if natureza:
        query = query.where(Categoria.natureza == natureza)
    return session.exec(query.order_by(Categoria.nome)).all()


@router.post("")
def criar(payload: CategoriaCreate, session: Session = Depends(get_session)) -> Categoria:
    categoria = Categoria(nome=payload.nome.strip(), natureza=payload.natureza)
    session.add(categoria)
    session.commit()
    session.refresh(categoria)
    return categoria


@router.get("/categoria-investimentos")
def categoria_investimentos(session: Session = Depends(get_session)) -> Categoria:
    categoria = session.exec(select(Categoria).where(Categoria.nome == "Investimentos")).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria Investimentos nao encontrada.")
    return categoria


@router.put("/{categoria_id}")
def atualizar(categoria_id: str, payload: CategoriaUpdate, session: Session = Depends(get_session)) -> Categoria:
    categoria = session.get(Categoria, categoria_id)
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria nao encontrada.")

    data = payload.model_dump(exclude_unset=True)
    if categoria.nome == "Investimentos" and data.get("ativa") is False:
        raise HTTPException(status_code=422, detail="Categoria sistemica Investimentos nao pode ser inativada.")

    for key, value in data.items():
        if key == "ativa" and value is False and categoria.ativa:
            categoria.ativa = False
            categoria.inativado_em = now_utc()
            categoria.motivo_inativacao = data.get("motivo_inativacao")
        else:
            setattr(categoria, key, value)

    if "natureza" in data:
        from app.models.subcategoria import Subcategoria

        subcategorias = session.exec(select(Subcategoria).where(Subcategoria.categoria_id == categoria.id)).all()
        for subcategoria in subcategorias:
            subcategoria.natureza = categoria.natureza
            subcategoria.atualizado_em = now_utc()
            session.add(subcategoria)

    categoria.atualizado_em = now_utc()
    session.add(categoria)
    session.commit()
    session.refresh(categoria)
    return categoria


@router.post("/{categoria_id}/reativar")
def reativar(categoria_id: str, session: Session = Depends(get_session)) -> Categoria:
    categoria = session.get(Categoria, categoria_id)
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria nao encontrada.")

    categoria.ativa = True
    categoria.inativado_em = None
    categoria.motivo_inativacao = None
    categoria.atualizado_em = now_utc()

    session.add(categoria)
    session.commit()
    session.refresh(categoria)
    return categoria


@router.delete("/{categoria_id}", status_code=204)
def excluir(categoria_id: str, session: Session = Depends(get_session)) -> None:
    categoria = session.get(Categoria, categoria_id)
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria nao encontrada.")
    if categoria.nome == "Investimentos":
        raise HTTPException(status_code=422, detail="Categoria sistemica Investimentos nao pode ser excluida.")

    from app.models.lancamento import Lancamento
    from app.models.orcamento import OrcamentoItem, OrcamentoItemPadrao
    from app.models.subcategoria import Subcategoria

    usada = (
        session.exec(select(Lancamento).where(Lancamento.categoria_id == categoria_id)).first()
        or session.exec(select(OrcamentoItem).where(OrcamentoItem.categoria_id == categoria_id)).first()
        or session.exec(select(OrcamentoItemPadrao).where(OrcamentoItemPadrao.categoria_id == categoria_id)).first()
        or session.exec(select(Subcategoria).where(Subcategoria.categoria_id == categoria_id)).first()
    )

    if usada:
        categoria.ativa = False
        categoria.inativado_em = now_utc()
        categoria.motivo_inativacao = "Categoria removida pelo usuario"
        categoria.atualizado_em = now_utc()
        session.add(categoria)
    else:
        session.delete(categoria)
    session.commit()
