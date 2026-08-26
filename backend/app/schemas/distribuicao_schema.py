from decimal import Decimal

from sqlmodel import SQLModel


class DistribuicaoItem(SQLModel):
    id: str
    nome: str
    percentual: Decimal
    # Se preenchido, esse item pode ser "expandido" na tela mostrando o
    # rateio de novo, dessa vez usando o plano referenciado.
    subplano_id: str | None = None


class DistribuicaoPlano(SQLModel):
    id: str
    nome: str
    itens: list[DistribuicaoItem]


class DistribuicaoPlanoCreate(SQLModel):
    nome: str
    itens: list[DistribuicaoItem]


class DistribuicaoPlanoUpdate(SQLModel):
    nome: str | None = None
    itens: list[DistribuicaoItem] | None = None
