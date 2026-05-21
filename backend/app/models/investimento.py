from datetime import date
from decimal import Decimal

from sqlmodel import Field

from app.models.base import (
    IdMixin,
    Moeda,
    TimestampMixin,
    TipoAtivo,
    TipoMovimentoInvestimento,
    money_column,
)


class Ativo(IdMixin, TimestampMixin, table=True):
    __tablename__ = "ativos"

    ticker: str = Field(index=True, unique=True, min_length=1, max_length=40)
    nome: str = Field(min_length=1, max_length=160)
    tipo_ativo: TipoAtivo = Field(index=True)
    moeda: Moeda = Field(default=Moeda.BRL, index=True)
    corretora: str | None = Field(default=None, max_length=120)
    ativo: bool = Field(default=True, index=True)


class MovimentoInvestimento(IdMixin, TimestampMixin, table=True):
    __tablename__ = "movimentos_investimento"

    ativo_id: str = Field(foreign_key="ativos.id", index=True)
    tipo_movimento: TipoMovimentoInvestimento = Field(index=True)
    data_movimento: date = Field(index=True)
    quantidade: Decimal = Field(sa_column=money_column())
    preco_unitario: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    valor_total: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    taxas: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    moeda: Moeda = Field(default=Moeda.BRL, index=True)
    conta_id: str | None = Field(default=None, foreign_key="contas.id", index=True)
    observacao: str | None = Field(default=None, max_length=500)

