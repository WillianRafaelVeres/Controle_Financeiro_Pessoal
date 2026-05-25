import { Archive, Banknote, CalendarClock, CreditCard, DollarSign, Landmark, PiggyBank, TrendingDown, WalletCards } from "lucide-react";
import type { ReactNode } from "react";

import type { DashboardResumo } from "../../lib/types";
import { formatMoney } from "../../lib/formatters";

type Tone = "green" | "blue" | "red" | "yellow" | "neutral";

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

  const diferenca = Number(data.diferenca_conciliacao ?? 0);

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.45fr)]">
      <section className="relative overflow-hidden rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/18 via-[#111821] to-[#0d141d] p-4 shadow-[0_20px_48px_rgba(0,0,0,0.22)]">
        <div className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-400">
          <WalletCards className="h-5 w-5" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-300">Saldo livre para gastar</p>
        <p className="mt-3 max-w-[14ch] break-words text-3xl font-semibold leading-tight text-slate-50 sm:text-4xl">
          {formatMoney(data.saldo_livre)}
        </p>
        <p className="mt-3 max-w-sm text-sm leading-5 text-slate-400">
          Valor disponivel depois de reservar cartao, contas futuras e dinheiro separado.
        </p>
      </section>

      <div className="grid gap-3">
        <InfoGroup title="Movimento do mes" description="Entradas, saidas e aportes registrados no periodo.">
          <MiniMetric title="Receitas" value={data.receitas_mes ?? 0} icon={<Banknote className="h-4 w-4" />} tone="green" />
          <MiniMetric title="Despesas" value={data.despesas_mes ?? data.gasto_mes} icon={<TrendingDown className="h-4 w-4" />} tone="red" />
          <MiniMetric title="Investimentos" value={data.investimentos_mes ?? 0} icon={<PiggyBank className="h-4 w-4" />} tone="blue" />
        </InfoGroup>

        <InfoGroup title="Reservas e compromissos" description="Dinheiro que nao deve ser tratado como livre.">
          <MiniMetric title="Cartao" value={data.reservado_cartao} icon={<CreditCard className="h-4 w-4" />} tone="yellow" />
          <MiniMetric title="Contas futuras" value={data.reservado_contas_futuras ?? 0} icon={<CalendarClock className="h-4 w-4" />} tone="yellow" />
          <MiniMetric title="Caixinhas" value={data.reservado_caixinhas ?? 0} icon={<Archive className="h-4 w-4" />} tone="yellow" />
          <MiniMetric title="Futuro cartao" value={data.compromissos_futuros_cartao} icon={<TrendingDown className="h-4 w-4" />} tone="red" />
        </InfoGroup>

        <InfoGroup title="Conferencia" description="Valores manuais usados para saber se o app bate com as contas.">
          <MiniMetric title="Saldo em contas" value={data.saldo_em_contas_informado ?? data.saldo_em_contas} icon={<Landmark className="h-4 w-4" />} tone="blue" />
          <MiniMetric title="Saldo dolar" value={data.saldo_teorico_usd ?? 0} icon={<DollarSign className="h-4 w-4" />} tone="blue" currency="USD" />
          <MiniMetric title="Diferenca" value={data.diferenca_conciliacao} icon={<Landmark className="h-4 w-4" />} tone={Math.abs(diferenca) < 0.01 ? "green" : "yellow"} />
        </InfoGroup>
      </div>
    </div>
  );
}

function InfoGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800/80 bg-[#111821]/90 p-3">
      <div className="mb-2 flex flex-col gap-0.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{title}</h2>
        <p className="text-[11px] leading-4 text-slate-500">{description}</p>
      </div>
      <div className="metric-grid gap-2">{children}</div>
    </section>
  );
}

function MiniMetric({
  title,
  value,
  icon,
  tone,
  currency = "BRL",
}: {
  title: string;
  value: string | number | null | undefined;
  icon: ReactNode;
  tone: Tone;
  currency?: string;
}) {
  const toneClass = {
    green: "bg-brand-500/15 text-brand-400",
    blue: "bg-blue-500/15 text-blue-300",
    red: "bg-red-500/15 text-red-300",
    yellow: "bg-amber-500/15 text-amber-300",
    neutral: "bg-slate-800 text-slate-300",
  }[tone];

  return (
    <div className="min-w-0 rounded-xl border border-slate-800/70 bg-slate-950/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1 break-words text-lg font-semibold leading-6 text-slate-100">{formatMoney(value, currency)}</p>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>{icon}</div>
      </div>
    </div>
  );
}
