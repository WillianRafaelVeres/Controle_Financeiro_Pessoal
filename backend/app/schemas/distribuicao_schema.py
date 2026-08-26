from decimal import Decimal

from sqlmodel import SQLModel


class DistribuicaoItem(SQLModel):
    id: str
    nome: str
    percentual: Decimal
    # Se preenchido, esse item pode ser "expandido" na tela mostrando o
    # rateio de novo, dessa vez usando o plano referenciado.
    subplano_id: str | None = None
    # Se preenchido, essa classe tem correspondencia com tipo(s) de ativo real
    # de investimento (valores de TipoAtivo, ex.: "ACAO_BR") -- usado so pelo
    # frontend pra buscar o valor atual da carteira e sugerir rebalanceamento.
    # String solta (nao o enum) de proposito: este modulo continua sem
    # importar nada de investimentos, so guarda o rotulo.
    tipos_ativo: list[str] | None = None


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
