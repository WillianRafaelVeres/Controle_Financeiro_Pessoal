from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.base import Moeda, TipoMovimentoDolar, TipoProvento
from app.models.dividendo import Dividendo
from app.models.extrato_dolar import ExtratoDolar
from app.models.investimento import Ativo
from app.schemas.dividendo_schema import DividendoCreate, DividendoUpdate
from app.services.exterior_dolar_service import registrar_movimento_dolar
from app.services.dividendo_service import calcular_conversao_provento
from app.services.investimento_service import ativos_para_dividendos

router = APIRouter(prefix="/dividendos", tags=["dividendos"])


@router.get("")
def listar(session: Session = Depends(get_session)) -> list[Dividendo]:
    return session.exec(select(Dividendo).order_by(Dividendo.data_recebimento.desc())).all()


@router.get("/ativos-disponiveis")
def ativos_disponiveis(session: Session = Depends(get_session)):
    return ativos_para_dividendos(session)


def _desativar_movimentos_dolar_dividendo(session: Session, dividendo_id: str) -> None:
    movimentos = session.exec(select(ExtratoDolar).where(ExtratoDolar.referencia_id == dividendo_id, ExtratoDolar.origem == "DIVIDENDO")).all()
    for movimento in movimentos:
        movimento.ativo = False
        session.add(movimento)


def _registrar_movimento_dolar_dividendo(session: Session, dividendo: Dividendo, ativo: Ativo | None) -> None:
    moeda = dividendo.moeda.value if hasattr(dividendo.moeda, "value") else str(dividendo.moeda)
    if dividendo.tipo_provento != TipoProvento.DIVIDENDO_EXTERIOR or moeda != Moeda.USD.value or not ativo:
        return
    registrar_movimento_dolar(
        session,
        TipoMovimentoDolar.DIVIDENDO_EXTERIOR,
        dividendo.valor,
        valor_brl=dividendo.valor_brl,
        descricao=f"Dividendo exterior {ativo.ticker}",
        origem="DIVIDENDO",
        referencia_id=dividendo.id,
        data_movimento=dividendo.data_recebimento,
    )


@router.post("")
def criar(payload: DividendoCreate, session: Session = Depends(get_session)) -> Dividendo:
    if not any(ativo.id == payload.ativo_id for ativo in ativos_para_dividendos(session)):
        raise HTTPException(status_code=422, detail="Dividendos so podem ser registrados para ativos em carteira.")
    data_recebimento = payload.data_recebimento or date.today()
    conversao = calcular_conversao_provento(session, payload.valor, payload.moeda, data_recebimento)
    dividendo = Dividendo(
        **{
            **payload.model_dump(exclude={"data_recebimento"}),
            "data_recebimento": data_recebimento,
            **conversao,
        }
    )
    session.add(dividendo)
    session.flush()
    ativo = session.get(Ativo, payload.ativo_id)
    _registrar_movimento_dolar_dividendo(session, dividendo, ativo)
    session.commit()
    session.refresh(dividendo)
    return dividendo


@router.put("/{dividendo_id}")
def atualizar(dividendo_id: str, payload: DividendoUpdate, session: Session = Depends(get_session)) -> Dividendo:
    dividendo = session.get(Dividendo, dividendo_id)
    if not dividendo:
        raise HTTPException(status_code=404, detail="Dividendo nao encontrado.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(dividendo, key, value)
    conversao = calcular_conversao_provento(session, dividendo.valor, dividendo.moeda, dividendo.data_recebimento)
    for key, value in conversao.items():
        setattr(dividendo, key, value)
    session.add(dividendo)
    session.flush()
    _desativar_movimentos_dolar_dividendo(session, dividendo.id)
    _registrar_movimento_dolar_dividendo(session, dividendo, session.get(Ativo, dividendo.ativo_id))
    session.commit()
    session.refresh(dividendo)
    return dividendo


@router.delete("/{dividendo_id}", status_code=204)
def excluir(dividendo_id: str, session: Session = Depends(get_session)) -> None:
    dividendo = session.get(Dividendo, dividendo_id)
    if not dividendo:
        raise HTTPException(status_code=404, detail="Dividendo nao encontrado.")
    _desativar_movimentos_dolar_dividendo(session, dividendo.id)
    session.delete(dividendo)
    session.commit()
