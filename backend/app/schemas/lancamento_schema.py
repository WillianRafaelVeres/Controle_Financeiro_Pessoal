from datetime import date
from decimal import Decimal

from sqlmodel import SQLModel

from app.models.base import TipoLancamento
from app.schemas.investimento_schema import MovimentoInvestimentoCreate


class CartaoLancamentoInput(SQLModel):
    cartao_id: str
    valor_separado_agora: Decimal = Decimal("0.00")
    quantidade_parcelas: int | None = None
    descricao_compromisso: str | None = None


class LancamentoCreate(SQLModel):
    valor: Decimal
    tipo: TipoLancamento
    categoria_id: str | None = None
    subcategoria_id: str | None = None
    metodo_pagamento_id: str | None = None
    conta_id: str | None = None
    caixinha_id: str | None = None
    caixinha_nome: str | None = None
    observacao: str | None = None
    data_lancamento: date | None = None
    transferencia_interna: bool = False
    cartao: CartaoLancamentoInput | None = None
    movimento_investimento: MovimentoInvestimentoCreate | None = None


class LancamentoUpdate(SQLModel):
    valor: Decimal | None = None
    tipo: TipoLancamento | None = None
    categoria_id: str | None = None
    subcategoria_id: str | None = None
    metodo_pagamento_id: str | None = None
    conta_id: str | None = None
    caixinha_id: str | None = None
    caixinha_nome: str | None = None
    observacao: str | None = None
    data_lancamento: date | None = None
    movimento_investimento: MovimentoInvestimentoCreate | None = None
