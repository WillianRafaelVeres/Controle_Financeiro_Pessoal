from datetime import datetime
from decimal import Decimal

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.models.base import (
    IdMixin,
    TimestampMixin,
    TipoItemOrcamento,
    NaturezaCategoria,
    UserOwnedMixin,
    money_column,
    now_utc,
)


class OrcamentoItem(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "orcamento_itens"
    __table_args__ = (
        UniqueConstraint("ano", "mes", "categoria_id", "subcategoria_id", name="uq_orcamento_item_mes"),
    )

    ano: int = Field(index=True)
    mes: int = Field(index=True, ge=1, le=12)
    tipo_item: TipoItemOrcamento = Field(index=True)
    natureza: NaturezaCategoria = Field(index=True)
    categoria_id: str = Field(foreign_key="categorias.id", index=True)
    subcategoria_id: str | None = Field(default=None, foreign_key="subcategorias.id", index=True)
    categoria_nome_snapshot: str | None = Field(default=None, max_length=120)
    subcategoria_nome_snapshot: str | None = Field(default=None, max_length=120)
    valor_orcado: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    ativo: bool = Field(default=True, index=True)
    inativado_em: datetime | None = Field(default=None)
    motivo_inativacao: str | None = Field(default=None, max_length=250)


class OrcamentoItemPadrao(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "orcamento_itens_padrao"
    __table_args__ = (
        UniqueConstraint(
            "tipo_item",
            "natureza",
            "categoria_id",
            "subcategoria_id",
            "inicio_ano",
            "inicio_mes",
            name="uq_orcamento_item_padrao_inicio",
        ),
    )

    tipo_item: TipoItemOrcamento = Field(index=True)
    natureza: NaturezaCategoria = Field(index=True)
    categoria_id: str = Field(foreign_key="categorias.id", index=True)
    subcategoria_id: str | None = Field(default=None, foreign_key="subcategorias.id", index=True)
    categoria_nome_snapshot: str | None = Field(default=None, max_length=120)
    subcategoria_nome_snapshot: str | None = Field(default=None, max_length=120)
    valor_padrao: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    inicio_ano: int = Field(index=True)
    inicio_mes: int = Field(index=True, ge=1, le=12)
    fim_ano: int | None = Field(default=None, index=True)
    fim_mes: int | None = Field(default=None, index=True, ge=1, le=12)
    ativo: bool = Field(default=True, index=True)
    inativado_em: datetime | None = Field(default=None)
    motivo_inativacao: str | None = Field(default=None, max_length=250)


class OrcamentoMensal(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "orcamentos_mensais"
    __table_args__ = (UniqueConstraint("ano", "mes", "categoria_id", name="uq_orcamento_mes_categoria"),)

    ano: int = Field(index=True)
    mes: int = Field(index=True, ge=1, le=12)
    categoria_id: str = Field(foreign_key="categorias.id", index=True)
    valor_orcado: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())


class OrcamentoPadrao(IdMixin, UserOwnedMixin, TimestampMixin, table=True):
    __tablename__ = "orcamento_padrao"

    categoria_id: str = Field(foreign_key="categorias.id", index=True, unique=True)
    valor_padrao: Decimal = Field(default=Decimal("0.00"), sa_column=money_column())
    ativo: bool = Field(default=True, index=True)
