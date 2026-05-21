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
}

export function MoneyCard({ title, value, subtitle, variation, icon, tone = "default", className, size = "md" }: MoneyCardProps) {
  return (
    <section className={cn("rounded-md border border-slate-800 bg-[#111821] p-2.5", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase text-slate-500">{title}</p>
          <p className={cn("mt-0.5 font-semibold tracking-normal text-slate-100", size === "md" ? "text-lg" : "text-base")}>
            {formatMoney(value)}
          </p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
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
      {variation && <p className="mt-1.5 text-[11px] font-medium text-slate-500">{variation}</p>}
    </section>
  );
}
