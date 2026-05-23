from datetime import date
from decimal import Decimal

from sqlmodel import SQLModel


class ContaFuturaCreate(SQLModel):
    descricao: str
    valor: Decimal
    categoria_id: str
    subcategoria_id: str
    metodo_pagamento_id: str
    conta_id: str | None = None
    data_vencimento: date | None = None
    observacao: str | None = None


class ContaFuturaUpdate(SQLModel):
    descricao: str | None = None
    valor: Decimal | None = None
    categoria_id: str | None = None
    subcategoria_id: str | None = None
    metodo_pagamento_id: str | None = None
    conta_id: str | None = None
    data_vencimento: date | None = None
    observacao: str | None = None


class PagarContaFutura(SQLModel):
    metodo_pagamento_id: str | None = None
    data_pagamento: date | None = None
    conta_id: str | None = None
    observacao: str | None = None
