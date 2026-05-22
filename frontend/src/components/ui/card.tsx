import type { PropsWithChildren } from "react";

import { cn } from "../../lib/utils";

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <section
      className={cn(
        "rounded-md border border-slate-800/90 bg-[#111821]/95 shadow-[0_10px_28px_rgba(0,0,0,0.14)] transition-colors duration-200",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("border-b border-slate-800/90 px-2.5 py-2", className)}>{children}</div>;
}

export function CardContent({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("p-2.5", className)}>{children}</div>;
}
