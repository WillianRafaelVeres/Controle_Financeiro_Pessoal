import type { ReactNode } from "react";

import { Button } from "../ui/button";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, action, icon }: EmptyStateProps) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.14] bg-slate-950/25 px-4 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {icon && <div className="mb-2 rounded-2xl bg-white/[0.06] p-2 text-slate-400">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-2" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
