import type { PropsWithChildren, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Table({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className="glass-highlight max-w-full overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <table className={cn("w-full min-w-[680px] border-separate border-spacing-0 text-left text-[13px]", className)}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className, ...props }: PropsWithChildren<ThHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <th
      className={cn("border-b border-white/10 bg-slate-800/[0.62] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400", className)}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, ...props }: PropsWithChildren<TdHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <td className={cn("border-b border-white/[0.08] px-4 py-3 align-middle text-slate-300 transition-colors", className)} {...props}>
      {children}
    </td>
  );
}
