from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.base import Moeda, TipoProvento
from app.models.conta import Conta
from app.models.dividendo import Dividendo
from app.models.investimento import Ativo
from app.schemas.dividendo_schema import DividendoCreate, DividendoUpdate
from app.services.dividendo_service import (
    buscar_lancamento_juros_conta,
    calcular_conversao_provento,
    desativar_lancamento_juros_conta,
    desativar_movimentos_dolar_dividendo,
    registrar_movimento_dolar_dividendo,
    sincronizar_lancamento_juros_conta,
)
from app.services.investimento_service import ativos_para_dividendos

router = APIRouter(prefix="/dividendos", tags=["dividendos"])


@router.get("")
def listar(session: Session = Depends(get_session)) -> list[Dividendo]:
    return session.exec(select(Dividendo).order_by(Dividendo.data_recebimento.desc())).all()


@router.get("/ativos-disponiveis")
def ativos_disponiveis(session: Session = Depends(get_session)):
    return ativos_para_dividendos(session)


def _validar_conta_destino(session: Session, conta_id: str | None) -> None:
    if not conta_id:
        return
    conta = session.get(Conta, conta_id)
    if not conta or not conta.ativa:
        raise HTTPException(status_code=404, detail="Conta de destino nao encontrada.")


def _validar_ativo_provento(payload: DividendoCreate, session: Session) -> Ativo | None:
    _validar_conta_destino(session, payload.conta_destino_id)
    if payload.ativo_id:
        ativos = ativos_para_dividendos(session)
        ativo = next((item for item in ativos if item.id == payload.ativo_id), None)
        if not ativo:
            raise HTTPException(status_code=422, detail="Dividendos so podem ser registrados para ativos em carteira.")
        return ativo
    if payload.tipo_provento != TipoProvento.JUROS_RENDA_FIXA:
        raise HTTPException(status_code=422, detail="Provento sem ativo deve ser juros da conta.")
    if payload.moeda != Moeda.BRL:
        raise HTTPException(status_code=422, detail="Juros da conta devem ser registrados em BRL.")
    return None


@router.post("")
def criar(payload: DividendoCreate, session: Session = Depends(get_session)) -> Dividendo:
    ativo = _validar_ativo_provento(payload, session)
    data_recebimento = payload.data_recebimento or date.today()
    conversao = calcular_conversao_provento(
        session,
        payload.valor,
        payload.moeda,
        data_recebimento,
        cotacao_manual=payload.cotacao_brl,
    )
    dividendo = Dividendo(
        **{
            **payload.model_dump(exclude={"data_recebimento"}),
            "data_recebimento": data_recebimento,
            **conversao,
        }
    )
    session.add(dividendo)
    session.flush()
    registrar_movimento_dolar_dividendo(session, dividendo, ativo)
    sincronizar_lancamento_juros_conta(session, dividendo)
    session.commit()
    session.refresh(dividendo)
    return dividendo


@router.put("/{dividendo_id}")
def atualizar(dividendo_id: str, payload: DividendoUpdate, session: Session = Depends(get_session)) -> Dividendo:
    dividendo = session.get(Dividendo, dividendo_id)
    if not dividendo:
        raise HTTPException(status_code=404, detail="Dividendo nao encontrado.")
    lancamento_juros = buscar_lancamento_juros_conta(session, dividendo.id)
    # Guardado antes das alteracoes: se a cotacao da nova data nao puder ser
    # consultada, a edicao continua valendo com a cotacao que ja estava gravada.
    cotacao_anterior = dividendo.cotacao_brl
    alteracoes = payload.model_dump(exclude_unset=True)
    for key, value in alteracoes.items():
        setattr(dividendo, key, value)
    if dividendo.ativo_id is None and dividendo.tipo_provento != TipoProvento.JUROS_RENDA_FIXA:
        raise HTTPException(status_code=422, detail="Provento sem ativo deve ser juros da conta.")
    if dividendo.ativo_id is None and dividendo.moeda != Moeda.BRL:
        raise HTTPException(status_code=422, detail="Juros da conta devem ser registrados em BRL.")
    _validar_conta_destino(session, dividendo.conta_destino_id)
    conversao = calcular_conversao_provento(
        session,
        dividendo.valor,
        dividendo.moeda,
        dividendo.data_recebimento,
        cotacao_manual=alteracoes.get("cotacao_brl"),
        cotacao_anterior=cotacao_anterior,
    )
    for key, value in conversao.items():
        setattr(dividendo, key, value)
    session.add(dividendo)
    session.flush()
    desativar_movimentos_dolar_dividendo(session, dividendo.id)
    ativo = session.get(Ativo, dividendo.ativo_id) if dividendo.ativo_id else None
    registrar_movimento_dolar_dividendo(session, dividendo, ativo)
    sincronizar_lancamento_juros_conta(session, dividendo, lancamento_juros)
    session.commit()
    session.refresh(dividendo)
    return dividendo


@router.delete("/{dividendo_id}", status_code=204)
def excluir(dividendo_id: str, session: Session = Depends(get_session)) -> None:
    dividendo = session.get(Dividendo, dividendo_id)
    if not dividendo:
        raise HTTPException(status_code=404, detail="Dividendo nao encontrado.")
    desativar_movimentos_dolar_dividendo(session, dividendo.id)
    desativar_lancamento_juros_conta(session, dividendo.id)
    session.delete(dividendo)
    session.commit()
