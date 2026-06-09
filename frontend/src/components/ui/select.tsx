import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0">
      <select
        className={cn(
          "min-h-10 w-full appearance-none rounded-xl border border-white/10 bg-slate-950/55 px-3.5 py-2 pr-9 text-[13px] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none transition hover:border-white/[0.18] hover:bg-slate-900/65 focus:border-emerald-300/45 focus:ring-2 focus:ring-brand-500/25",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
    </div>
  );
}
