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
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        tone === "neutral" && "border-white/10 bg-white/[0.06] text-slate-300",
        tone === "green" && "border-brand-500/30 bg-brand-500/15 text-emerald-300",
        tone === "blue" && "border-blue-400/30 bg-blue-500/15 text-blue-300",
        tone === "red" && "border-red-400/30 bg-red-500/15 text-red-300",
        tone === "yellow" && "border-amber-400/30 bg-amber-500/15 text-amber-300",
        className,
      )}
    >
      {children}
    </span>
  );
}
