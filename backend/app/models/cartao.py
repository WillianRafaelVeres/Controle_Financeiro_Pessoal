from datetime import datetime
from decimal import Decimal

from sqlmodel import Field

from app.models.base import IdMixin, TimestampMixin, money_column


class Cartao(IdMixin, TimestampMixin, table=True):
    __tablename__ = "cartoes"

    nome: str = Field(index=True, unique=True, min_length=1, max_length=120)
    instituicao: str | None = Field(default=None, max_length=120)
    limite_total: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    limite_utilizado_informado: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    fatura_atual_informada: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    dia_fechamento: int | None = Field(default=None, ge=1, le=31)
    dia_vencimento: int | None = Field(default=None, ge=1, le=31)
    cor_visual: str | None = Field(default="#16A34A", max_length=24)
    ativo: bool = Field(default=True, index=True)
    inativado_em: datetime | None = Field(default=None)
    motivo_inativacao: str | None = Field(default=None, max_length=250)
