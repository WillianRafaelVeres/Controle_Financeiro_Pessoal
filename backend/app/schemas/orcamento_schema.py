from datetime import datetime
from decimal import Decimal

from sqlmodel import SQLModel

from app.models.base import EscopoOrcamento, TipoItemOrcamento, NaturezaCategoria


class OrcamentoCreate(SQLModel):
    ano: int
    mes: int
    categoria_id: str
    valor_orcado: Decimal


class OrcamentoUpdate(SQLModel):
    valor_orcado: Decimal


class OrcamentoAlterar(SQLModel):
    categoria_id: str
    ano: int
    mes: int
    valor_orcado: Decimal
    escopo: EscopoOrcamento


class OrcamentoItemCreate(SQLModel):
    ano: int
    mes: int
    tipo_item: TipoItemOrcamento
    natureza: NaturezaCategoria
    categoria_id: str
    subcategoria_id: str | None = None
    valor_orcado: Decimal
    escopo: EscopoOrcamento = EscopoOrcamento.SOMENTE_ESTE_MES


class OrcamentoItemUpdate(SQLModel):
    valor_orcado: Decimal
    escopo: EscopoOrcamento = EscopoOrcamento.SOMENTE_ESTE_MES


class OrcamentoItemRemover(SQLModel):
    escopo: EscopoOrcamento = EscopoOrcamento.SOMENTE_ESTE_MES
