import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "../../lib/utils";

interface TrendChartProps {
  label: string;
  value: number; // Percentagem de mudança
  isPositive?: boolean;
  className?: string;
}

export function TrendChart({ label, value, isPositive, className }: TrendChartProps) {
  // Se não especificado, determine por sinal
  const positive = isPositive !== undefined ? isPositive : value > 0;

  return (
    <div className={cn("rounded-md border border-slate-800 bg-[#111821] p-2.5", className)}>
      <p className="truncate text-[10px] font-medium uppercase text-slate-500">{label}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {positive ? (
          <>
            <TrendingUp className="h-4 w-4 text-green-400" />
            <span className="font-semibold text-green-400">+{value.toFixed(1)}%</span>
          </>
        ) : value < 0 ? (
          <>
            <TrendingDown className="h-4 w-4 text-red-400" />
            <span className="font-semibold text-red-400">{value.toFixed(1)}%</span>
          </>
        ) : (
          <>
            <Minus className="h-4 w-4 text-slate-400" />
            <span className="font-semibold text-slate-400">—</span>
          </>
        )}
      </div>
    </div>
  );
}
