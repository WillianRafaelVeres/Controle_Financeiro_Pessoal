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
        "inline-flex items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "border-brand-600 bg-brand-500 text-white hover:bg-brand-600",
        variant === "secondary" && "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800",
        variant === "ghost" && "border-transparent bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-50",
        variant === "quiet" && "border-transparent bg-slate-800 text-slate-200 hover:bg-slate-700",
        variant === "danger" && "border-danger-600 bg-danger-600 text-white hover:bg-red-700",
        size === "sm" && "h-7 px-2.5",
        size === "md" && "h-8 px-3",
        size === "icon" && "h-7 w-7 p-0",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
