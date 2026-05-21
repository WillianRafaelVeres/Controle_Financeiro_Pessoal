from datetime import date
from decimal import Decimal

from sqlmodel import Field

from app.models.base import IdMixin, StatusContaFutura, TimestampMixin, money_column


class ContaFutura(IdMixin, TimestampMixin, table=True):
    __tablename__ = "contas_futuras"

    descricao: str = Field(max_length=160, index=True)
    data_vencimento: date | None = Field(default=None, index=True)
    categoria_id: str = Field(foreign_key="categorias.id", index=True)
    subcategoria_id: str = Field(foreign_key="subcategorias.id", index=True)
    metodo_pagamento_id: str | None = Field(default=None, foreign_key="metodos_pagamento.id", index=True)
    valor: Decimal = Field(sa_column=money_column())
    status: StatusContaFutura = Field(default=StatusContaFutura.ABERTA, index=True)
    lancamento_pagamento_id: str | None = Field(default=None, foreign_key="lancamentos.id", index=True)
    observacao: str | None = Field(default=None, max_length=500)
    ativo: bool = Field(default=True, index=True)
