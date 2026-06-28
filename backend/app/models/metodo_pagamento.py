from datetime import datetime

from sqlmodel import Field

from app.models.base import IdMixin, TimestampMixin, TipoMetodo, UserOwnedMixin


class MetodoPagamento(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "metodos_pagamento"

    nome: str = Field(index=True, min_length=1, max_length=120)
    tipo_metodo: TipoMetodo = Field(default=TipoMetodo.OUTRO, index=True)
    ativo: bool = Field(default=True)
    inativado_em: datetime | None = Field(default=None)
    motivo_inativacao: str | None = Field(default=None, max_length=250)
