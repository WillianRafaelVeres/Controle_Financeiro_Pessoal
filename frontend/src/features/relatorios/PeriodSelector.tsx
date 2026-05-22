import { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

interface PeriodSelectorProps {
  selectedPeriod: "mes" | "3meses" | "12meses" | "custom";
  onPeriodChange: (period: "mes" | "3meses" | "12meses" | "custom") => void;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
  showComparison?: boolean;
  onComparisonToggle?: (enabled: boolean) => void;
  comparisonEnabled?: boolean;
}

export function PeriodSelector({
  selectedPeriod,
  onPeriodChange,
  onDateRangeChange,
  showComparison = true,
  onComparisonToggle,
  comparisonEnabled = false,
}: PeriodSelectorProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const handleCustomSubmit = () => {
    if (startDate && endDate && onDateRangeChange) {
      onDateRangeChange(new Date(startDate), new Date(endDate));
      setShowCustom(false);
    }
  };

  const periodOptions: Array<{ id: "mes" | "3meses" | "12meses"; label: string }> = [
    { id: "mes", label: "Último mês" },
    { id: "3meses", label: "Últimos 3 meses" },
    { id: "12meses", label: "Últimos 12 meses" },
  ];

  return (
    <div className="space-y-3">
      {/* Período */}
      <div className="flex flex-wrap items-center gap-2">
        {periodOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => {
              onPeriodChange(opt.id);
              setShowCustom(false);
            }}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors",
              selectedPeriod === opt.id
                ? "bg-brand-500 text-white"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            )}
          >
            {opt.label}
          </button>
        ))}

        <button
          onClick={() => setShowCustom(!showCustom)}
          className={cn(
            "rounded px-3 py-1.5 text-xs font-medium transition-colors",
            selectedPeriod === "custom"
              ? "bg-brand-500 text-white"
              : "bg-slate-800 text-slate-400 hover:bg-slate-700"
          )}
        >
          <Calendar className="inline mr-1 h-3 w-3" />
          Customizado
        </button>
      </div>

      {/* Custom date range */}
      {showCustom && (
        <div className="flex flex-col gap-2 rounded-md border border-slate-700 bg-slate-900/50 p-3">
          <label className="text-xs font-medium text-slate-300">
            Data início:
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="ml-2 rounded bg-slate-800 px-2 py-1 text-xs text-slate-100"
            />
          </label>
          <label className="text-xs font-medium text-slate-300">
            Data fim:
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="ml-2 rounded bg-slate-800 px-2 py-1 text-xs text-slate-100"
            />
          </label>
          <button
            onClick={handleCustomSubmit}
            className="mt-2 rounded bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
          >
            Aplicar
          </button>
        </div>
      )}

      {/* Comparison toggle */}
      {showComparison && onComparisonToggle && (
        <label className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <input
            type="checkbox"
            checked={comparisonEnabled}
            onChange={(e) => onComparisonToggle(e.target.checked)}
            className="rounded"
          />
          Comparar com período anterior
        </label>
      )}
    </div>
  );
}
