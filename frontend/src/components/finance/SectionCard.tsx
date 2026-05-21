import type { PropsWithChildren, ReactNode } from "react";

import { Card, CardContent, CardHeader } from "../ui/card";

interface SectionCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionCard({ title, description, action, className, children }: PropsWithChildren<SectionCardProps>) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 px-2.5 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-[11px] font-semibold uppercase text-slate-300">{title}</h2>
          {description && <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{description}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-2.5">{children}</CardContent>
    </Card>
  );
}
