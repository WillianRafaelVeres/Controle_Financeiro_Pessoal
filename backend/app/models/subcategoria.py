from datetime import datetime
from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.models.base import IdMixin, TimestampMixin, NaturezaCategoria, now_utc


class Subcategoria(IdMixin, TimestampMixin, table=True):
    __tablename__ = "subcategorias"
    __table_args__ = (UniqueConstraint("nome", "categoria_id", name="uq_subcategoria_categoria"),)

    nome: str = Field(index=True, min_length=1, max_length=120)
    categoria_id: str = Field(foreign_key="categorias.id", index=True)
    natureza: NaturezaCategoria = Field(default=NaturezaCategoria.GASTO, index=True)
    ativa: bool = Field(default=True, index=True)
    inativado_em: datetime | None = Field(default=None)
    motivo_inativacao: str | None = Field(default=None, max_length=250)

