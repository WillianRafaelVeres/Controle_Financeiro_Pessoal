from decimal import Decimal

from sqlalchemy import Column, Numeric, UniqueConstraint
from sqlmodel import Field

from app.models.base import IdMixin, TimestampMixin, UserOwnedMixin, money_column


class HistoricoInvestimentoMensal(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "historico_investimentos_mensal"
    __table_args__ = (UniqueConstraint("user_id", "ano", "mes", name="uq_historico_investimentos_mensal_periodo"),)

    ano: int = Field(index=True)
    mes: int = Field(index=True)
    patrimonio_atual_brl: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    total_aportado_brl: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    lucro_prejuizo_brl: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    dividendos_brl: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    rentabilidade_percentual: Decimal = Field(default=Decimal("0.00"), sa_column=Column(Numeric(14, 4), nullable=False))
