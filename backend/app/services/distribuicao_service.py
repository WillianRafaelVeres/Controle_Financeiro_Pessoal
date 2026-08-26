"""Calculadora de distribuicao percentual -- planos guardados/editados aqui.

Isolado de proposito: este modulo so le e escreve `Configuracao` (chave/valor).
Ele nunca importa lancamento_service, investimento_service, caixinha_service
nem os modelos de Conta/Ativo/Lancamento -- a ferramenta so calcula e exibe
valores, nunca cria movimentacao financeira nenhuma.
"""
import json
import uuid
from decimal import Decimal

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.configuracao import Configuracao
from app.schemas.distribuicao_schema import (
    DistribuicaoItem,
    DistribuicaoPlano,
    DistribuicaoPlanoCreate,
    DistribuicaoPlanoUpdate,
)

CHAVE_INDICE = "distribuicao_planos_index"
PREFIXO_PLANO = "distribuicao_plano_"

# Cada plano fica na sua propria chave de configuracao (em vez de um unico
# JSON gigante) porque `configuracoes.valor` tem limite de 2000 caracteres --
# um indice pequeno + planos individuais nunca esbarra nesse teto conforme o
# usuario cria mais planos.

# Nome do item (normalizado) -> tipos de ativo reais que alimentam o
# rebalanceamento inteligente (peso-alvo da carteira, nao so rateio fixo do
# aporte). CAIXINHA_CDB entra em "renda fixa" porque, quando marcada como
# finalidade=INVESTIMENTO (dinheiro guardado fica de fora por definicao), e'
# efetivamente renda fixa. ETF_BR entra em "acoes br" por ser exposicao a
# bolsa brasileira, sem classe propria nas 5 do plano padrao.
MAPEAMENTO_PADRAO_TIPOS_ATIVO: dict[str, list[str]] = {
    "renda fixa": ["RENDA_FIXA", "CAIXINHA_CDB"],
    "fiis": ["FII"],
    "acoes br": ["ACAO_BR", "ETF_BR"],
    "exterior": ["EXTERIOR", "ACAO_EXTERIOR", "ETF_EXTERIOR"],
    "bitcoin": ["CRIPTO"],
}

PLANOS_PADRAO = [
    {
        "nome": "Investimentos",
        "itens": [
            {"nome": "Renda fixa", "percentual": "25", "tipos_ativo": MAPEAMENTO_PADRAO_TIPOS_ATIVO["renda fixa"]},
            {"nome": "FIIs", "percentual": "15", "tipos_ativo": MAPEAMENTO_PADRAO_TIPOS_ATIVO["fiis"]},
            {"nome": "Acoes BR", "percentual": "20", "tipos_ativo": MAPEAMENTO_PADRAO_TIPOS_ATIVO["acoes br"]},
            {"nome": "Exterior", "percentual": "25", "tipos_ativo": MAPEAMENTO_PADRAO_TIPOS_ATIVO["exterior"]},
            {"nome": "Bitcoin", "percentual": "15", "tipos_ativo": MAPEAMENTO_PADRAO_TIPOS_ATIVO["bitcoin"]},
        ],
    },
    {
        "nome": "Renda Extra",
        "itens": [
            {"nome": "Viagens", "percentual": "50"},
            {"nome": "Fundo carro/casa", "percentual": "15"},
            {"nome": "Investimentos", "percentual": "15", "ligar_ao_plano": "Investimentos"},
            {"nome": "Reserva de emergencia", "percentual": "10"},
            {"nome": "Previdencia PGBL", "percentual": "10"},
        ],
    },
]


def _novo_id() -> str:
    return str(uuid.uuid4())


def _get_config(session: Session, chave: str) -> Configuracao | None:
    return session.exec(select(Configuracao).where(Configuracao.chave == chave)).first()


def _set_config(session: Session, chave: str, valor: str) -> None:
    config = _get_config(session, chave)
    if config:
        config.valor = valor
        session.add(config)
    else:
        session.add(Configuracao(chave=chave, valor=valor))


def _ler_indice(session: Session) -> list[str]:
    config = _get_config(session, CHAVE_INDICE)
    if not config or not config.valor:
        return []
    try:
        ids = json.loads(config.valor)
    except (ValueError, TypeError):
        return []
    return ids if isinstance(ids, list) else []


def _salvar_indice(session: Session, ids: list[str]) -> None:
    _set_config(session, CHAVE_INDICE, json.dumps(ids))


def _ler_plano(session: Session, plano_id: str) -> DistribuicaoPlano | None:
    config = _get_config(session, f"{PREFIXO_PLANO}{plano_id}")
    if not config or not config.valor:
        return None
    try:
        dados = json.loads(config.valor)
    except (ValueError, TypeError):
        return None
    try:
        return DistribuicaoPlano(
            id=dados["id"],
            nome=dados["nome"],
            itens=[DistribuicaoItem(**item) for item in dados.get("itens", [])],
        )
    except (KeyError, TypeError):
        return None


def _salvar_plano(session: Session, plano: DistribuicaoPlano) -> None:
    dados = {
        "id": plano.id,
        "nome": plano.nome,
        "itens": [
            {
                "id": item.id,
                "nome": item.nome,
                "percentual": str(item.percentual),
                "subplano_id": item.subplano_id,
                "tipos_ativo": item.tipos_ativo,
            }
            for item in plano.itens
        ],
    }
    _set_config(session, f"{PREFIXO_PLANO}{plano.id}", json.dumps(dados))


