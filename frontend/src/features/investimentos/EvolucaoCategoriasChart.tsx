import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SectionCard } from "../../components/finance/SectionCard";
import { formatMoney, formatMoneyCompact, formatPercent } from "../../lib/formatters";
import type { EvolucaoCategoriasResponse } from "../../lib/types";
import {
  EvolucaoCategoriasFilters,
  type EvolucaoCategoriasFiltersState,
} from "./EvolucaoCategoriasFilters";

interface EvolucaoCategoriasChartProps {
  data?: EvolucaoCategoriasResponse;
  isLoading: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  ACAO_BR: "#10b981", // verde
  FII: "#3b82f6", // azul
  ETF_BR: "#06b6d4", // ciano
  RENDA_FIXA: "#f59e0b", // amarelo
  CAIXINHA_CDB: "#fbbf24", // amarelo claro
  RESERVA_EMERGENCIA: "#eab308", // amarelo escuro
  EXTERIOR: "#ec4899", // rosa
  ACAO_EXTERIOR: "#f43f5e", // rosa escuro
  ETF_EXTERIOR: "#d946ef", // magenta
  CRIPTO: "#8b5cf6", // roxo
  PREVIDENCIA: "#6366f1", // índigo
  DOLAR_CAIXA: "#a855f7", // roxo claro
  OUTRO: "#64748b", // cinza
};

