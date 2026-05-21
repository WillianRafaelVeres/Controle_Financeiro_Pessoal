import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-8 w-full appearance-none rounded-md border border-slate-700 bg-slate-950 px-2.5 pr-8 text-[13px] text-slate-100 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-2 h-4 w-4 text-slate-500" />
    </div>
  );
}
