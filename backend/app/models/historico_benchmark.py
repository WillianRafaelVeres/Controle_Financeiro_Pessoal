from datetime import date
from decimal import Decimal

from sqlalchemy import Column, Numeric, UniqueConstraint
from sqlmodel import Field

from app.models.base import IdMixin, Moeda, TimestampMixin, UserOwnedMixin


class HistoricoBenchmark(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "historico_benchmarks"
    __table_args__ = (
        UniqueConstraint("codigo", "data_referencia", name="uq_historico_benchmarks_codigo_data"),
    )

    codigo: str = Field(index=True, max_length=50)  # CDI, IBOVESPA, IFIX, SP500_TR_USD, SP500_PRICE_USD, SP500_TR_BRL
    data_referencia: date = Field(index=True)
    valor: Decimal = Field(sa_column=Column(Numeric(14, 6), nullable=False))
    moeda: Moeda = Field(default=Moeda.BRL, index=True)
    tipo_retorno: str = Field(default="TOTAL_RETURN", max_length=40)  # TOTAL_RETURN, PRICE_RETURN, TAXA_DIARIA
    fonte: str = Field(default="SGS", max_length=80)
