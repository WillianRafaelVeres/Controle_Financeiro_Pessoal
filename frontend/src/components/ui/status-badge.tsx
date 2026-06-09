import type React from "react";

import { cn } from "../../lib/utils";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: StatusTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        tone === "neutral" && "border-white/10 bg-white/[0.06] text-slate-300",
        tone === "success" && "border-brand-500/30 bg-brand-500/15 text-emerald-300",
        tone === "warning" && "border-amber-500/30 bg-amber-500/15 text-amber-300",
        tone === "danger" && "border-red-500/30 bg-red-500/15 text-red-300",
        tone === "info" && "border-blue-500/30 bg-blue-500/15 text-blue-300",
      )}
    >
      {children}
    </span>
  );
}
