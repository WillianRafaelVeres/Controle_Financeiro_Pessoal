import { Archive, Banknote, CalendarClock, CreditCard, DollarSign, Landmark, PiggyBank, TrendingDown, WalletCards } from "lucide-react";

import { MoneyCard } from "../../components/finance/MoneyCard";
import type { DashboardResumo } from "../../lib/types";

export function DashboardCards({ resumo }: { resumo?: DashboardResumo }) {
  const data = resumo ?? {
    saldo_livre: 0,
    receitas_mes: 0,
    despesas_mes: 0,
    investimentos_mes: 0,
    saldo_em_contas_informado: 0,
    saldo_em_contas: 0,
    reservado_cartao: 0,
    reservado_contas_futuras: 0,
    reservado_caixinhas: 0,
    compromissos_futuros_cartao: 0,
    saldo_teorico_usd: 0,
    gasto_mes: 0,
    orcamento_restante: 0,
    investimentos: 0,
    diferenca_conciliacao: 0,
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2">
      <MoneyCard
        title="Saldo livre para gastar"
        value={data.saldo_livre}
        subtitle="Ja desconta reservas"
        icon={<WalletCards className="h-4 w-4" />}
        tone="green"
      />
      <MoneyCard
        title="Receitas do mes"
        value={data.receitas_mes ?? 0}
        subtitle="Entradas do periodo"
        icon={<Banknote className="h-4 w-4" />}
        tone="blue"
      />
      <MoneyCard
        title="Despesas do mes"
        value={data.despesas_mes ?? data.gasto_mes}
        subtitle="Gastos efetivos"
        icon={<TrendingDown className="h-4 w-4" />}
        tone="red"
      />
      <MoneyCard
        title="Saldo em contas"
        value={data.saldo_em_contas_informado ?? data.saldo_em_contas}
        subtitle="Informado manualmente"
        icon={<Landmark className="h-4 w-4" />}
        tone="blue"
      />
      <MoneyCard
        title="Reservado cartao"
        value={data.reservado_cartao}
        subtitle="Separado para fatura"
        icon={<CreditCard className="h-4 w-4" />}
        tone="yellow"
      />
      <MoneyCard
        title="Contas futuras"
        value={data.reservado_contas_futuras ?? 0}
        subtitle="Separado do saldo livre"
        icon={<CalendarClock className="h-4 w-4" />}
        tone="yellow"
      />
      <MoneyCard
        title="Dinheiro separado"
        value={data.reservado_caixinhas ?? 0}
        subtitle="Caixinhas acumuladas"
        icon={<Archive className="h-4 w-4" />}
        tone="yellow"
      />
      <MoneyCard
        title="Compromisso futuro"
        value={data.compromissos_futuros_cartao}
        subtitle="Ainda nao separado"
        icon={<TrendingDown className="h-4 w-4" />}
        tone="red"
      />
      <MoneyCard
        title="Investimentos"
        value={data.investimentos_mes ?? 0}
        subtitle="Aportes no mes"
        icon={<PiggyBank className="h-4 w-4" />}
        tone="blue"
      />
      <MoneyCard
        title="Saldo dolar"
        value={data.saldo_teorico_usd ?? 0}
        subtitle="Conta USD conciliavel"
        icon={<DollarSign className="h-4 w-4" />}
        tone="blue"
      />
      <MoneyCard
        title="Diferenca conciliacao"
        value={data.diferenca_conciliacao}
        subtitle="Valor nao explicado"
        icon={<Landmark className="h-4 w-4" />}
        tone="yellow"
      />
    </div>
  );
}
