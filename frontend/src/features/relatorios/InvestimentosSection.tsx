import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Area, AreaChart, Legend } from "recharts";
import { EmptyState } from "../../components/finance/EmptyState";
import { SectionCard } from "../../components/finance/SectionCard";
import { Td, Th, Table } from "../../components/ui/table";
import { api } from "../../lib/api";
import { formatMoney, formatPercent, toNumber } from "../../lib/formatters";

const axisStyle = { fill: "#8f9bad", fontSize: 11 };
const tooltipStyle = { backgroundColor: "#111821", border: "1px solid #273343", borderRadius: 6, color: "#eef2f7" };

interface InvestimentosSectionProps {
  ano: number;
  mes: number;
}

export function InvestimentosSection({ ano, mes }: InvestimentosSectionProps) {
  const [aporteMensal, setAporteMensal] = useState(2000);
  const [taxaAnual, setTaxaAnual] = useState(10);
  const [periodoProjecao, setPeríodoProjecao] = useState(60); // 5 anos

  // Query para evolução de patrimônio (histórico)
  const historicoPatrimonio = useQuery({
    queryKey: ["investimentos", "desempenho", "historico", "mensal"],
    queryFn: () => api.historicoDesempenhoInvestimentos("mensal"),
  });

  // Query para rentabilidade por tipo de ativo
  const desempenhoAtivos = useQuery({
    queryKey: ["investimentos", "desempenho"],
    queryFn: () => api.desempenhoInvestimentos(),
  });

  // Query para proventos (dividendos)
  const proventos = useQuery({
    queryKey: ["investimentos", "proventos", "mensal"],
    queryFn: () => api.historicoProventosInvestimentos("mensal"),
  });

  // Query para projeção
  const projecao = useQuery({
    queryKey: ["investimentos", "projecao", aporteMensal, taxaAnual, periodoProjecao],
    queryFn: () => api.projecaoPatrimonioInvestimentos(aporteMensal, taxaAnual, periodoProjecao),
  });

  // Preparar dados para gráfico de rentabilidade por tipo
  const rentabilidadeData = desempenhoAtivos.data?.alocacao_por_ativo
    ? desempenhoAtivos.data.alocacao_por_ativo.map((item) => ({
        tipo: item.ticker,
        rentabilidade: toNumber(item.rentabilidade_percentual),
      }))
    : [];

  // Preparar dados para proventos
  const proventosData = (proventos.data?.por_periodo ?? []).map((item) => ({
    mes: item.periodo,
    valor: toNumber(item.total_brl),
  }));

  return (
    <div className="space-y-4">
      {/* Seção 4.1: Evolução de Patrimônio */}
      <SectionCard title="Evolução do patrimônio" description="Histórico de crescimento do seu investimento">
        {(historicoPatrimonio.data?.length ?? 0) === 0 ? (
          <EmptyState title="Sem dados" description="Dados insuficientes para mostrar evolução." />
        ) : (
          <div className="h-80">
            <ResponsiveContainer>
              <LineChart data={historicoPatrimonio.data || []}>
                <CartesianGrid stroke="#273343" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="data"
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                <Legend />
                <Line type="monotone" dataKey="patrimonio_atual_brl" stroke="#16A34A" strokeWidth={2} name="Patrimônio" />
                <Line type="monotone" dataKey="total_aportado_brl" stroke="#2563EB" strokeWidth={2} name="Aportado" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="resultado_brl" stroke="#f59e0b" strokeWidth={2} name="Resultado" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* Seção 4.2: Rentabilidade por Tipo de Ativo */}
      <SectionCard title="Rentabilidade por tipo de ativo" description="Qual tipo está rendendo mais">
        {rentabilidadeData.length === 0 ? (
          <EmptyState title="Sem dados" description="Nenhum ativo registrado ou sem dados de rentabilidade." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={rentabilidadeData}>
                <CartesianGrid stroke="#273343" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="tipo" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => formatPercent(value as number)}
                />
                <Bar dataKey="rentabilidade" fill="#16A34A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* Seção 4.3: Proventos (Dividendos) */}
      <SectionCard title="Dividendos e proventos recebidos" description="Renda gerada pelos seus investimentos">
        {proventosData.length === 0 ? (
          <EmptyState title="Sem proventos" description="Nenhum dividendo ou provento registrado neste período." />
        ) : (
          <div className="space-y-4">
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={proventosData}>
                  <CartesianGrid stroke="#273343" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                  <Area type="monotone" dataKey="valor" fill="#16A34A" stroke="#16A34A" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {(proventos.data?.por_ativo.length ?? 0) > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Ativo</Th>
                      <Th>Classe</Th>
                      <Th>Registros</Th>
                      <Th>Valor</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(proventos.data?.por_ativo ?? []).slice(0, 10).map((provento) => (
                      <tr key={provento.ativo_id}>
                        <Td>{provento.ticker}</Td>
                        <Td>{provento.tipo_label}</Td>
                        <Td>{provento.quantidade}</Td>
                        <Td>{formatMoney(provento.total_brl)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Seção 4.4: Projeção de Patrimônio */}
      <SectionCard title="Projeção de patrimônio futuro" description="Simule seu crescimento com diferentes cenários">
        <div className="space-y-4">
          {/* Controles */}
          <div className="grid gap-4 rounded-md bg-slate-900/50 p-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-slate-400">
                Aporte mensal: R$ {aporteMensal.toLocaleString("pt-BR")}
              </label>
              <input
                type="range"
                min="500"
                max="10000"
                step="100"
                value={aporteMensal}
                onChange={(e) => setAporteMensal(Number(e.target.value))}
                className="w-full"
              />
              <p className="mt-1 text-[10px] text-slate-500">R$ 500 - R$ 10.000</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400">
                Taxa retorno anual: {taxaAnual.toFixed(1)}%
              </label>
              <input
                type="range"
                min="6"
                max="15"
                step="0.1"
                value={taxaAnual}
                onChange={(e) => setTaxaAnual(Number(e.target.value))}
                className="w-full"
              />
              <p className="mt-1 text-[10px] text-slate-500">6% - 15%</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400">
                Período: {(periodoProjecao / 12).toFixed(1)} anos ({periodoProjecao} meses)
              </label>
              <select
                value={periodoProjecao}
                onChange={(e) => setPeríodoProjecao(Number(e.target.value))}
                className="w-full rounded bg-slate-800 px-2 py-1.5 text-xs text-slate-100"
              >
                <option value={36}>3 anos (36 meses)</option>
                <option value={60}>5 anos (60 meses)</option>
                <option value={120}>10 anos (120 meses)</option>
                <option value={240}>20 anos (240 meses)</option>
              </select>
            </div>
          </div>

          {/* Gráfico de projeção */}
          {(projecao.data?.length ?? 0) === 0 ? (
            <EmptyState title="Sem dados" description="Ajuste os parâmetros para gerar projeção." />
          ) : (
            <div className="h-80">
              <ResponsiveContainer>
                <LineChart data={projecao.data || []}>
                  <CartesianGrid stroke="#273343" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tick={axisStyle}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: "Meses", position: "insideBottomRight", offset: -5 }}
                  />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="valor_projetado"
                    stroke="#16A34A"
                    strokeWidth={2}
                    name="Valor Projetado"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Resumo da projeção */}
          {projecao.data && projecao.data.length > 0 && (
            <div className="grid gap-2 rounded-md bg-slate-800/50 p-3 sm:grid-cols-3 text-[11px]">
              <div>
                <p className="text-slate-500">Valor Inicial</p>
                <p className="font-semibold text-slate-100">{formatMoney(0)}</p>
              </div>
              <div>
                <p className="text-slate-500">Aporte Total</p>
                <p className="font-semibold text-slate-100">{formatMoney(projecao.data[projecao.data.length - 1].aporte_acumulado)}</p>
              </div>
              <div>
                <p className="text-slate-500">Valor Final Projetado</p>
                <p className="font-bold text-green-400">{formatMoney(projecao.data[projecao.data.length - 1].valor_projetado)}</p>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
