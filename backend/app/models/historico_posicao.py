from datetime import date
from decimal import Decimal

from sqlalchemy import Column, Numeric, UniqueConstraint
from sqlmodel import Field

from app.models.base import IdMixin, Moeda, TimestampMixin, UserOwnedMixin, money_column


class HistoricoPosicaoInvestimentoMensal(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "historico_posicoes_investimentos_mensal"
    __table_args__ = (
        UniqueConstraint("user_id", "ativo_id", "ano", "mes", name="uq_historico_posicoes_ativo_periodo"),
    )

    ativo_id: str = Field(foreign_key="ativos.id", index=True)
    ano: int = Field(index=True)
    mes: int = Field(index=True)
    data_referencia: date = Field(index=True)
    quantidade_fim: Decimal | None = Field(default=None, sa_column=money_column(nullable=True, casas_decimais=8))
    preco_fim_original: Decimal | None = Field(default=None, sa_column=Column(Numeric(14, 4), nullable=True))
    moeda: Moeda = Field(default=Moeda.BRL, index=True)
    cotacao_brl: Decimal = Field(default=Decimal("1.00"), sa_column=Column(Numeric(14, 6), nullable=False))
    valor_fim_brl: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    aportes_periodo_brl: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    retiradas_periodo_brl: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    proventos_periodo_brl: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    fonte_valor: str = Field(default="RECONSTRUCAO", max_length=80)
    qualidade_dado: str = Field(default="COMPLETO", max_length=40)  # COMPLETO, PARCIAL
