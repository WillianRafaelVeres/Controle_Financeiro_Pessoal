from datetime import date
from decimal import Decimal

from sqlmodel import Field

from app.models.base import IdMixin, Moeda, TimestampMixin, TipoProvento, money_column


class Dividendo(IdMixin, TimestampMixin, table=True):
    __tablename__ = "dividendos"

    ativo_id: str = Field(foreign_key="ativos.id", index=True)
    tipo_provento: TipoProvento = Field(index=True)
    data_recebimento: date = Field(index=True)
    valor: Decimal = Field(sa_column=money_column())
    moeda: Moeda = Field(default=Moeda.BRL, index=True)
    conta_destino_id: str | None = Field(default=None, foreign_key="contas.id", index=True)
    observacao: str | None = Field(default=None, max_length=500)

