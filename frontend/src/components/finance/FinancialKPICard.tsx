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
    <section className={cn("rounded-md border border-slate-800 bg-[#111821] p-3", className)}>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase text-slate-500">{title}</p>
            <p
              className={cn(
                "mt-1 font-bold tracking-normal",
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
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                effectiveTone === "default" && "bg-slate-800 text-slate-300",
                effectiveTone === "green" && "bg-green-500/15 text-green-400",
                effectiveTone === "blue" && "bg-blue-500/15 text-blue-400",
                effectiveTone === "red" && "bg-red-500/15 text-red-400",
                effectiveTone === "yellow" && "bg-amber-500/15 text-amber-400"
              )}
            >
              {icon}
            </div>
          )}
        </div>

        {trendIcon && <div className="flex items-center justify-start">{trendIcon}</div>}

        {description && <p className="text-[11px] text-slate-500">{description}</p>}
      </div>
    </section>
  );
}
