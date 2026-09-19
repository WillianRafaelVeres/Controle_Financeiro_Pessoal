import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Lightbulb,
  PiggyBank,
  ReceiptText,
  TrendingUp,
  WalletCards,
} from "lucide-react";
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

import { EmptyState } from "../components/finance/EmptyState";
import { FinancialKPICard } from "../components/finance/FinancialKPICard";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Td, Th, Table } from "../components/ui/table";
import { PeriodSelector } from "../features/relatorios/PeriodSelector";
import { api } from "../lib/api";
import { formatMoney, formatPercent, toNumber } from "../lib/formatters";

type PeriodoRelatorio = "mes" | "3meses" | "12meses" | "custom";

const axisStyle = { fill: "#8f9bad", fontSize: 11 };
const tooltipStyle = { backgroundColor: "#111821", border: "1px solid #273343", borderRadius: 8, color: "#eef2f7" };

function shiftMonth(ano: number, mes: number, amount: number) {
  const index = ano * 12 + mes - 1 + amount;
  return { ano: Math.floor(index / 12), mes: (index % 12) + 1 };
}

function formatPeriod(ano: number, mes: number) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" })
    .format(new Date(ano, mes - 1, 1))
    .replace(" de ", "/");
}

function trendDescription(value: number | null | undefined, positiveIsGood = true) {
  if (value == null) return "Sem base no período anterior";
  if (value === 0) return "Sem alteração contra o período anterior";
  const direction = value > 0 ? "a mais" : "a menos";
  const favorable = positiveIsGood ? value > 0 : value < 0;
  return `${Math.abs(value).toFixed(1).replace(".", ",")}% ${direction} que antes${favorable ? " · favorável" : " · atenção"}`;
}

function InsightIcon({ tipo }: { tipo: string }) {
  if (tipo === "BOM") return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
  if (tipo === "ATENCAO" || tipo === "CRITICO") return <AlertTriangle className="h-5 w-5 text-amber-400" />;
  return <Lightbulb className="h-5 w-5 text-blue-400" />;
}

