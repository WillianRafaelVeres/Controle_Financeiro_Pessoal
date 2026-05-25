import type { ReactNode } from "react";

import { formatMoney } from "../../lib/formatters";
import { cn } from "../../lib/utils";

interface MoneyCardProps {
  title: string;
  value: string | number | null | undefined;
  subtitle?: string;
  variation?: string;
  icon?: ReactNode;
  tone?: "default" | "green" | "blue" | "red" | "yellow";
  className?: string;
  size?: "sm" | "md";
  currency?: string;
}

export function MoneyCard({ title, value, subtitle, variation, icon, tone = "default", className, size = "md", currency = "BRL" }: MoneyCardProps) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-slate-800/80 bg-[#111821]/95 p-3 shadow-[0_12px_28px_rgba(0,0,0,0.12)]", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className={cn("mt-1 break-words font-semibold tracking-normal text-slate-100", size === "md" ? "text-xl leading-6" : "text-base")}>
            {formatMoney(value, currency)}
          </p>
          {subtitle && <p className="mt-1 line-clamp-2 text-xs leading-4 text-slate-500">{subtitle}</p>}
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              tone === "default" && "bg-slate-800 text-slate-300",
              tone === "green" && "bg-brand-500/15 text-brand-500",
              tone === "blue" && "bg-blue-500/15 text-blue-400",
              tone === "red" && "bg-red-500/15 text-red-400",
              tone === "yellow" && "bg-amber-500/15 text-amber-400",
            )}
          >
            {icon}
          </div>
        )}
      </div>
      {variation && <p className="mt-2 line-clamp-2 text-[11px] font-medium leading-4 text-slate-500">{variation}</p>}
    </section>
  );
}