export function EvolucaoCategoriasChart({ data, isLoading }: EvolucaoCategoriasChartProps) {
  // Extrair todas as categorias que aparecem na resposta
  const todasCategorias = useMemo(() => {
    if (!data?.periodos) return [];
    const setCats = new Set<string>();
    data.periodos.forEach((p) => {
      p.categorias.forEach((c) => setCats.add(c.tipo));
    });
    return Array.from(setCats);
  }, [data]);

  const [filters, setFilters] = useState<EvolucaoCategoriasFiltersState>({
    modo: "participacao",
    categoriasSelecionadas: [],
  });

  // Inicializar categorias selecionadas se ainda não configurado
  const categoriasAtivas = useMemo(() => {
    if (filters.categoriasSelecionadas.length > 0) {
      return filters.categoriasSelecionadas;
    }
    return todasCategorias;
  }, [filters.categoriasSelecionadas, todasCategorias]);

  const isSingleCategory = categoriasAtivas.length === 1;
  const singleCategoryKey = isSingleCategory ? categoriasAtivas[0] : null;

  // Dados para visão de categoria única (Aporte vs Lucro Real)
  const singleCatData = useMemo(() => {
    if (!isSingleCategory || !singleCategoryKey || !data?.periodos) return [];
    return data.periodos.map((p) => {
      const cat = p.categorias.find((c) => c.tipo === singleCategoryKey);
      const patrimonio = cat?.valor_brl ?? 0;
      const aportado = cat?.aportado_acumulado_brl ?? 0;
      const lucro = cat?.lucro_brl ?? (patrimonio - aportado);
      const rentabilidade = cat?.rentabilidade_percentual ?? (aportado > 0 ? (lucro / aportado) * 100 : 0);
      return {
        periodo: p.periodo,
        patrimonio,
        aportado,
        lucro,
        rentabilidade,
        label: cat?.label || singleCategoryKey,
      };
    });
  }, [isSingleCategory, singleCategoryKey, data]);

  const singleCatSummary = useMemo(() => {
    if (!singleCatData || singleCatData.length === 0) return null;
    return singleCatData[singleCatData.length - 1];
  }, [singleCatData]);

  // Preparar dados do gráfico geral (barra empilhada)
  const chartData = useMemo(() => {
    if (!data?.periodos) return [];
    return data.periodos.map((p) => {
      const point: Record<string, string | number> = {
        periodo: p.periodo,
        patrimonio_total: p.patrimonio_total_brl,
      };

      p.categorias.forEach((c) => {
        if (filters.modo === "valor") {
          point[c.tipo] = c.valor_brl;
        } else {
          point[c.tipo] = c.percentual_carteira;
        }
        point[`${c.tipo}_brl`] = c.valor_brl;
        point[`${c.tipo}_pct`] = c.percentual_carteira;
        point[`${c.tipo}_label`] = c.label;
      });

      return point;
    });
  }, [data, filters.modo]);

  return (
    <SectionCard
      title="Evolução por categoria"
      description="Veja como o patrimônio e a participação de cada classe de investimento mudaram ao longo do tempo."
    >
      <div className="space-y-4">
        <EvolucaoCategoriasFilters
          value={{ ...filters, categoriasSelecionadas: categoriasAtivas }}
          todasCategorias={todasCategorias}
          onChange={(next) => setFilters(next)}
        />

        {/* Resumo da classe quando uma única categoria está selecionada */}
        {isSingleCategory && singleCatSummary && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Patrimônio ({singleCatSummary.label})
              </p>
              <p className="mt-0.5 text-lg font-bold text-slate-100">
                {formatMoney(singleCatSummary.patrimonio)}
              </p>
            </div>
            <div className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Total Aportado
              </p>
              <p className="mt-0.5 text-lg font-bold text-blue-400">
                {formatMoney(singleCatSummary.aportado)}
              </p>
            </div>
            <div className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Ganho Real (Lucro)
              </p>
              <p
                className={`mt-0.5 text-lg font-bold ${
                  singleCatSummary.lucro >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatMoney(singleCatSummary.lucro)}
              </p>
            </div>
            <div className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Rentabilidade Real
              </p>
              <p
                className={`mt-0.5 text-lg font-bold ${
                  singleCatSummary.rentabilidade >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatPercent(singleCatSummary.rentabilidade)}
              </p>
            </div>
          </div>
        )}

        <div className="h-80 w-full rounded-md border border-slate-800 bg-[#111821] p-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              Carregando evolução por categoria...
            </div>
          ) : isSingleCategory ? (
            singleCatData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                Ainda não existem dados para esta categoria.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={singleCatData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#273343" vertical={false} />
                  <XAxis dataKey="periodo" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="left"
                    stroke="#64748b"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val) => formatMoneyCompact(val)}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#a855f7"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val) => `${val}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111821",
                      border: "1px solid #273343",
                      borderRadius: 6,
                      color: "#eef2f7",
                    }}
                    formatter={(val: any, name?: any) => {
                      const numVal = Number(val || 0);
                      const nameStr = String(name || "");
                      if (nameStr === "Rentabilidade %") return [formatPercent(numVal), nameStr];
                      return [formatMoney(numVal), nameStr];
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
                  <Bar
                    yAxisId="left"
                    dataKey="aportado"
                    name="Total Aportado"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="lucro"
                    name="Ganho Real (Lucro)"
                    radius={[4, 4, 0, 0]}
                  >
                    {singleCatData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.lucro >= 0 ? "#10b981" : "#ef4444"}
                      />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="patrimonio"
                    name="Patrimônio Total"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="rentabilidade"
                    name="Rentabilidade %"
                    stroke="#a855f7"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              Ainda não existem dados de categorias para exibir.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#273343" vertical={false} />
                <XAxis dataKey="periodo" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val) =>
                    filters.modo === "valor" ? formatMoneyCompact(val) : `${val}%`
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111821",
                    border: "1px solid #273343",
                    borderRadius: 6,
                    color: "#eef2f7",
                  }}
                  formatter={(val: any, name?: any, item?: any) => {
                    const p = (item && item.payload) || {};
                    const nameStr = String(name || "");
                    const label = (p[`${nameStr}_label`] as string) || nameStr;
                    const valBrl = Number(p[`${nameStr}_brl`] || 0);
                    const valPct = Number(p[`${nameStr}_pct`] || 0);
                    return [`${formatMoney(valBrl)} (${formatPercent(valPct)} da carteira)`, label];
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: 10, fontSize: 12 }}
                  formatter={(value) => {
                    const p0 = chartData[0] || {};
                    return (p0[`${value}_label`] as string) || value;
                  }}
                />
                {todasCategorias.map((catKey) => {
                  const isVisible = categoriasAtivas.includes(catKey);
                  if (!isVisible) return null;
                  const color = CATEGORY_COLORS[catKey] || "#94a3b8";
                  return (
                    <Bar
                      key={catKey}
                      dataKey={catKey}
                      name={catKey}
                      stackId="a"
                      fill={color}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
