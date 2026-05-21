from datetime import date, datetime
from decimal import Decimal

from sqlmodel import Field

from app.models.base import IdMixin, Moeda, TimestampMixin, TipoConta, money_column


class Conta(IdMixin, TimestampMixin, table=True):
    __tablename__ = "contas"

    nome: str = Field(index=True, unique=True, min_length=1, max_length=120)
    banco: str | None = Field(default=None, max_length=120)
    instituicao: str | None = Field(default=None, max_length=120)
    tipo_conta: TipoConta = Field(default=TipoConta.CONTA_CORRENTE, index=True)
    moeda: Moeda = Field(default=Moeda.BRL, index=True)
    saldo_inicial: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    saldo_atual_informado: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    conta_gasto: bool = Field(default=True, index=True)
    entra_no_saldo_em_contas: bool = Field(default=True, index=True)
    ativa: bool = Field(default=True, index=True)
    inativado_em: datetime | None = Field(default=None)


class ContaSaldo(IdMixin, TimestampMixin, table=True):
    __tablename__ = "conta_saldos"

    conta_id: str = Field(foreign_key="contas.id", index=True)
    data_referencia: date = Field(index=True)
    saldo_informado: Decimal = Field(sa_column=money_column())
    observacao: str | None = Field(default=None, max_length=500)
