import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

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
from app.core.security import verify_supabase_token

settings = get_settings()
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BACKEND_DIR = Path(__file__).resolve().parents[2]

_AUTH_SKIP = {"/health", "/openapi.json", "/docs", "/redoc"}


def find_frontend_dist() -> Path:
    candidates = [
        BACKEND_DIR / "frontend" / "dist",
        BACKEND_DIR.parent / "frontend" / "dist",
    ]
    for candidate in candidates:
        if (candidate / "index.html").exists():
            return candidate
    return candidates[0]


FRONTEND_DIST = find_frontend_dist()


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if not settings.auth_enabled:
        return await call_next(request)
    path = request.url.path
    if not path.startswith(settings.api_prefix) or path in _AUTH_SKIP:
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return JSONResponse({"detail": "Token nao fornecido."}, status_code=401)
    try:
        user_id = await verify_supabase_token(
            auth[7:], settings.supabase_url or "", settings.supabase_anon_key or ""
        )
        request.state.user_id = user_id
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=401)
    return await call_next(request)


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": settings.app_version,
        "auth_enabled": settings.auth_enabled,
        "database": "postgresql" if settings.using_postgres else "sqlite",
        "database_url": settings.database_url_safe,
        "frontend_index": (FRONTEND_DIST / "index.html").exists(),
    }


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


if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


@app.get("/", response_model=None)
def serve_frontend_index():
    index_file = FRONTEND_DIST / "index.html"
    if not index_file.exists():
        return JSONResponse({"detail": "Frontend build not found."}, status_code=404)
    return FileResponse(index_file)


@app.get("/{path:path}", include_in_schema=False, response_model=None)
def serve_frontend_app(path: str):
    if path.startswith(("api/", "docs", "redoc", "openapi.json", "health")):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    requested_file = FRONTEND_DIST / path
    if requested_file.is_file():
        return FileResponse(requested_file)
    index_file = FRONTEND_DIST / "index.html"
    if not index_file.exists():
        return JSONResponse({"detail": "Frontend build not found."}, status_code=404)
    return FileResponse(index_file)
