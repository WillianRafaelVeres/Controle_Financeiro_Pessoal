import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState } from "../../components/finance/EmptyState";
import { SectionCard } from "../../components/finance/SectionCard";
import { formatMoney, toNumber } from "../../lib/formatters";

const colors = ["#16A34A", "#2563EB", "#F59E0B", "#DC2626", "#64748B", "#0F766E"];
const axisStyle = { fill: "#8f9bad", fontSize: 11 };
const tooltipStyle = { backgroundColor: "#111821", border: "1px solid #273343", borderRadius: 6, color: "#eef2f7" };

export function GraficosResumo({ data }: { data?: Record<string, Array<Record<string, string | number>>> }) {
  const gastos = normalizeChartData(data?.gastos_por_categoria ?? []);
  const receitas = normalizeChartData(data?.receitas_vs_gastos ?? []);
  return (
    <div className="grid gap-2 xl:grid-cols-2">
      <SectionCard title="Gastos por categoria">
        {gastos.length === 0 ? (
          <EmptyState title="Sem gastos no mês" description="Os gastos efetivos aparecerão aqui conforme lançamentos forem registrados." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart style={{ outline: "none" }}>
                <Pie data={gastos} dataKey="valor" nameKey="categoria" innerRadius={62} outerRadius={100} paddingAngle={2}>
                  {gastos.map((_, index) => (
                    <Cell key={index} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                <Legend wrapperStyle={{ color: "#8f9bad", fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
      <SectionCard title="Receitas x gastos">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={receitas} style={{ outline: "none" }}>
              <CartesianGrid stroke="#273343" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="nome" tick={axisStyle} axisLine={{ stroke: "#273343" }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(value).replace("R$", "")} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
              <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                {receitas.map((_, index) => (
                  <Cell key={index} fill={colors[index % colors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </div>
  );
}

function normalizeChartData(items: Array<Record<string, string | number>>) {
  return items.map((item) => ({ ...item, valor: toNumber(item.valor) })).filter((item) => item.valor > 0);
}
