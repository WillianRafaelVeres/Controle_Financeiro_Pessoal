from datetime import date
from decimal import Decimal

from sqlmodel import SQLModel

from app.models.base import Moeda, TipoProvento


class DividendoCreate(SQLModel):
    ativo_id: str | None = None
    tipo_provento: TipoProvento
    data_recebimento: date | None = None
    valor: Decimal
    moeda: Moeda = Moeda.BRL
    # Cotacao informada na tela. Quando preenchida tem prioridade sobre a busca
    # automatica, garantindo o lancamento mesmo com a API de cotacao fora do ar.
    cotacao_brl: Decimal | None = None
    conta_destino_id: str | None = None
    observacao: str | None = None


class DividendoUpdate(SQLModel):
    tipo_provento: TipoProvento | None = None
    data_recebimento: date | None = None
    valor: Decimal | None = None
    moeda: Moeda | None = None
    cotacao_brl: Decimal | None = None
    conta_destino_id: str | None = None
    observacao: str | None = None

