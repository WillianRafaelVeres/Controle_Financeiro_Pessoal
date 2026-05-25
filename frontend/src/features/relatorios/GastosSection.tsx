import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState } from "../../components/finance/EmptyState";
import { SectionCard } from "../../components/finance/SectionCard";
import { api } from "../../lib/api";
import { formatMoney, toNumber } from "../../lib/formatters";

const axisStyle = { fill: "#8f9bad", fontSize: 11 };
const tooltipStyle = { backgroundColor: "#111821", border: "1px solid #273343", borderRadius: 6, color: "#eef2f7" };
const COLORS = ["#16A34A", "#2563EB", "#f59e0b", "#DC2626", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

interface GastosSectionProps {
  ano: number;
  mes: number;
  showComparison: boolean;
}

export function GastosSection({ ano, mes }: GastosSectionProps) {
  const gastosCategoria = useQuery({
    queryKey: ["relatorios", "gastos-categoria", ano, mes],
    queryFn: () => api.relGastosCategoria(ano, mes),
  });
  const gastosPorMetodo = useQuery({
    queryKey: ["relatorios", "gastos-metodo", ano, mes],
    queryFn: () => api.relGastosMetodo(ano, mes),
  });
  const evolucao = useQuery({
    queryKey: ["relatorios", "evolucao-mensal", ano, mes],
    queryFn: () => api.relEvolucaoMensal(ano - 1, mes, ano, mes),
  });

  const categoriaData = [...(gastosCategoria.data ?? [])]
    .map((item) => ({ ...item, valor: toNumber(item.valor) }))
    .sort((a, b) => toNumber(b.valor) - toNumber(a.valor));
  const metodoData = [...(gastosPorMetodo.data ?? [])]
    .map((item) => ({ ...item, valor: toNumber(item.valor), percentual: toNumber(item.percentual) }))
    .sort((a, b) => b.valor - a.valor);

  return (
    <div className="space-y-4">
      <SectionCard title="Gastos por categoria" description="Finalidade real dos gastos do periodo. Cartao aparece como metodo, nao como categoria.">
        {categoriaData.length === 0 ? (
          <EmptyState title="Sem dados" description="Nenhum gasto registrado neste periodo." />
        ) : (
          <div className="h-[320px]">
            <ResponsiveContainer>
              <BarChart data={categoriaData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 12 }}>
                <CartesianGrid stroke="#273343" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(value as number)} />
                <YAxis dataKey="categoria" type="category" tick={axisStyle} axisLine={false} tickLine={false} width={132} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                <Bar dataKey="valor" name="Gasto" radius={[0, 6, 6, 0]} fill="#16A34A">
                  {categoriaData.map((_, index) => (
                    <Cell key={`categoria-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Gastos por metodo de pagamento" description="Pix, boleto e cada cartao aparecem como formas de pagamento.">
        {metodoData.length === 0 ? (
          <EmptyState title="Sem dados" description="Nenhum gasto registrado neste periodo." />
        ) : (
          <div className="h-[320px]">
            <ResponsiveContainer>
              <BarChart data={metodoData} layout="vertical" margin={{ top: 8, right: 32, bottom: 8, left: 12 }}>
                <CartesianGrid stroke="#273343" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(value as number)} />
                <YAxis dataKey="metodo" type="category" tick={axisStyle} axisLine={false} tickLine={false} width={140} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, _name, item) => [
                    `${formatMoney(value as number)} (${toNumber(item.payload.percentual).toFixed(1)}%)`,
                    "Valor",
                  ]}
                />
                <Bar dataKey="valor" name="Metodo" radius={[0, 6, 6, 0]}>
                  {metodoData.map((_, index) => (
                    <Cell key={`metodo-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Evolucao mensal de gastos" description="Comportamento dos gastos e receitas ao longo do tempo.">
        {(evolucao.data?.length ?? 0) === 0 ? (
          <EmptyState title="Sem dados" description="Dados insuficientes para mostrar evolucao." />
        ) : (
          <div className="h-80">
            <ResponsiveContainer>
              <LineChart data={evolucao.data}>
                <CartesianGrid stroke="#273343" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey={(item) => `${item.mes}/${item.ano}`} tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(value as number)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                <Line type="monotone" dataKey="gasto" stroke="#16A34A" strokeWidth={2.2} name="Gastos" />
                <Line type="monotone" dataKey="receita" stroke="#2563EB" strokeWidth={2.2} name="Receitas" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
