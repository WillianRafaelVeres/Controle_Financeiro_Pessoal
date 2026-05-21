import { useQuery } from "@tanstack/react-query";
import { Filter } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState } from "../components/finance/EmptyState";
import { MonthSelector } from "../components/finance/MonthSelector";
import { SectionCard } from "../components/finance/SectionCard";
import { Select } from "../components/ui/select";
import { Td, Th, Table } from "../components/ui/table";
import { api } from "../lib/api";
import { formatMoney } from "../lib/formatters";
import { currentMonth } from "../lib/utils";

const axisStyle = { fill: "#8f9bad", fontSize: 11 };
const tooltipStyle = { backgroundColor: "#111821", border: "1px solid #273343", borderRadius: 6, color: "#eef2f7" };

export function RelatoriosPage() {
  const [month, setMonth] = useState(currentMonth());
  const [tipo, setTipo] = useState("");
  const gastos = useQuery({ queryKey: ["relatorios", "gastos", month], queryFn: () => api.relGastosCategoria(month.ano, month.mes) });
  const orcado = useQuery({ queryKey: ["relatorios", "orcado", month], queryFn: () => api.relOrcadoRealizado(month.ano, month.mes) });
  return (
    <div className="space-y-2">
      <SectionCard title="Filtros do relatório" description="Relatórios têm período próprio e não dependem de controle global.">
        <div className="flex flex-wrap items-center gap-3">
          <MonthSelector ano={month.ano} mes={month.mes} onChange={setMonth} />
          <div className="flex items-center gap-2 text-[13px] text-slate-500">
            <Filter className="h-4 w-4" />
            Mais filtros
          </div>
          <div className="w-48">
            <Select value={tipo} onChange={(event) => setTipo(event.target.value)}>
              <option value="">Todos os tipos</option>
              <option value="categoria">Categoria</option>
              <option value="subcategoria">Subcategoria</option>
              <option value="metodo">Método</option>
              <option value="cartao">Cartão</option>
            </Select>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Gastos por categoria">
        {(gastos.data?.length ?? 0) === 0 ? (
          <EmptyState title="Sem dados no período" description="Os relatórios serão preenchidos conforme os lançamentos forem registrados." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={gastos.data}>
                <CartesianGrid stroke="#273343" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="categoria" tick={axisStyle} axisLine={{ stroke: "#273343" }} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(value).replace("R$", "")} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                <Bar dataKey="valor" fill="#16A34A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
      <SectionCard title="Orçado x realizado">
        {(orcado.data?.length ?? 0) === 0 ? (
          <EmptyState title="Sem orçamento" description="Crie categorias e orçamentos para comparar planejamento e execução." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Categoria</Th>
                <Th>Orçado</Th>
                <Th>Realizado</Th>
                <Th>Diferença</Th>
              </tr>
            </thead>
            <tbody>
              {(orcado.data ?? []).map((item) => (
                <tr key={item.categoria_id}>
                  <Td>{item.categoria}</Td>
                  <Td>{formatMoney(item.valor_orcado)}</Td>
                  <Td>{formatMoney(item.gasto_real)}</Td>
                  <Td>{formatMoney(item.diferenca)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
