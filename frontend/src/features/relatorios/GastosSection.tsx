import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Legend, AreaChart, Area, LineChart, Line, CartesianGrid } from "recharts";
import { EmptyState } from "../../components/finance/EmptyState";
import { SectionCard } from "../../components/finance/SectionCard";
import { Td, Th, Table } from "../../components/ui/table";
import { api } from "../../lib/api";
import { formatMoney, formatPercent, toNumber } from "../../lib/formatters";
import { TrendChart } from "./TrendChart";

const axisStyle = { fill: "#8f9bad", fontSize: 11 };
const tooltipStyle = { backgroundColor: "#111821", border: "1px solid #273343", borderRadius: 6, color: "#eef2f7" };

interface GastosSectionProps {
  ano: number;
  mes: number;
  showComparison: boolean;
}

const COLORS = ["#16A34A", "#2563EB", "#f59e0b", "#DC2626", "#8b5cf6", "#ec4899", "#06b6d4", "#ef4444"];

export function GastosSection({ ano, mes, showComparison }: GastosSectionProps) {
  // Query para gastos por categoria
  const gastosCategoria = useQuery({
    queryKey: ["relatorios", "gastos-categoria", ano, mes],
    queryFn: () => api.relGastosCategoria(ano, mes),
  });

  // Query para gastos por método de pagamento
  const gastosPorMetodo = useQuery({
    queryKey: ["relatorios", "gastos-metodo", ano, mes],
    queryFn: () => api.relGastosMetodo(ano, mes),
  });

  // Query para orçado vs realizado
  const orcadoRealizado = useQuery({
    queryKey: ["relatorios", "orcado-realizado", ano, mes],
    queryFn: () => api.relOrcadoRealizado(ano, mes),
  });

  // Query para evolução mensal (últimos 12 meses)
  const evolucao = useQuery({
    queryKey: ["relatorios", "evolucao-mensal", ano, mes],
    queryFn: () => api.relEvolucaoMensal(ano - 1, mes, ano, mes),
  });

  // Calcular total de gastos
  const totalGastos = gastosCategoria.data?.reduce((sum, item) => sum + toNumber(item.valor), 0) || 0;

  return (
    <div className="space-y-4">
      {/* Seção 3.1: Gastos por Categoria */}
      <SectionCard title="Gastos por categoria" description="Breakdown de onde seu dinheiro vai">
        {(gastosCategoria.data?.length ?? 0) === 0 ? (
          <EmptyState title="Sem dados" description="Nenhum gasto registrado neste período." />
        ) : (
          <div className="space-y-4">
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={gastosCategoria.data} layout="vertical">
                  <CartesianGrid stroke="#273343" strokeDasharray="3 3" vertical={true} />
                  <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis dataKey="categoria" type="category" tick={{ fontSize: 11, fill: "#8f9bad" }} width={120} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                  <Bar dataKey="valor" fill="#16A34A" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tabela com orçado vs realizado */}
            {(orcadoRealizado.data?.length ?? 0) > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Categoria</Th>
                      <Th>Orçado</Th>
                      <Th>Realizado</Th>
                      <Th>Diferença</Th>
                      <Th>% Orçado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orcadoRealizado.data ?? []).map((item) => {
                      const orcado = toNumber(item.valor_orcado);
                      const realizado = toNumber(item.gasto_real);
                      const percentual = orcado > 0 ? (realizado / orcado) * 100 : 0;
                      const diferenca = realizado - orcado;
                      return (
                        <tr key={item.categoria_id}>
                          <Td>{item.categoria}</Td>
                          <Td>{formatMoney(item.valor_orcado)}</Td>
                          <Td>{formatMoney(item.gasto_real)}</Td>
                          <Td className={diferenca > 0 ? "text-red-400" : "text-green-400"}>
                            {diferenca > 0 ? "+" : ""}{formatMoney(diferenca)}
                          </Td>
                          <Td className={percentual > 100 ? "text-red-400" : percentual > 80 ? "text-amber-400" : "text-slate-100"}>
                            {percentual.toFixed(0)}%
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Seção 3.2: Gastos por Método de Pagamento */}
      <SectionCard title="Gastos por método de pagamento" description="Como você está pagando suas compras">
        {(gastosPorMetodo.data?.length ?? 0) === 0 ? (
          <EmptyState title="Sem dados" description="Nenhum gasto registrado neste período." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={gastosPorMetodo.data}
                  dataKey="valor"
                  nameKey="metodo"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={(props: any) => `${props.metodo ?? ""} ${toNumber(props.percentual) ? toNumber(props.percentual).toFixed(0) : "0"}%`}
                >
                  {(gastosPorMetodo.data ?? []).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* Seção 3.4: Evolução Mensal */}
      <SectionCard title="Evolução mensal de gastos" description="Comportamento ao longo do tempo">
        {(evolucao.data?.length ?? 0) === 0 ? (
          <EmptyState title="Sem dados" description="Dados insuficientes para mostrar evolução." />
        ) : (
          <div className="h-80">
            <ResponsiveContainer>
              <LineChart data={evolucao.data}>
                <CartesianGrid stroke="#273343" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey={(item) => `${item.mes}/${item.ano}`}
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                <Line type="monotone" dataKey="gasto" stroke="#16A34A" strokeWidth={2} name="Gasto Real" />
                <Line type="monotone" dataKey="receita" stroke="#2563EB" strokeWidth={2} name="Receita" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
