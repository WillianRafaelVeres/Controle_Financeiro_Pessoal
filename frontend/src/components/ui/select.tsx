import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0">
      <select
        className={cn(
          "min-h-9 w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 pr-9 text-[13px] text-slate-100 outline-none transition hover:border-slate-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-500" />
    </div>
  );
}
