import { Check, Filter } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import type { EscopoDesempenho, PeriodoDesempenho } from "../../lib/types";

export interface RentabilidadeFiltersState {
  escopo: EscopoDesempenho;
  periodo: PeriodoDesempenho;
  benchmarks: string[];
  incluirProventos: boolean;
  dataInicio?: string;
  dataFim?: string;
}

interface RentabilidadeFiltersProps {
  value: RentabilidadeFiltersState;
  onChange: (nextState: RentabilidadeFiltersState) => void;
}

const ESCOPO_OPTIONS: Array<{ value: EscopoDesempenho; label: string }> = [
  { value: "CARTEIRA_TOTAL", label: "Carteira total" },
  { value: "ACAO_BR", label: "Ações brasileiras" },
  { value: "FII", label: "Fundos imobiliários" },
  { value: "ETF_BR", label: "ETFs Brasil" },
  { value: "RENDA_FIXA", label: "Renda fixa" },
  { value: "EXTERIOR", label: "Exterior" },
  { value: "CRIPTO", label: "Criptomoedas" },
  { value: "PREVIDENCIA", label: "Previdência" },
  { value: "DOLAR_CAIXA", label: "Dólar em caixa" },
  { value: "OUTRO", label: "Outros" },
];

const PERIODO_OPTIONS: Array<{ value: PeriodoDesempenho; label: string }> = [
  { value: "desde_inicio", label: "Desde o início" },
  { value: "ano_atual", label: "Ano atual" },
  { value: "12m", label: "12 meses" },
  { value: "24m", label: "24 meses" },
  { value: "36m", label: "36 meses" },
  { value: "personalizado", label: "Personalizado" },
];

const BENCHMARK_OPTIONS = [
  { id: "CDI", label: "CDI" },
  { id: "IBOVESPA", label: "Ibovespa" },
  { id: "IFIX", label: "IFIX" },
  { id: "SP500_BRL", label: "S&P 500 (BRL)" },
  { id: "SP500_USD", label: "S&P 500 (USD)" },
];

export function RentabilidadeFilters({ value, onChange }: RentabilidadeFiltersProps) {
  const toggleBenchmark = (bmId: string) => {
    const exists = value.benchmarks.includes(bmId);
    const nextBenchmarks = exists
      ? value.benchmarks.filter((b) => b !== bmId)
      : [...value.benchmarks, bmId];
    onChange({ ...value, benchmarks: nextBenchmarks });
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-[#111821] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Analisar:</span>
            <Select
              className="h-8 w-44 border-slate-700 bg-slate-900 text-xs font-medium text-slate-200"
              value={value.escopo}
              onChange={(e) => onChange({ ...value, escopo: e.target.value as EscopoDesempenho })}
            >
              {ESCOPO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Período:</span>
            <Select
              className="h-8 w-36 border-slate-700 bg-slate-900 text-xs font-medium text-slate-200"
              value={value.periodo}
              onChange={(e) => onChange({ ...value, periodo: e.target.value as PeriodoDesempenho })}
            >
              {PERIODO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {value.periodo === "personalizado" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200"
                value={value.dataInicio || ""}
                onChange={(e) => onChange({ ...value, dataInicio: e.target.value })}
              />
              <span className="text-xs text-slate-500">até</span>
              <input
                type="date"
                className="h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200"
                value={value.dataFim || ""}
                onChange={(e) => onChange({ ...value, dataFim: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              checked={value.incluirProventos}
              onChange={(e) => onChange({ ...value, incluirProventos: e.target.checked })}
            />
            Considerar proventos
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="mr-1 text-xs font-medium text-slate-400">Benchmarks:</span>
        {BENCHMARK_OPTIONS.map((bm) => {
          const selected = value.benchmarks.includes(bm.id);
          return (
            <button
              key={bm.id}
              type="button"
              onClick={() => toggleBenchmark(bm.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selected
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              {selected && <Check className="h-3 w-3 text-emerald-400" />}
              {bm.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
