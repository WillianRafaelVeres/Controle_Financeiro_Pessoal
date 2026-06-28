from datetime import date
from decimal import Decimal

from sqlalchemy import Column, Numeric
from sqlmodel import Field

from app.models.base import IdMixin, Moeda, TimestampMixin, TipoProvento, UserOwnedMixin, money_column


class Dividendo(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "dividendos"

    ativo_id: str = Field(foreign_key="ativos.id", index=True)
    tipo_provento: TipoProvento = Field(index=True)
    data_recebimento: date = Field(index=True)
    valor: Decimal = Field(sa_column=money_column())
    moeda: Moeda = Field(default=Moeda.BRL, index=True)
    valor_brl: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    cotacao_brl: Decimal | None = Field(default=None, sa_column=Column(Numeric(14, 6), nullable=True))
    data_cotacao: date | None = Field(default=None, index=True)
    fonte_cotacao: str | None = Field(default=None, max_length=80)
    conta_destino_id: str | None = Field(default=None, foreign_key="contas.id", index=True)
    observacao: str | None = Field(default=None, max_length=500)
