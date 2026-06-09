import type { PropsWithChildren } from "react";

import { cn } from "../../lib/utils";

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <section
      className={cn(
        "glass-highlight min-w-0 rounded-2xl border border-white/10 bg-slate-900/55 shadow-[0_20px_70px_rgba(0,0,0,0.24)] ring-1 ring-inset ring-white/[0.05] backdrop-blur-2xl transition duration-200 hover:border-white/15 hover:bg-slate-900/65",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("border-b border-white/10 px-4 py-3", className)}>{children}</div>;
}

export function CardContent({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("min-w-0 p-4", className)}>{children}</div>;
}
