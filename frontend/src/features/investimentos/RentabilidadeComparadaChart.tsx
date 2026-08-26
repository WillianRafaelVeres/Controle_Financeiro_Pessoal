import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SectionCard } from "../../components/finance/SectionCard";
import { formatPercent } from "../../lib/formatters";
import type { RentabilidadeComparadaResponse } from "../../lib/types";
import { PerformanceCoverageAlert } from "./PerformanceCoverageAlert";
import { RentabilidadeFilters, type RentabilidadeFiltersState } from "./RentabilidadeFilters";

interface RentabilidadeComparadaChartProps {
  data?: RentabilidadeComparadaResponse;
  isLoading: boolean;
  filters: RentabilidadeFiltersState;
  onFiltersChange: (nextState: RentabilidadeFiltersState) => void;
}

const BENCHMARK_COLORS: Record<string, string> = {
  carteira: "#10b981", // verde esmeralda em destaque
  CDI: "#3b82f6", // azul
  IBOVESPA: "#f59e0b", // amarelo/âmbar
  IFIX: "#8b5cf6", // roxo
  SP500_BRL: "#ec4899", // rosa
  SP500_USD: "#f43f5e", // rosa escuro
};

function formatPP(val: number) {
  const signal = val > 0 ? "+" : "";
  return `${signal}${val.toFixed(2).replace(".", ",")} p.p.`;
}

function formatDataLegivel(isoStr?: string) {
  if (!isoStr) return "";
  const parts = isoStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoStr;
}

export function RentabilidadeComparadaChart({
  data,
  isLoading,
  filters,
  onFiltersChange,
}: RentabilidadeComparadaChartProps) {
  const escopoLabel = data?.escopo.label || "Carteira total";
  const cdiResumo = data?.resumo.benchmarks?.CDI;
  const cdiVal = cdiResumo?.rentabilidade_percentual;
  const carteiraVal = data?.resumo.carteira_percentual ?? 0;
  const difCdi = cdiResumo?.diferenca_pp;

  // Encontrar o melhor benchmark
  const melhorBenchmark = useMemo<{ label: string; val: number } | null>(() => {
    if (!data?.resumo.benchmarks) return null;
    let melhor: { label: string; val: number } | null = null;
    Object.values(data.resumo.benchmarks).forEach((item) => {
      if (item.disponivel !== false && item.rentabilidade_percentual !== undefined) {
        if (!melhor || item.rentabilidade_percentual > melhor.val) {
          melhor = { label: item.label, val: item.rentabilidade_percentual };
        }
      }
    });
    return melhor;
  }, [data]);

  return (
    <SectionCard
      title="Rentabilidade comparada"
      description="Compare a rentabilidade da carteira ou de uma classe de investimentos com índices de referência no mesmo período."
    >
      <div className="space-y-4">
        <RentabilidadeFilters value={filters} onChange={onFiltersChange} />

        <PerformanceCoverageAlert cobertura={data?.cobertura} />

        {/* Small Summary Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Retorno ({escopoLabel})
            </p>
            <p className={`mt-0.5 text-lg font-bold ${carteiraVal >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {formatPercent(carteiraVal)}
            </p>
          </div>

          <div className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">CDI no período</p>
            <p className="mt-0.5 text-lg font-bold text-blue-400">
              {cdiVal !== undefined ? formatPercent(cdiVal) : "--"}
            </p>
          </div>

          <div className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Resultado vs CDI</p>
            <p className={`mt-0.5 text-lg font-bold ${difCdi !== undefined && difCdi >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {difCdi !== undefined ? formatPP(difCdi) : "--"}
            </p>
          </div>

          <div className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Melhor benchmark</p>
            <p className="mt-0.5 truncate text-sm font-bold text-amber-400">
              {melhorBenchmark ? `${melhorBenchmark.label} ${formatPercent(melhorBenchmark.val)}` : "--"}
            </p>
          </div>
        </div>

        {/* Date Indicator discretely */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            Período analisado:{" "}
            <strong className="text-slate-200">{formatDataLegivel(data?.data_inicio_efetiva)}</strong> até{" "}
            <strong className="text-slate-200">{formatDataLegivel(data?.data_fim)}</strong>
          </span>
          {filters.periodo === "desde_inicio" && (
            <span className="italic text-slate-500">
              Início determinado pela primeira movimentação de {escopoLabel}.
            </span>
          )}
        </div>

        {/* Recharts LineChart */}
        <div className="h-80 w-full rounded-md border border-slate-800 bg-[#111821] p-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              Carregando rentabilidade comparada...
            </div>
          ) : !data?.serie || data.serie.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              Ainda não existem movimentações neste escopo para analisar.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.serie} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#273343" vertical={false} />
                <XAxis dataKey="periodo" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(val) => `${val}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#111821", border: "1px solid #273343", borderRadius: 6, color: "#eef2f7" }}
                  formatter={(val: any, name?: any) => {
                    const numVal = Number(val || 0);
                    const formatted = formatPercent(numVal);
                    const nameStr = String(name || "");
                    if (nameStr === "carteira") {
                      return [formatted, escopoLabel];
                    }
                    const bmInfo = data.resumo.benchmarks?.[nameStr];
                    const label = bmInfo?.label || nameStr;
                    const cVal = data.resumo.carteira_percentual;
                    const diff = cVal - numVal;
                    return [`${formatted} (${formatPP(diff)} vs ${escopoLabel})`, label];
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: 10, fontSize: 12 }}
                  formatter={(value) => (value === "carteira" ? escopoLabel : (data.resumo.benchmarks?.[value]?.label || value))}
                />
                <Line
                  type="monotone"
                  dataKey="carteira"
                  name="carteira"
                  stroke={BENCHMARK_COLORS.carteira}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
                {filters.benchmarks.map((bmKey) => (
                  <Line
                    key={bmKey}
                    type="monotone"
                    dataKey={bmKey}
                    name={bmKey}
                    stroke={BENCHMARK_COLORS[bmKey] || "#94a3b8"}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
