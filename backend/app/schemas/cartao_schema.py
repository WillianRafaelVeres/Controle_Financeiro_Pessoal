from decimal import Decimal

from sqlmodel import SQLModel


class CartaoCreate(SQLModel):
    nome: str
    instituicao: str | None = None
    limite_total: Decimal = Decimal("0.00")
    dia_fechamento: int | None = None
    dia_vencimento: int | None = None
    cor_visual: str | None = "#16A34A"


class CartaoUpdate(SQLModel):
    nome: str | None = None
    instituicao: str | None = None
    limite_total: Decimal | None = None
    limite_utilizado_informado: Decimal | None = None
    fatura_atual_informada: Decimal | None = None
    dia_fechamento: int | None = None
    dia_vencimento: int | None = None
    cor_visual: str | None = None
    ativo: bool | None = None


class InformarFatura(SQLModel):
    valor: Decimal


class PagarFatura(SQLModel):
    valor_pago: Decimal
    conta_id: str | None = None
    observacao: str | None = None

