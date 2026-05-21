import type React from "react";

import { cn } from "../../lib/utils";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: StatusTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "border-slate-700 bg-slate-900 text-slate-300",
        tone === "success" && "border-brand-500/25 bg-brand-500/15 text-brand-500",
        tone === "warning" && "border-amber-500/25 bg-amber-500/15 text-amber-400",
        tone === "danger" && "border-red-500/25 bg-red-500/15 text-red-400",
        tone === "info" && "border-blue-500/25 bg-blue-500/15 text-blue-400",
      )}
    >
      {children}
    </span>
  );
}
