import type { PropsWithChildren } from "react";

import { cn } from "../../lib/utils";

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border border-slate-800/80 bg-[#111821]/92 shadow-[0_16px_40px_rgba(0,0,0,0.16)] transition-colors duration-200",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("border-b border-slate-800/80 px-3 py-2.5", className)}>{children}</div>;
}

export function CardContent({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("min-w-0 p-3", className)}>{children}</div>;
}
