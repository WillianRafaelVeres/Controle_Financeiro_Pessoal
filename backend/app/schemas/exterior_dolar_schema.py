from datetime import date
from decimal import Decimal

from sqlmodel import SQLModel

from app.models.base import TipoMovimentoDolar


class MovimentoDolarCreate(SQLModel):
    tipo: TipoMovimentoDolar
    data_movimento: date | None = None
    valor_usd: Decimal
    valor_brl: Decimal | None = None
    descricao: str | None = None


class SaldoDolarInformado(SQLModel):
    saldo_usd: Decimal
    cotacao_brl: Decimal | None = None
