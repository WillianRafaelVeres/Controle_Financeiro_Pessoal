from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from uuid import uuid4

from sqlalchemy import Column, Numeric
from sqlmodel import Field, SQLModel


def new_id() -> str:
    return str(uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def money_column(nullable: bool = False) -> Column:
    return Column(Numeric(14, 2), nullable=nullable)


class TimestampMixin(SQLModel):
    criado_em: datetime = Field(default_factory=now_utc)
    atualizado_em: datetime = Field(default_factory=now_utc)


class TipoLancamento(str, Enum):
    GASTO = "GASTO"
    RECEITA = "RECEITA"
    INVESTIMENTO = "INVESTIMENTO"
    DIVIDENDO = "DIVIDENDO"
    AJUSTE = "AJUSTE"


class TipoMetodo(str, Enum):
    PIX = "PIX"
    DEBITO = "DEBITO"
    DINHEIRO = "DINHEIRO"
    BOLETO = "BOLETO"
    CARTAO_CREDITO = "CARTAO_CREDITO"
    OUTRO = "OUTRO"


class TipoConta(str, Enum):
    CONTA_CORRENTE = "CONTA_CORRENTE"
    CARTEIRA_DIGITAL = "CARTEIRA_DIGITAL"
    CORRETORA = "CORRETORA"
    CONTA_EXTERIOR = "CONTA_EXTERIOR"
    DINHEIRO_FISICO = "DINHEIRO_FISICO"
    OUTRO = "OUTRO"
    GASTO = "GASTO"
    INVESTIMENTO = "INVESTIMENTO"
    RESERVA = "RESERVA"
    OUTRA = "OUTRA"


class StatusCompromisso(str, Enum):
    ABERTO = "ABERTO"
    PARCIAL = "PARCIAL"
    QUITADO = "QUITADO"
    CANCELADO = "CANCELADO"


class StatusContaFutura(str, Enum):
    ABERTA = "ABERTA"
    PAGA = "PAGA"
    CANCELADA = "CANCELADA"


class EscopoOrcamento(str, Enum):
    SOMENTE_ESTE_MES = "SOMENTE_ESTE_MES"
    DESTE_MES_EM_DIANTE = "DESTE_MES_EM_DIANTE"
    PADRAO_PROXIMOS_MESES = "PADRAO_PROXIMOS_MESES"


class TipoAtivo(str, Enum):
    CAIXINHA_CDB = "CAIXINHA_CDB"
    RESERVA_EMERGENCIA = "RESERVA_EMERGENCIA"
    RENDA_FIXA = "RENDA_FIXA"
    ACAO_BR = "ACAO_BR"
    FII = "FII"
    ETF_BR = "ETF_BR"
    EXTERIOR = "EXTERIOR"
    ACAO_EXTERIOR = "ACAO_EXTERIOR"
    ETF_EXTERIOR = "ETF_EXTERIOR"
    CRIPTO = "CRIPTO"
    DOLAR_CAIXA = "DOLAR_CAIXA"
    PREVIDENCIA = "PREVIDENCIA"
    OUTRO = "OUTRO"


class Moeda(str, Enum):
    BRL = "BRL"
    USD = "USD"
    EUR = "EUR"
    BTC = "BTC"
    OUTRA = "OUTRA"


class TipoMovimentoInvestimento(str, Enum):
    COMPRA = "COMPRA"
    VENDA = "VENDA"
    APORTE = "APORTE"
    RESGATE = "RESGATE"
    AJUSTE = "AJUSTE"


class TipoProvento(str, Enum):
    DIVIDENDO = "DIVIDENDO"
    JCP = "JCP"
    RENDIMENTO_FII = "RENDIMENTO_FII"
    DIVIDENDO_EXTERIOR = "DIVIDENDO_EXTERIOR"
    JUROS_RENDA_FIXA = "JUROS_RENDA_FIXA"
    OUTRO = "OUTRO"


class NaturezaCategoria(str, Enum):
    GASTO = "GASTO"
    RECEITA = "RECEITA"
    INVESTIMENTO = "INVESTIMENTO"


class TipoItemOrcamento(str, Enum):
    CATEGORIA = "CATEGORIA"
    SUBCATEGORIA = "SUBCATEGORIA"


class TipoMovimentoDolar(str, Enum):
    ENVIO = "ENVIO"
    RETIRADA = "RETIRADA"
    COMPRA_EXTERIOR = "COMPRA_EXTERIOR"
    VENDA_EXTERIOR = "VENDA_EXTERIOR"
    DIVIDENDO_EXTERIOR = "DIVIDENDO_EXTERIOR"
    AJUSTE_POSITIVO = "AJUSTE_POSITIVO"
    AJUSTE_NEGATIVO = "AJUSTE_NEGATIVO"
    SALDO_INFORMADO = "SALDO_INFORMADO"


class IdMixin(SQLModel):
    id: str = Field(default_factory=new_id, primary_key=True)


class MesAno(SQLModel):
    ano: int
    mes: int


def month_bounds(ano: int, mes: int) -> tuple[date, date]:
    inicio = date(ano, mes, 1)
    if mes == 12:
        fim = date(ano + 1, 1, 1)
    else:
        fim = date(ano, mes + 1, 1)
    return inicio, fim


ZERO = Decimal("0.00")
