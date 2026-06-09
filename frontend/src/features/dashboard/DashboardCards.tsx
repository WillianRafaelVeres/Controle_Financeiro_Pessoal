import { Banknote, PiggyBank, TrendingDown, WalletCards } from "lucide-react";
import type { ReactNode } from "react";

import type { DashboardResumo } from "../../lib/types";
import { formatMoney } from "../../lib/formatters";
import { cn } from "../../lib/utils";

type Tone = "green" | "blue" | "red" | "yellow";

const toneStyles: Record<
  Tone,
  {
    accent: string;
    icon: string;
    text: string;
    bar: string;
    card: string;
  }
> = {
  green: {
    accent: "from-emerald-300 via-brand-500 to-emerald-800",
    icon: "bg-brand-500/[0.18] text-emerald-200 shadow-[0_0_30px_rgba(34,197,94,0.25)]",
    text: "text-emerald-200",
    bar: "bg-gradient-to-r from-emerald-400 to-brand-500",
    card: "hover:border-emerald-300/30",
  },
  blue: {
    accent: "from-blue-300 via-blue-500 to-sky-900",
    icon: "bg-blue-500/[0.18] text-blue-200 shadow-[0_0_30px_rgba(59,130,246,0.22)]",
    text: "text-blue-200",
    bar: "bg-gradient-to-r from-blue-400 to-sky-500",
    card: "hover:border-blue-300/30",
  },
  red: {
    accent: "from-red-300 via-red-500 to-rose-900",
    icon: "bg-red-500/[0.18] text-red-200 shadow-[0_0_30px_rgba(239,68,68,0.20)]",
    text: "text-red-200",
    bar: "bg-gradient-to-r from-red-400 to-rose-500",
    card: "hover:border-red-300/30",
  },
  yellow: {
    accent: "from-amber-300 via-amber-500 to-orange-900",
    icon: "bg-amber-500/[0.18] text-amber-200 shadow-[0_0_30px_rgba(245,158,11,0.20)]",
    text: "text-amber-200",
    bar: "bg-gradient-to-r from-amber-300 to-orange-500",
    card: "hover:border-amber-300/30",
  },
};

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
  const maxMetric = Math.max(receitas, despesas, investimentos, 1);

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[minmax(280px,1.35fr)_repeat(3,minmax(180px,0.75fr))]">
        <div className="glass-highlight relative min-h-[176px] overflow-hidden rounded-3xl border border-emerald-300/25 bg-gradient-to-br from-slate-800/[0.72] via-slate-900/[0.68] to-emerald-950/[0.28] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28),0_0_46px_rgba(34,197,94,0.13)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-2xl">
          <div className="absolute right-5 top-5 flex h-14 w-14 items-center justify-center rounded-3xl border border-emerald-200/[0.18] bg-emerald-400/[0.16] text-emerald-100 shadow-[0_0_34px_rgba(34,197,94,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]">
            <WalletCards className="h-6 w-6" />
          </div>
          <div className="relative z-10 pr-16">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-emerald-200/90">Saldo livre para gastar</p>
            <p className="mt-3 max-w-[14ch] break-words text-4xl font-semibold leading-tight text-slate-50 sm:text-5xl">
              {formatMoney(data.saldo_livre)}
            </p>
            <p className="mt-3 max-w-sm text-sm leading-5 text-slate-300">Valor realmente disponível para o dia a dia.</p>
          </div>
          <Sparkline />
        </div>

        <SummaryMetric
          title="Receitas do mês"
          value={receitas}
          icon={<Banknote className="h-4 w-4" />}
          tone="green"
          progress={(receitas / maxMetric) * 100}
        />
        <SummaryMetric
          title="Despesas do mês"
          value={despesas}
          icon={<TrendingDown className="h-4 w-4" />}
          tone="red"
          progress={(despesas / maxMetric) * 100}
        />
        <SummaryMetric
          title="Investimentos no mês"
          value={investimentos}
          icon={<PiggyBank className="h-4 w-4" />}
          tone="blue"
          progress={(investimentos / maxMetric) * 100}
        />
      </section>

      <section className="glass-highlight rounded-2xl border border-white/10 bg-slate-900/[0.54] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)] ring-1 ring-inset ring-white/[0.05] backdrop-blur-2xl">
        <div className="mb-4 flex flex-col gap-0.5">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-slate-100">Movimentação do mês</h2>
          <p className="text-[12px] leading-5 text-slate-400">Entradas, saídas, aportes e resultado do período atual.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric title="Receitas" value={receitas} tone="green" />
          <MiniMetric title="Despesas" value={despesas} tone="red" />
          <MiniMetric title="Investimentos" value={investimentos} tone="blue" />
          <MiniMetric title="Resultado do mês" value={resultado} tone={resultado >= 0 ? "green" : "red"} />
        </div>
      </section>
    </div>
  );
}

function SummaryMetric({
  title,
  value,
  icon,
  tone,
  progress,
}: {
  title: string;
  value: number;
  icon: ReactNode;
  tone: Tone;
  progress: number;
}) {
  const styles = toneStyles[tone];
  const width = `${Math.max(8, Math.min(100, Number.isFinite(progress) ? progress : 0))}%`;

  return (
    <div
      className={cn(
        "glass-highlight relative min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/[0.56] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] ring-1 ring-inset ring-white/[0.05] backdrop-blur-2xl transition duration-200",
        styles.card,
      )}
    >
      <div className={cn("absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b", styles.accent)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
          <p className="mt-4 break-words text-3xl font-semibold leading-tight text-slate-50">{formatMoney(value)}</p>
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10", styles.icon)}>
          {icon}
        </div>
      </div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/[0.08]">
        <div className={cn("h-full rounded-full", styles.bar)} style={{ width }} />
      </div>
    </div>
  );
}

function MiniMetric({ title, value, tone }: { title: string; value: number; tone: Tone }) {
  const styles = toneStyles[tone];

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/[0.28] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-white/[0.16] hover:bg-white/[0.05]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <p className={cn("mt-2 break-words text-xl font-semibold leading-7", styles.text)}>{formatMoney(value)}</p>
    </div>
  );
}

function Sparkline() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-x-0 bottom-0 h-24 w-full text-emerald-300/70"
      viewBox="0 0 520 120"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="dashboard-spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.34" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 88 C42 48 67 46 99 66 C128 84 154 58 185 78 C222 103 239 28 275 44 C309 60 313 76 344 49 C381 18 400 31 430 55 C461 81 479 46 520 38 L520 120 L0 120 Z"
        fill="url(#dashboard-spark-fill)"
      />
      <path
        d="M0 88 C42 48 67 46 99 66 C128 84 154 58 185 78 C222 103 239 28 275 44 C309 60 313 76 344 49 C381 18 400 31 430 55 C461 81 479 46 520 38"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <circle cx="381" cy="18" r="5" fill="#d1fae5" />
    </svg>
  );
}