def _formatar_percentual(valor: Decimal) -> str:
    inteiro = valor.to_integral_value()
    if valor == inteiro:
        return str(inteiro)
    return str(valor.quantize(Decimal("0.01")))


def _validar_soma_100(itens: list[DistribuicaoItem]) -> None:
    soma = sum((Decimal(str(item.percentual)) for item in itens), Decimal("0"))
    diferenca = Decimal("100") - soma
    if abs(diferenca) < Decimal("0.01"):
        return
    if diferenca > 0:
        detail = f"Total atual: {_formatar_percentual(soma)}% -- faltam {_formatar_percentual(diferenca)}%."
    else:
        detail = f"Total atual: {_formatar_percentual(soma)}% -- excedem {_formatar_percentual(abs(diferenca))}%."
    raise HTTPException(status_code=422, detail=detail)


def _seed_planos_padrao(session: Session) -> list[DistribuicaoPlano]:
    planos: list[DistribuicaoPlano] = []
    id_por_nome: dict[str, str] = {}

    for definicao in PLANOS_PADRAO:
        plano_id = _novo_id()
        id_por_nome[definicao["nome"]] = plano_id
        itens = [
            DistribuicaoItem(
                id=_novo_id(),
                nome=item["nome"],
                percentual=Decimal(item["percentual"]),
                tipos_ativo=item.get("tipos_ativo"),
            )
            for item in definicao["itens"]
        ]
        planos.append(DistribuicaoPlano(id=plano_id, nome=definicao["nome"], itens=itens))

    # Liga o item "Investimentos" (dentro de Renda Extra) ao plano
    # Investimentos, pra dar pra expandir e ver o rateio de novo.
    for definicao, plano in zip(PLANOS_PADRAO, planos):
        for item_definicao, item in zip(definicao["itens"], plano.itens):
            nome_plano_alvo = item_definicao.get("ligar_ao_plano")
            if nome_plano_alvo:
                item.subplano_id = id_por_nome.get(nome_plano_alvo)

    for plano in planos:
        _salvar_plano(session, plano)
    _salvar_indice(session, [plano.id for plano in planos])
    session.commit()
    return planos


def _normalizar_nome_item(nome: str) -> str:
    return " ".join(nome.strip().lower().split())


def _aplicar_mapeamento_padrao(plano: DistribuicaoPlano) -> bool:
    """Preenche tipos_ativo pelo nome do item quando o plano foi salvo antes
    dessa funcionalidade existir -- sem isso, quem ja tinha o plano
    "Investimentos" criado nunca ganharia o rebalanceamento inteligente, pois
    o seed so roda uma vez (na primeira vez que a lista de planos e' vazia).
    Roda a cada leitura e so grava de volta se realmente mudou algo, entao
    nunca sobrescreve um tipos_ativo que o usuario (ou uma leitura anterior)
    ja tenha definido."""
    mudou = False
    for item in plano.itens:
        if not item.tipos_ativo:
            mapeado = MAPEAMENTO_PADRAO_TIPOS_ATIVO.get(_normalizar_nome_item(item.nome))
            if mapeado:
                item.tipos_ativo = mapeado
                mudou = True
    return mudou


def listar_planos(session: Session) -> list[DistribuicaoPlano]:
    ids = _ler_indice(session)
    if not ids:
        return _seed_planos_padrao(session)
    planos = []
    precisa_commit = False
    for plano_id in ids:
        plano = _ler_plano(session, plano_id)
        if plano:
            if _aplicar_mapeamento_padrao(plano):
                _salvar_plano(session, plano)
                precisa_commit = True
            planos.append(plano)
    if precisa_commit:
        session.commit()
    return planos


def criar_plano(session: Session, payload: DistribuicaoPlanoCreate) -> DistribuicaoPlano:
    if not payload.nome.strip():
        raise HTTPException(status_code=422, detail="Informe um nome para o plano.")
    if not payload.itens:
        raise HTTPException(status_code=422, detail="Adicione ao menos um destino ao plano.")
    _validar_soma_100(payload.itens)

    plano = DistribuicaoPlano(id=_novo_id(), nome=payload.nome.strip(), itens=payload.itens)
    _salvar_plano(session, plano)
    ids = _ler_indice(session)
    ids.append(plano.id)
    _salvar_indice(session, ids)
    session.commit()
    return plano


def atualizar_plano(session: Session, plano_id: str, payload: DistribuicaoPlanoUpdate) -> DistribuicaoPlano:
    plano = _ler_plano(session, plano_id)
    if not plano:
        raise HTTPException(status_code=404, detail="Plano de distribuicao nao encontrado.")

    if payload.nome is not None:
        if not payload.nome.strip():
            raise HTTPException(status_code=422, detail="Informe um nome para o plano.")
        plano.nome = payload.nome.strip()

    if payload.itens is not None:
        if not payload.itens:
            raise HTTPException(status_code=422, detail="Adicione ao menos um destino ao plano.")
        _validar_soma_100(payload.itens)
        plano.itens = payload.itens

    _salvar_plano(session, plano)
    session.commit()
    return plano


def excluir_plano(session: Session, plano_id: str) -> None:
    ids = _ler_indice(session)
    if plano_id not in ids:
        raise HTTPException(status_code=404, detail="Plano de distribuicao nao encontrado.")
    ids.remove(plano_id)
    _salvar_indice(session, ids)
    config = _get_config(session, f"{PREFIXO_PLANO}{plano_id}")
    if config:
        session.delete(config)
    session.commit()
