from decimal import Decimal

from sqlmodel import Field

from app.models.base import IdMixin, TimestampMixin, UserOwnedMixin, money_column


class Caixinha(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "caixinhas"

    nome: str = Field(index=True, max_length=100)
    descricao: str | None = Field(default=None, max_length=500)
    categoria_id: str | None = Field(default=None, foreign_key="categorias.id", index=True)
    subcategoria_id: str | None = Field(default=None, foreign_key="subcategorias.id", index=True)
    metodo_pagamento_id: str | None = Field(default=None, foreign_key="metodos_pagamento.id", index=True)
    conta_id: str | None = Field(default=None, foreign_key="contas.id", index=True)
    valor_total: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    ativo: bool = Field(default=True, index=True)
