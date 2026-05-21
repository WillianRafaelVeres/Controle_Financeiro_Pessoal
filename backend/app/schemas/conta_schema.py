from datetime import date
from decimal import Decimal

from sqlmodel import SQLModel

from app.models.base import Moeda, TipoConta


class ContaCreate(SQLModel):
    nome: str
    banco: str | None = None
    instituicao: str | None = None
    tipo_conta: TipoConta = TipoConta.CONTA_CORRENTE
    moeda: Moeda = Moeda.BRL
    saldo_inicial: Decimal = Decimal("0.00")
    saldo_atual_informado: Decimal | None = None
    conta_gasto: bool = True
    entra_no_saldo_em_contas: bool = True


class ContaUpdate(SQLModel):
    nome: str | None = None
    banco: str | None = None
    instituicao: str | None = None
    tipo_conta: TipoConta | None = None
    moeda: Moeda | None = None
    saldo_inicial: Decimal | None = None
    saldo_atual_informado: Decimal | None = None
    conta_gasto: bool | None = None
    entra_no_saldo_em_contas: bool | None = None
    ativa: bool | None = None


class ContaSaldoCreate(SQLModel):
    data_referencia: date | None = None
    saldo_informado: Decimal
    observacao: str | None = None
