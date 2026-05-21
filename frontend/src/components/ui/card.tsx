import type { PropsWithChildren } from "react";

import { cn } from "../../lib/utils";

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <section className={cn("rounded-md border border-slate-800 bg-[#111821]", className)}>{children}</section>;
}

export function CardHeader({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("border-b border-slate-800 px-2.5 py-2", className)}>{children}</div>;
}

export function CardContent({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("p-2.5", className)}>{children}</div>;
}
