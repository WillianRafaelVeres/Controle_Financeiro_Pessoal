from sqlmodel import Session

from app.services.saldo_service import conciliacao


def obter_conciliacao(session: Session) -> dict:
    return conciliacao(session)

