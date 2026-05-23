from decimal import Decimal

from sqlmodel import SQLModel


class DashboardResumo(SQLModel):
    saldo_livre: Decimal
    saldo_em_contas: Decimal
    reservado_cartao: Decimal
    reservado_contas_futuras: Decimal = Decimal("0.00")
    reservado_caixinhas: Decimal = Decimal("0.00")
    compromissos_futuros_cartao: Decimal
    gasto_mes: Decimal
    orcamento_restante: Decimal
    investimentos: Decimal
    diferenca_conciliacao: Decimal
