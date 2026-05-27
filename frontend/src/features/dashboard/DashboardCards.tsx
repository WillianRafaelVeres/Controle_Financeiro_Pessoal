import { Banknote, PiggyBank, TrendingDown, WalletCards } from "lucide-react";
import type { ReactNode } from "react";

import type { DashboardResumo } from "../../lib/types";
import { formatMoney } from "../../lib/formatters";

type Tone = "green" | "blue" | "red" | "yellow";

export function DashboardCards({ resumo }: { resumo?: DashboardResumo }) {
  const data = resumo ?? {
    saldo_livre: 0,
    receitas_mes: 0,
    despesas_mes: 0,
    investimentos_mes: 0,
    gasto_mes: 0,
  };
  const receitas = Number(data.receitas_mes ?? 0);
  const despesas = Number(data.despesas_mes ?? data.gasto_mes ?? 0);
  const investimentos = Number(data.investimentos_mes ?? 0);
  const resultado = receitas - despesas - investimentos;

  return (
    <div className="space-y-3">
      <section className="grid gap-3 lg:grid-cols-[minmax(260px,1.1fr)_repeat(3,minmax(170px,0.8fr))]">
        <div className="relative min-h-[150px] overflow-hidden rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/18 via-[#111821] to-[#0d141d] p-4 shadow-[0_20px_48px_rgba(0,0,0,0.22)]">
          <div className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-400">
            <WalletCards className="h-5 w-5" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-300">Saldo livre para gastar</p>
          <p className="mt-3 max-w-[14ch] break-words text-3xl font-semibold leading-tight text-slate-50 sm:text-4xl">
            {formatMoney(data.saldo_livre)}
          </p>
          <p className="mt-3 max-w-sm text-sm leading-5 text-slate-400">Valor realmente disponível para o dia a dia.</p>
        </div>
        <SummaryMetric title="Receitas do mês" value={receitas} icon={<Banknote className="h-4 w-4" />} tone="green" />
        <SummaryMetric title="Despesas do mês" value={despesas} icon={<TrendingDown className="h-4 w-4" />} tone="red" />
        <SummaryMetric title="Investimentos no mês" value={investimentos} icon={<PiggyBank className="h-4 w-4" />} tone="blue" />
      </section>

      <section className="rounded-xl border border-slate-800/80 bg-[#111821]/90 p-3">
        <div className="mb-3 flex flex-col gap-0.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Movimentação do mês</h2>
          <p className="text-[11px] leading-4 text-slate-500">Entradas, saídas, aportes e resultado do período atual.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric title="Receitas" value={receitas} tone="green" />
          <MiniMetric title="Despesas" value={despesas} tone="red" />
          <MiniMetric title="Investimentos" value={investimentos} tone="blue" />
          <MiniMetric title="Resultado do mês" value={resultado} tone={resultado >= 0 ? "green" : "red"} />
        </div>
      </section>
    </div>
  );
}

function SummaryMetric({ title, value, icon, tone }: { title: string; value: number; icon: ReactNode; tone: Tone }) {
  const toneClass = {
    green: "bg-brand-500/15 text-brand-400",
    blue: "bg-blue-500/15 text-blue-300",
    red: "bg-red-500/15 text-red-300",
    yellow: "bg-amber-500/15 text-amber-300",
  }[tone];

  return (
    <div className="min-w-0 rounded-2xl border border-slate-800/80 bg-[#111821]/90 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-3 break-words text-2xl font-semibold leading-tight text-slate-100">{formatMoney(value)}</p>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>{icon}</div>
      </div>
    </div>
  );
}

function MiniMetric({ title, value, tone }: { title: string; value: number; tone: Tone }) {
  const textClass = {
    green: "text-brand-400",
    blue: "text-blue-300",
    red: "text-red-300",
    yellow: "text-amber-300",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-950/30 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`mt-1 break-words text-lg font-semibold leading-6 ${textClass}`}>{formatMoney(value)}</p>
    </div>
  );
}
