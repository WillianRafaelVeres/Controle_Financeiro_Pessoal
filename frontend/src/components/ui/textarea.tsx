import type { TextareaHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-xl border border-white/10 bg-slate-950/45 px-3.5 py-2.5 text-[13px] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none transition placeholder:text-slate-500 hover:border-white/[0.18] hover:bg-slate-900/55 focus:border-emerald-300/45 focus:ring-2 focus:ring-brand-500/25",
        className,
      )}
      {...props}
    />
  );
}
