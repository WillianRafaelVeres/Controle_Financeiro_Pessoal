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
    <div className="flex h-8 items-center rounded-md border border-slate-700 bg-slate-950">
      <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Mes anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="w-32 text-center text-[13px] font-medium capitalize text-slate-200 sm:w-36">{monthLabel(ano, mes)}</div>
      <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Proximo mes">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
