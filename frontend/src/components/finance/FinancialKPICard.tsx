import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatMoney, formatPercent } from "../../lib/formatters";
import { cn } from "../../lib/utils";

interface FinancialKPICardProps {
  title: string;
  value: string | number | null | undefined;
  trend?: number; // Percentual de mudança vs período anterior (-10 = 10% queda, +10 = 10% aumento)
  icon?: ReactNode;
  tone?: "default" | "green" | "blue" | "red" | "yellow";
  className?: string;
  currency?: string;
  isPercentage?: boolean;
  alertThreshold?: { min?: number; max?: number }; // Define thresholds para cores automáticas
  description?: string;
}

export function FinancialKPICard({
  title,
  value,
  trend,
  icon,
  tone = "default",
  className,
  currency = "BRL",
  isPercentage = false,
  alertThreshold,
  description,
}: FinancialKPICardProps) {
  // Determinar cor com base em threshold se não especificado
  let effectiveTone = tone;
  const numValue = typeof value === "number" ? value : value ? parseFloat(String(value)) : 0;

  if (alertThreshold) {
    if (alertThreshold.max !== undefined && numValue > alertThreshold.max) {
      effectiveTone = "red";
    } else if (alertThreshold.min !== undefined && numValue < alertThreshold.min) {
      effectiveTone = "red";
    } else if (numValue > (alertThreshold.max || 100)) {
      effectiveTone = "yellow";
    }
  }

  // Renderizar trend indicator
  const trendIcon =
    trend !== undefined ? (
      trend > 0 ? (
        <div className="flex items-center gap-0.5">
          <TrendingUp className="h-3.5 w-3.5 text-green-400" />
          <span className="text-xs font-semibold text-green-400">+{trend.toFixed(1)}%</span>
        </div>
      ) : trend < 0 ? (
        <div className="flex items-center gap-0.5">
          <TrendingDown className="h-3.5 w-3.5 text-red-400" />
          <span className="text-xs font-semibold text-red-400">{trend.toFixed(1)}%</span>
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <Minus className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-400">—</span>
        </div>
      )
    ) : null;

  return (
    <section className={cn("glass-highlight rounded-2xl border border-white/10 bg-slate-900/[0.58] p-4 shadow-[0_18px_52px_rgba(0,0,0,0.18)] ring-1 ring-inset ring-white/[0.04] backdrop-blur-xl transition duration-200 hover:border-white/[0.16]", className)}>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
            <p
              className={cn(
                "mt-2 break-words text-xl font-bold tracking-normal",
                effectiveTone === "default" && "text-slate-100",
                effectiveTone === "green" && "text-green-400",
                effectiveTone === "blue" && "text-blue-400",
                effectiveTone === "red" && "text-red-400",
                effectiveTone === "yellow" && "text-amber-400"
              )}
            >
              {isPercentage ? formatPercent(value) : formatMoney(value, currency)}
            </p>
          </div>
          {icon && (
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
                effectiveTone === "default" && "bg-slate-800/80 text-slate-300",
                effectiveTone === "green" && "bg-green-500/[0.18] text-green-300 shadow-[0_0_26px_rgba(34,197,94,0.20)]",
                effectiveTone === "blue" && "bg-blue-500/[0.18] text-blue-300 shadow-[0_0_26px_rgba(59,130,246,0.20)]",
                effectiveTone === "red" && "bg-red-500/[0.18] text-red-300 shadow-[0_0_26px_rgba(239,68,68,0.18)]",
                effectiveTone === "yellow" && "bg-amber-500/[0.18] text-amber-300 shadow-[0_0_26px_rgba(245,158,11,0.18)]"
              )}
            >
              {icon}
            </div>
          )}
        </div>

        {trendIcon && <div className="flex items-center justify-start">{trendIcon}</div>}

        {description && <p className="text-[12px] leading-5 text-slate-400">{description}</p>}
      </div>
    </section>
  );
}
