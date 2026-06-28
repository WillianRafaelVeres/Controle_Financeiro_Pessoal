from sqlmodel import Field

from app.models.base import IdMixin, TimestampMixin, UserOwnedMixin


class Configuracao(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "configuracoes"

    chave: str = Field(index=True, min_length=1, max_length=120)
    valor: str = Field(default="", max_length=2000)

