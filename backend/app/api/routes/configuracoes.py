import shutil
import os
import logging
import threading
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.database import get_session
from app.models.configuracao import Configuracao

router = APIRouter(prefix="/configuracoes", tags=["configuracoes"])


@router.get("")
def listar(session: Session = Depends(get_session)) -> list[Configuracao]:
    return session.exec(select(Configuracao).order_by(Configuracao.chave)).all()


@router.get("/diagnostico")
def diagnostico() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "desktop": os.getenv("CENTRAL_FINANCEIRA_DESKTOP") == "1",
        "porta": os.getenv("CENTRAL_FINANCEIRA_PORT"),
        "banco": str(settings.database_file),
        "pasta_dados": str(settings.data_dir),
        "pasta_logs": str(settings.logs_dir),
        "pasta_backups": str(settings.backups_dir),
    }


@router.post("/encerrar")
def encerrar_backend_desktop() -> dict:
    if os.getenv("CENTRAL_FINANCEIRA_DESKTOP") != "1":
        raise HTTPException(status_code=403, detail="Encerramento disponivel apenas no modo desktop.")
    logging.info("Encerramento do backend solicitado pelo desktop")

    def shutdown() -> None:
        time.sleep(0.25)
        logging.info("Backend encerrado")
        os._exit(0)

    threading.Thread(target=shutdown, daemon=True).start()
    return {"status": "encerrando"}


@router.post("")
def salvar(payload: Configuracao, session: Session = Depends(get_session)) -> Configuracao:
    existente = session.exec(select(Configuracao).where(Configuracao.chave == payload.chave)).first()
    if existente:
        existente.valor = payload.valor
        session.add(existente)
        session.commit()
        session.refresh(existente)
        return existente
    session.add(payload)
    session.commit()
    session.refresh(payload)
    return payload


@router.post("/backup/exportar")
def exportar_backup() -> dict:
    settings = get_settings()
    if not settings.database_file.exists():
        raise HTTPException(status_code=404, detail="Banco de dados ainda nao existe.")
    backup_dir = settings.data_dir / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    target = backup_dir / "central_financeira_backup.db"
    shutil.copy2(settings.database_file, target)
    return {"arquivo": str(target)}


@router.post("/backup/importar")
def importar_backup(caminho: str) -> dict:
    settings = get_settings()
    source = Path(caminho)
    if not source.exists():
        raise HTTPException(status_code=404, detail="Arquivo de backup nao encontrado.")
    shutil.copy2(source, settings.database_file)
    return {"status": "Backup importado. Reinicie o backend para recarregar conexoes."}
