import type { PropsWithChildren, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Table({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-800/90 bg-slate-950/15">
      <table className={cn("w-full min-w-[760px] border-separate border-spacing-0 text-left text-[13px]", className)}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className, ...props }: PropsWithChildren<ThHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <th
      className={cn("border-b border-slate-800 bg-slate-900/95 px-2.5 py-1.5 text-[11px] font-semibold uppercase text-slate-400", className)}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, ...props }: PropsWithChildren<TdHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <td className={cn("border-b border-slate-800/80 px-2.5 py-1.5 text-slate-300", className)} {...props}>
      {children}
    </td>
  );
}
