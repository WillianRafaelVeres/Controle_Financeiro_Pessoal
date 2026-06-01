from datetime import date
from decimal import Decimal

from sqlmodel import SQLModel

from app.models.base import Moeda, TipoAtivo, TipoControleInvestimento


class AtivoCreate(SQLModel):
    ticker: str
    nome: str
    tipo_ativo: TipoAtivo
    tipo_controle: TipoControleInvestimento | None = None
    moeda: Moeda = Moeda.BRL
    corretora: str | None = None


class AtivoUpdate(SQLModel):
    ticker: str | None = None
    nome: str | None = None
    tipo_ativo: TipoAtivo | None = None
    tipo_controle: TipoControleInvestimento | None = None
    moeda: Moeda | None = None
    corretora: str | None = None
    ativo: bool | None = None


class MovimentoInvestimentoCreate(SQLModel):
    ativo_id: str | None = None
    ticker: str | None = None
    nome: str | None = None
    tipo_ativo: TipoAtivo | None = None
    tipo_controle: TipoControleInvestimento | None = None
    data_movimento: date | None = None
    quantidade: Decimal | None = None
    preco_unitario: Decimal | None = None
    valor_total: Decimal | None = None
    taxas: Decimal = Decimal("0.00")
    moeda: Moeda | None = None
    corretora: str | None = None
    conta_id: str | None = None
    observacao: str | None = None


class MovimentoInvestimentoUpdate(SQLModel):
    data_movimento: date | None = None
    quantidade: Decimal | None = None
    preco_unitario: Decimal | None = None
    valor_total: Decimal | None = None
    taxas: Decimal | None = None
    corretora: str | None = None
    conta_id: str | None = None
    observacao: str | None = None


class CotacaoAtivoCreate(SQLModel):
    preco: Decimal
