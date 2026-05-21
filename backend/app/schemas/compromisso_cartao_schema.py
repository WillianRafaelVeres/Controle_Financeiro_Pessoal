from datetime import date
from decimal import Decimal

from sqlmodel import SQLModel


class SepararCompromisso(SQLModel):
    valor: Decimal
    data: date | None = None
    observacao: str | None = None


class CompromissoUpdate(SQLModel):
    descricao: str | None = None
    quantidade_parcelas: int | None = None

