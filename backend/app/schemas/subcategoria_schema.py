from sqlmodel import SQLModel

from app.models.base import NaturezaCategoria


class SubcategoriaCreate(SQLModel):
    nome: str
    categoria_id: str
    natureza: NaturezaCategoria | None = None


class SubcategoriaUpdate(SQLModel):
    nome: str | None = None
    categoria_id: str | None = None
    natureza: NaturezaCategoria | None = None
    ativa: bool | None = None
    motivo_inativacao: str | None = None

