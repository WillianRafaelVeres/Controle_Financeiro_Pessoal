import type { PropsWithChildren, ReactNode } from "react";

import { Card, CardContent, CardHeader } from "../ui/card";

interface SectionCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  compact?: boolean;
}

export function SectionCard({ title, description, action, className, contentClassName, compact, children }: PropsWithChildren<SectionCardProps>) {
  return (
    <Card className={className}>
      <CardHeader className={compact ? "flex flex-row items-start justify-between gap-3 px-4 py-3" : "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"}>
        <div className="min-w-0">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-slate-200">{title}</h2>
          {description && <p className="mt-0.5 max-w-3xl text-[12px] leading-5 text-slate-400">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}
