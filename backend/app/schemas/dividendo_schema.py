from datetime import date
from decimal import Decimal

from sqlmodel import SQLModel

from app.models.base import Moeda, TipoProvento


class DividendoCreate(SQLModel):
    ativo_id: str
    tipo_provento: TipoProvento
    data_recebimento: date | None = None
    valor: Decimal
    moeda: Moeda = Moeda.BRL
    conta_destino_id: str | None = None
    observacao: str | None = None


class DividendoUpdate(SQLModel):
    tipo_provento: TipoProvento | None = None
    data_recebimento: date | None = None
    valor: Decimal | None = None
    moeda: Moeda | None = None
    conta_destino_id: str | None = None
    observacao: str | None = None

