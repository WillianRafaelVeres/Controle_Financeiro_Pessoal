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
    <div className="flex min-h-24 flex-col items-center justify-center rounded-md border border-dashed border-slate-700 bg-slate-950/30 px-4 py-4 text-center">
      {icon && <div className="mb-1.5 text-slate-500">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-slate-500">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-2" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
