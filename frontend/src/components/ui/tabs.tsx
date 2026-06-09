import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex rounded-xl border border-white/10 bg-slate-950/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-400 transition hover:text-slate-100 data-[state=active]:bg-gradient-to-br data-[state=active]:from-brand-500 data-[state=active]:to-emerald-700 data-[state=active]:text-white data-[state=active]:shadow-[0_10px_24px_rgba(34,197,94,0.28)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-3 outline-none", className)} {...props} />;
}
