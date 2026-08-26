import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SectionCard } from "../../components/finance/SectionCard";
import { formatMoney, formatPercent } from "../../lib/formatters";
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
    modo: "valor",
    categoriasSelecionadas: [],
  });

  // Inicializar categorias selecionadas se ainda não configurado
  const categoriasAtivas = useMemo(() => {
    if (filters.categoriasSelecionadas.length > 0) {
      return filters.categoriasSelecionadas;
    }
    return todasCategorias;
  }, [filters.categoriasSelecionadas, todasCategorias]);

  // Preparar dados do gráfico
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

        <div className="h-80 w-full rounded-md border border-slate-800 bg-[#111821] p-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              Carregando evolução por categoria...
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              Ainda não existem dados de categorias para exibir.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#273343" vertical={false} />
                <XAxis dataKey="periodo" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val) =>
                    filters.modo === "valor" ? `R$ ${(val / 1000).toFixed(0)}k` : `${val}%`
                  }
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#111821", border: "1px solid #273343", borderRadius: 6, color: "#eef2f7" }}
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
                    <Area
                      key={catKey}
                      type="monotone"
                      dataKey={catKey}
                      name={catKey}
                      stackId="1"
                      stroke={color}
                      fill={color}
                      fillOpacity={0.4}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
