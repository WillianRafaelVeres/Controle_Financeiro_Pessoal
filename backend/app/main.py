from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    caixinhas,
    cartoes,
    categorias,
    compromissos_cartao,
    configuracoes,
    contas,
    contas_futuras,
    dashboard,
    dividendos,
    exterior_dolar,
    investimentos,
    lancamentos,
    metodos_pagamento,
    orcamentos,
    painel,
    planejamento,
    relatorios,
    subcategorias,
)
from app.core.config import get_settings
from app.core.database import create_db_and_tables

settings = get_settings()

app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


for router in [
    categorias.router,
    subcategorias.router,
    metodos_pagamento.router,
    contas.router,
    contas_futuras.router,
    caixinhas.router,
    cartoes.router,
    lancamentos.router,
    compromissos_cartao.router,
    orcamentos.router,
    investimentos.router,
    dividendos.router,
    exterior_dolar.router,
    painel.router,
    planejamento.router,
    dashboard.router,
    relatorios.router,
    configuracoes.router,
]:
    app.include_router(router, prefix=settings.api_prefix)
