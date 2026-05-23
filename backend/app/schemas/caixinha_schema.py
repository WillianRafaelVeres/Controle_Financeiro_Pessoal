from datetime import datetime
from datetime import date
from decimal import Decimal

from sqlmodel import SQLModel


class CaixinhaCreate(SQLModel):
    nome: str
    descricao: str | None = None
    categoria_id: str
    subcategoria_id: str
    metodo_pagamento_id: str | None = None
    conta_id: str | None = None


class CaixinhaUpdate(SQLModel):
    nome: str | None = None
    descricao: str | None = None
    categoria_id: str | None = None
    subcategoria_id: str | None = None
    metodo_pagamento_id: str | None = None
    conta_id: str | None = None


class UsarCaixinha(SQLModel):
    valor: Decimal
    data_lancamento: date | None = None
    metodo_pagamento_id: str | None = None
    cartao_id: str | None = None
    conta_id: str | None = None
    observacao: str | None = None


class CaixinhaSchema(SQLModel):
    id: str | None = None
    nome: str
    descricao: str | None = None
    categoria_id: str | None = None
    subcategoria_id: str | None = None
    metodo_pagamento_id: str | None = None
    conta_id: str | None = None
    valor_total: Decimal
    ativo: bool = True
    criado_em: datetime | None = None
    atualizado_em: datetime | None = None
