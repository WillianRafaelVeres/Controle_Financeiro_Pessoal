from datetime import date
from decimal import Decimal

from sqlmodel import Field

from app.models.base import IdMixin, TimestampMixin, UserOwnedMixin, money_column


class Meta(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "metas"

    nome: str = Field(index=True, min_length=1, max_length=120)
    valor_alvo: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    valor_atual: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    data_alvo: date | None = Field(default=None)
    ativa: bool = Field(default=True, index=True)

