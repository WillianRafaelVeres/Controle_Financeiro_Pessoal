from datetime import date
from decimal import Decimal

from sqlmodel import Field

from app.models.base import IdMixin, TimestampMixin, TipoMovimentoDolar, UserOwnedMixin, money_column


class ExtratoDolar(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "extrato_dolar"

    data_movimento: date = Field(index=True)
    tipo: TipoMovimentoDolar = Field(index=True)
    descricao: str | None = Field(default=None, max_length=500)
    entrada_usd: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    saida_usd: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    valor_brl: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    cotacao_efetiva: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    origem: str = Field(default="MANUAL", index=True, max_length=80)
    referencia_id: str | None = Field(default=None, index=True)
    ativo: bool = Field(default=True, index=True)
