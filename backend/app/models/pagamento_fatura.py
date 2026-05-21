from datetime import date
from decimal import Decimal

from sqlmodel import Field

from app.models.base import IdMixin, TimestampMixin, money_column


class PagamentoFatura(IdMixin, TimestampMixin, table=True):
    __tablename__ = "pagamentos_fatura"

    cartao_id: str = Field(foreign_key="cartoes.id", index=True)
    data_pagamento: date = Field(index=True)
    valor_pago: Decimal = Field(sa_column=money_column())
    conta_id: str | None = Field(default=None, foreign_key="contas.id", index=True)
    observacao: str | None = Field(default=None, max_length=500)

