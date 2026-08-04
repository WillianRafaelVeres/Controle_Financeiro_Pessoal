"""Business services."""

from datetime import date
from decimal import Decimal

from app.models.base import Moeda
from app.services import exterior_dolar_service as _exterior_dolar_service
from app.services.cotacao_historica_service import buscar_cotacao_dolar_data as _buscar_cotacao_historica


# Instala a busca histórica robusta antes que os demais serviços importem a função.
_exterior_dolar_service.buscar_cotacao_dolar_data = _buscar_cotacao_historica


def _instalar_conversao_estrita_dividendos() -> None:
    from app.services import dividendo_service as _dividendo_service

    def calcular_conversao_provento_estrito(
        session,
        valor: Decimal,
        moeda,
        data_recebimento: date,
    ) -> dict:
        moeda_valor = moeda.value if hasattr(moeda, "value") else str(moeda or Moeda.BRL.value)
        if moeda_valor != Moeda.USD.value:
            return {
                "valor_brl": valor,
                "cotacao_brl": Decimal("1.00"),
                "data_cotacao": data_recebimento,
                "fonte_cotacao": "BRL",
            }

        cotacao = _buscar_cotacao_historica(session, data_recebimento)
        cotacao_brl = Decimal(str(cotacao.get("cotacao_brl") or "0"))
        if cotacao_brl <= 0:
            raise ValueError("Cotacao historica do dolar invalida.")
        data_cotacao = cotacao.get("data_cotacao")
        return {
            "valor_brl": valor * cotacao_brl,
            "cotacao_brl": cotacao_brl,
            "data_cotacao": data_cotacao if isinstance(data_cotacao, date) else data_recebimento,
            "fonte_cotacao": cotacao.get("fonte") or "BCB PTAX",
        }

    _dividendo_service.buscar_cotacao_dolar_data = _buscar_cotacao_historica
    _dividendo_service.calcular_conversao_provento = calcular_conversao_provento_estrito


_instalar_conversao_estrita_dividendos()
