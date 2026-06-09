import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "icon";
}

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex max-w-full items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold shadow-sm transition duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        variant === "primary" && "border-emerald-300/35 bg-gradient-to-br from-emerald-400 via-brand-500 to-emerald-700 text-white shadow-[0_14px_34px_rgba(34,197,94,0.34),inset_0_1px_0_rgba(255,255,255,0.25)] hover:border-emerald-200/50 hover:shadow-[0_18px_44px_rgba(34,197,94,0.46),inset_0_1px_0_rgba(255,255,255,0.32)]",
        variant === "secondary" && "border-blue-300/[0.18] bg-gradient-to-br from-slate-800/[0.82] via-slate-900/[0.72] to-blue-950/45 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-blue-300/35 hover:bg-slate-800/85 hover:text-white",
        variant === "ghost" && "border-transparent bg-transparent text-slate-300 shadow-none hover:bg-white/[0.08] hover:text-slate-50",
        variant === "quiet" && "border-white/[0.08] bg-white/[0.07] text-slate-200 hover:border-white/[0.14] hover:bg-white/10",
        variant === "danger" && "border-red-300/25 bg-gradient-to-br from-red-500 to-red-700 text-white shadow-[0_14px_34px_rgba(239,68,68,0.26),inset_0_1px_0_rgba(255,255,255,0.18)] hover:border-red-200/40 hover:from-red-500 hover:to-red-800",
        size === "sm" && "min-h-8 px-2.5 py-1",
        size === "md" && "min-h-10 px-3.5 py-2",
        size === "icon" && "h-9 w-9 shrink-0 p-0",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
