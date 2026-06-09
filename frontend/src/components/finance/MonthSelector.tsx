import { ChevronLeft, ChevronRight } from "lucide-react";

import { monthLabel } from "../../lib/utils";
import { Button } from "../ui/button";

interface MonthSelectorProps {
  ano: number;
  mes: number;
  onChange: (value: { ano: number; mes: number }) => void;
}

export function MonthSelector({ ano, mes, onChange }: MonthSelectorProps) {
  function shift(delta: number) {
    const next = new Date(ano, mes - 1 + delta, 1);
    onChange({ ano: next.getFullYear(), mes: next.getMonth() + 1 });
  }

  return (
    <div className="flex min-h-10 items-center rounded-xl border border-white/10 bg-slate-950/45 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Mes anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="w-36 text-center text-[13px] font-semibold capitalize text-slate-100 sm:w-40">{monthLabel(ano, mes)}</div>
      <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Proximo mes">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
