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
    <section className={cn("glass-highlight min-w-0 rounded-2xl border border-white/10 bg-slate-900/[0.58] p-4 shadow-[0_18px_52px_rgba(0,0,0,0.20)] ring-1 ring-inset ring-white/[0.04] backdrop-blur-xl transition duration-200 hover:border-white/[0.16] hover:bg-slate-900/[0.68]", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
          <p className={cn("mt-2 break-words font-semibold tracking-normal text-slate-100", size === "md" ? "text-2xl leading-7" : "text-base")}>
            {formatMoney(value, currency)}
          </p>
          {subtitle && <p className="mt-1 line-clamp-2 text-xs leading-4 text-slate-400">{subtitle}</p>}
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
              tone === "default" && "bg-slate-800/80 text-slate-300",
              tone === "green" && "bg-brand-500/[0.18] text-emerald-300 shadow-[0_0_26px_rgba(34,197,94,0.22)]",
              tone === "blue" && "bg-blue-500/[0.18] text-blue-300 shadow-[0_0_26px_rgba(59,130,246,0.20)]",
              tone === "red" && "bg-red-500/[0.18] text-red-300 shadow-[0_0_26px_rgba(239,68,68,0.18)]",
              tone === "yellow" && "bg-amber-500/[0.18] text-amber-300 shadow-[0_0_26px_rgba(245,158,11,0.18)]",
            )}
          >
            {icon}
          </div>
        )}
      </div>
      {variation && <p className="mt-3 line-clamp-2 text-[11px] font-medium leading-4 text-slate-400">{variation}</p>}
    </section>
  );
}