export function RelatoriosPage() {
  const [period, setPeriod] = useState<PeriodoRelatorio>("mes");
  const [showComparison, setShowComparison] = useState(true);
  const [customDates, setCustomDates] = useState<{ start: Date; end: Date } | null>(null);

  const range = useMemo(() => {
    const now = new Date();
    const end = period === "custom" && customDates
      ? { ano: customDates.end.getFullYear(), mes: customDates.end.getMonth() + 1 }
      : { ano: now.getFullYear(), mes: now.getMonth() + 1 };
    if (period === "custom" && customDates) {
      return {
        start: { ano: customDates.start.getFullYear(), mes: customDates.start.getMonth() + 1 },
        end,
      };
    }
    const months = period === "12meses" ? 12 : period === "3meses" ? 3 : 1;
    return { start: shiftMonth(end.ano, end.mes, -(months - 1)), end };
  }, [customDates, period]);

  const analise = useQuery({
    queryKey: ["relatorios", "analise-financeira", range],
    queryFn: () => api.relAnaliseFinanceira(range.start.ano, range.start.mes, range.end.ano, range.end.mes),
  });

  const data = analise.data;
  const variacoes = data?.comparacao.variacoes_percentuais;
  const comparisonSuffix = showComparison ? "" : "Comparação desativada";
  const planejamentoData = useMemo(() => {
    if (!data) return [];
    return [
      { grupo: "Receitas", planejado: toNumber(data.planejamento.receitas.planejado), realizado: toNumber(data.planejamento.receitas.realizado), tipo: "RECEITA" },
      { grupo: "Gastos", planejado: toNumber(data.planejamento.gastos.planejado), realizado: toNumber(data.planejamento.gastos.realizado), tipo: "GASTO" },
      { grupo: "Investimentos", planejado: toNumber(data.planejamento.investimentos.planejado), realizado: toNumber(data.planejamento.investimentos.realizado), tipo: "INVESTIMENTO" },
    ];
  }, [data]);
  const categorias = (data?.categorias_gasto ?? []).slice(0, 8);
  const diagnosticos = (data?.diagnostico_orcamento ?? []).filter((item) => item.natureza !== "RECEITA").slice(0, 12);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Relatórios"
        description="Diagnóstico da sua vida financeira: fluxo de caixa, orçamento, gastos e capacidade de investir."
      />

      <SectionCard
        title="Janela de análise"
        description={`De ${formatPeriod(range.start.ano, range.start.mes)} até ${formatPeriod(range.end.ano, range.end.mes)}.`}
        compact
      >
        <PeriodSelector
          selectedPeriod={period}
          onPeriodChange={setPeriod}
          onDateRangeChange={(start, end) => setCustomDates({ start, end })}
          showComparison
          onComparisonToggle={setShowComparison}
          comparisonEnabled={showComparison}
        />
      </SectionCard>

      {analise.isLoading ? (
        <SectionCard title="Preparando diagnóstico">
          <p className="text-sm text-slate-400">Consolidando lançamentos, orçamento e comparação do período...</p>
        </SectionCard>
      ) : analise.isError ? (
        <SectionCard title="Não foi possível montar o relatório">
          <p className="text-sm text-rose-300">{analise.error instanceof Error ? analise.error.message : "Tente novamente em instantes."}</p>
        </SectionCard>
      ) : (
        <>
          <div className="metric-grid">
            <FinancialKPICard
              title="Receitas"
              value={data?.totais.receita ?? 0}
              trend={showComparison ? variacoes?.receita ?? undefined : undefined}
              icon={<CircleDollarSign className="h-4 w-4" />}
              tone="blue"
              description={showComparison ? trendDescription(variacoes?.receita, true) : comparisonSuffix}
            />
            <FinancialKPICard
              title="Gastos"
              value={data?.totais.gasto ?? 0}
              icon={<ReceiptText className="h-4 w-4" />}
              tone={(variacoes?.gasto ?? 0) > 0 ? "red" : "green"}
              description={showComparison ? trendDescription(variacoes?.gasto, false) : comparisonSuffix}
            />
            <FinancialKPICard
              title="Investimentos"
              value={data?.totais.investimento ?? 0}
              trend={showComparison ? variacoes?.investimento ?? undefined : undefined}
              icon={<PiggyBank className="h-4 w-4" />}
              tone="green"
              description={`${formatPercent(data?.taxas.investimento_percentual ?? 0)} da receita do período`}
            />
            <FinancialKPICard
              title="Saldo livre"
              value={data?.totais.saldo_livre ?? 0}
              trend={showComparison ? variacoes?.saldo_livre ?? undefined : undefined}
              icon={<WalletCards className="h-4 w-4" />}
              tone={(data?.totais.saldo_livre ?? 0) >= 0 ? "green" : "red"}
              description="Receitas menos gastos e investimentos"
            />
            <FinancialKPICard
              title="Taxa de economia"
              value={data?.taxas.economia_percentual ?? 0}
              isPercentage
              icon={<TrendingUp className="h-4 w-4" />}
              tone={(data?.taxas.economia_percentual ?? 0) >= 20 ? "green" : (data?.taxas.economia_percentual ?? 0) >= 10 ? "yellow" : "red"}
              description="Parcela da receita não consumida por gastos"
            />
          </div>

          {(data?.insights.length ?? 0) > 0 && (
            <SectionCard title="Leitura do período" description="Os pontos com maior impacto para decidir o próximo ajuste.">
              <div className="grid gap-2 lg:grid-cols-2">
                {data?.insights.map((insight, index) => (
                  <div
                    key={`${insight.titulo}-${index}`}
                    className={`flex gap-3 rounded-xl border p-3 ${
                      insight.tipo === "BOM"
                        ? "border-emerald-500/25 bg-emerald-500/10"
                        : insight.tipo === "ATENCAO" || insight.tipo === "CRITICO"
                          ? "border-amber-500/25 bg-amber-500/10"
                          : "border-blue-500/25 bg-blue-500/10"
                    }`}
                  >
                    <InsightIcon tipo={insight.tipo} />
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{insight.titulo}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{insight.mensagem}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Fluxo financeiro" description="Receitas, gastos e investimentos permanecem separados para mostrar onde o dinheiro foi usado.">
            {(data?.evolucao.length ?? 0) === 0 ? (
              <EmptyState title="Sem movimentações" description="Registre lançamentos para acompanhar a evolução financeira." />
            ) : (
              <div className="h-[340px]">
                <ResponsiveContainer>
                  <ComposedChart data={data?.evolucao ?? []} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="#273343" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey={(item) => formatPeriod(item.ano, item.mes)} tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(value as number)} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                    <Legend />
                    <Bar dataKey="receita" name="Receitas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="gasto" name="Gastos" fill="#f97316" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="investimento" name="Investimentos" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Line dataKey="saldo" name="Saldo livre" stroke="#e2e8f0" strokeWidth={2.5} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          <div className="grid gap-3 xl:grid-cols-2">
            <SectionCard title="Planejado x realizado" description="Investir acima da meta é positivo; gastar acima do limite pede atenção.">
              <div className="h-[300px]">
                <ResponsiveContainer>
                  <BarChart data={planejamentoData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="#273343" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="grupo" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(value as number)} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                    <Legend />
                    <Bar dataKey="planejado" name="Planejado" fill="#64748b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="realizado" name="Realizado" radius={[4, 4, 0, 0]}>
                      {planejamentoData.map((item) => {
                        const favorable = item.tipo === "GASTO" ? item.realizado <= item.planejado : item.realizado >= item.planejado;
                        return <Cell key={item.grupo} fill={favorable ? "#10b981" : "#f59e0b"} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <MiniMetric label="Gastos fora do plano" value={data?.planejamento.gastos.nao_planejado ?? 0} tone="warning" />
                <MiniMetric label="Taxa investida" value={data?.taxas.investimento_percentual ?? 0} percentage tone="good" />
                <MiniMetric label="Receita comprometida" value={data?.taxas.comprometimento_percentual ?? 0} percentage tone={(data?.taxas.comprometimento_percentual ?? 0) > 80 ? "warning" : "neutral"} />
              </div>
            </SectionCard>

            <SectionCard title="Onde você mais gastou" description="Participação de cada categoria nos gastos do período.">
              {categorias.length === 0 ? (
                <EmptyState title="Sem gastos" description="Nenhum gasto encontrado na janela selecionada." />
              ) : (
                <div className="h-[360px]">
                  <ResponsiveContainer>
                    <BarChart data={categorias} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 12 }}>
                      <CartesianGrid stroke="#273343" strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(value as number)} />
                      <YAxis type="category" dataKey="categoria" width={130} tick={axisStyle} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value, _name, item) => [`${formatMoney(value as number)} (${toNumber(item.payload.percentual).toFixed(1)}%)`, "Gasto"]} />
                      <Bar dataKey="valor" name="Gasto" fill="#f97316" radius={[0, 5, 5, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Ajustes sugeridos no orçamento" description="Itens com maior diferença entre o que foi planejado e o que realmente aconteceu.">
            {diagnosticos.length === 0 ? (
              <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Sem itens planejados" description="Crie um planejamento mensal para receber recomendações específicas." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th>Tipo</Th>
                    <Th className="text-right">Planejado</Th>
                    <Th className="text-right">Realizado</Th>
                    <Th className="text-right">Leitura</Th>
                  </tr>
                </thead>
                <tbody>
                  {diagnosticos.map((item) => (
                    <tr key={`${item.natureza}-${item.item}`}>
                      <Td className="font-medium text-slate-100">{item.item}</Td>
                      <Td>{item.natureza === "GASTO" ? "Gasto" : "Investimento"}</Td>
                      <Td className="text-right">{formatMoney(item.planejado)}</Td>
                      <Td className="text-right">{formatMoney(item.realizado)}</Td>
                      <Td className={`text-right font-semibold ${item.favoravel ? "text-emerald-400" : "text-amber-300"}`}>
                        {item.desvio === 0
                          ? "No alvo"
                          : `${formatMoney(Math.abs(item.desvio))} ${item.desvio > 0 ? "acima" : "abaixo"}`}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  percentage = false,
  tone,
}: {
  label: string;
  value: number;
  percentage?: boolean;
  tone: "good" | "warning" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
      <p className="text-[11px] font-medium uppercase text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-semibold ${tone === "good" ? "text-emerald-400" : tone === "warning" ? "text-amber-300" : "text-slate-100"}`}>
        {percentage ? formatPercent(value) : formatMoney(value)}
      </p>
    </div>
  );
}
