from datetime import date
from decimal import Decimal

from sqlmodel import Field

from app.models.base import IdMixin, Moeda, TimestampMixin, money_column


class Cotacao(IdMixin, TimestampMixin, table=True):
    __tablename__ = "cotacoes"

    ativo_id: str | None = Field(default=None, foreign_key="ativos.id", index=True)
    simbolo: str = Field(index=True, max_length=40)
    fonte: str = Field(default="MANUAL", max_length=80)
    data_cotacao: date = Field(index=True)
    preco: Decimal = Field(sa_column=money_column())
    moeda: Moeda = Field(default=Moeda.BRL, index=True)


class CompraDolar(IdMixin, TimestampMixin, table=True):
    __tablename__ = "compras_dolar"

    data_compra: date = Field(index=True)
    valor_brl: Decimal = Field(sa_column=money_column())
    valor_usd: Decimal = Field(sa_column=money_column())
    cotacao_efetiva: Decimal = Field(sa_column=money_column())
    taxas_brl: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    conta_destino_id: str | None = Field(default=None, foreign_key="contas.id", index=True)
    observacao: str | None = Field(default=None, max_length=500)

