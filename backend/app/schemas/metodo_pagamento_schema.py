from sqlmodel import SQLModel

from app.models.base import TipoMetodo


class MetodoPagamentoCreate(SQLModel):
    nome: str
    tipo_metodo: TipoMetodo = TipoMetodo.OUTRO


class MetodoPagamentoUpdate(SQLModel):
    nome: str | None = None
    tipo_metodo: TipoMetodo | None = None
    ativo: bool | None = None
