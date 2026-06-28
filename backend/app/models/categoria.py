from datetime import datetime
from sqlmodel import Field

from app.models.base import IdMixin, TimestampMixin, UserOwnedMixin, NaturezaCategoria, now_utc


class Categoria(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "categorias"

    nome: str = Field(index=True, min_length=1, max_length=120)
    natureza: NaturezaCategoria = Field(default=NaturezaCategoria.GASTO, index=True)
    ativa: bool = Field(default=True, index=True)
    inativado_em: datetime | None = Field(default=None)
    motivo_inativacao: str | None = Field(default=None, max_length=250)


