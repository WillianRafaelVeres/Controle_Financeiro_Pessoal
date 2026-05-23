from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.models.lancamento import Lancamento
from app.schemas.caixinha_schema import CaixinhaCreate, CaixinhaSchema, CaixinhaUpdate, UsarCaixinha
from app.services.caixinha_service import atualizar_caixinha, criar_caixinha, excluir_caixinha, listar_caixinhas, usar_caixinha

router = APIRouter(prefix="/caixinhas", tags=["caixinhas"])


@router.get("", response_model=list[CaixinhaSchema])
def listar(session: Session = Depends(get_session)):
    return listar_caixinhas(session)


@router.post("", response_model=CaixinhaSchema, status_code=201)
def criar(payload: CaixinhaCreate, session: Session = Depends(get_session)):
    return criar_caixinha(session, payload)


@router.put("/{caixinha_id}", response_model=CaixinhaSchema)
def atualizar(caixinha_id: str, payload: CaixinhaUpdate, session: Session = Depends(get_session)):
    return atualizar_caixinha(session, caixinha_id, payload)


@router.post("/{caixinha_id}/usar", response_model=Lancamento)
def usar(caixinha_id: str, payload: UsarCaixinha, session: Session = Depends(get_session)):
    return usar_caixinha(session, caixinha_id, payload)


@router.delete("/{caixinha_id}", status_code=204)
def excluir(caixinha_id: str, session: Session = Depends(get_session)) -> None:
    excluir_caixinha(session, caixinha_id)
