from datetime import date
from decimal import Decimal

from sqlmodel import Field

from app.models.base import IdMixin, StatusCompromisso, TimestampMixin, money_column


class CompromissoCartao(IdMixin, TimestampMixin, table=True):
    __tablename__ = "compromissos_cartao"

    cartao_id: str = Field(foreign_key="cartoes.id", index=True)
    lancamento_origem_id: str | None = Field(default=None, foreign_key="lancamentos.id", index=True)
    categoria_id: str | None = Field(default=None, foreign_key="categorias.id", index=True)
    subcategoria_id: str | None = Field(default=None, foreign_key="subcategorias.id", index=True)
    metodo_pagamento_id: str | None = Field(default=None, foreign_key="metodos_pagamento.id", index=True)
    data_compra: date = Field(index=True)
    valor_original: Decimal = Field(sa_column=money_column())
    valor_separado: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    valor_em_aberto: Decimal = Field(sa_column=money_column())
    quantidade_parcelas: int | None = Field(default=None, ge=1)
    descricao: str | None = Field(default=None, max_length=500)
    status: StatusCompromisso = Field(default=StatusCompromisso.ABERTO, index=True)
    ativo: bool = Field(default=True, index=True)

