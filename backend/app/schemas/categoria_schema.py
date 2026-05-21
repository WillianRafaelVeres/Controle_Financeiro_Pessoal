from sqlmodel import SQLModel

from app.models.base import NaturezaCategoria


class CategoriaCreate(SQLModel):
    nome: str
    natureza: NaturezaCategoria = NaturezaCategoria.GASTO


class CategoriaUpdate(SQLModel):
    nome: str | None = None
    natureza: NaturezaCategoria | None = None
    ativa: bool | None = None
    motivo_inativacao: str | None = None

