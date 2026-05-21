import type { PropsWithChildren } from "react";

import { cn } from "../../lib/utils";

export function Badge({
  children,
  tone = "neutral",
  className,
}: PropsWithChildren<{ tone?: "neutral" | "green" | "blue" | "red" | "yellow"; className?: string }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "border-slate-700 bg-slate-900 text-slate-300",
        tone === "green" && "border-brand-500/25 bg-brand-500/15 text-brand-500",
        tone === "blue" && "border-blue-500/25 bg-blue-500/15 text-blue-400",
        tone === "red" && "border-red-500/25 bg-red-500/15 text-red-400",
        tone === "yellow" && "border-amber-500/25 bg-amber-500/15 text-amber-400",
        className,
      )}
    >
      {children}
    </span>
  );
}
