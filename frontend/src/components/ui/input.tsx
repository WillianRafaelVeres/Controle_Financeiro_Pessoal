import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "min-h-9 w-full rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-1.5 text-[13px] text-slate-100 outline-none transition duration-150 placeholder:text-slate-500 hover:border-slate-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
        className,
      )}
      {...props}
    />
  );
});
