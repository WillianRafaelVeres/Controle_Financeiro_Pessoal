from datetime import date
from decimal import Decimal

from sqlmodel import Field

from app.models.base import IdMixin, TimestampMixin, TipoLancamento, money_column


class Lancamento(IdMixin, TimestampMixin, table=True):
    __tablename__ = "lancamentos"

    data_lancamento: date = Field(index=True)
    tipo: TipoLancamento = Field(index=True)
    valor: Decimal = Field(sa_column=money_column())
    valor_original: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    categoria_id: str | None = Field(default=None, foreign_key="categorias.id", index=True)
    subcategoria_id: str | None = Field(default=None, foreign_key="subcategorias.id", index=True)
    categoria_nome_snapshot: str | None = Field(default=None, max_length=120)
    subcategoria_nome_snapshot: str | None = Field(default=None, max_length=120)
    metodo_pagamento_id: str | None = Field(default=None, foreign_key="metodos_pagamento.id", index=True)
    conta_id: str | None = Field(default=None, foreign_key="contas.id", index=True)
    cartao_id: str | None = Field(default=None, foreign_key="cartoes.id", index=True)
    compromisso_cartao_id: str | None = Field(default=None, index=True)
    observacao: str | None = Field(default=None, max_length=500)
    afeta_saldo_livre: bool = Field(default=True, index=True)
    afeta_orcamento: bool = Field(default=True, index=True)
    transferencia_interna: bool = Field(default=False, index=True)
    ativo: bool = Field(default=True, index=True)
