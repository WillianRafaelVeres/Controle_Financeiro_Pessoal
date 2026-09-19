import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  HeartPulse,
  Lightbulb,
  PiggyBank,
  ReceiptText,
  Scale,
  Target,
  WalletCards,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
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
import { Button } from "../components/ui/button";
import { Td, Th, Table } from "../components/ui/table";
import { PeriodSelector } from "../features/relatorios/PeriodSelector";
import { api } from "../lib/api";
import { formatMoney, formatPercent, toNumber } from "../lib/formatters";
import type { RelatorioAnaliseFinanceira } from "../lib/types";
import { cn } from "../lib/utils";

type PeriodoRelatorio = "mes" | "3meses" | "12meses" | "custom";
type ExpenseView = "categoria" | "subcategoria";
const axisStyle = { fill: "#94a3b8", fontSize: 11 };
const tooltipStyle = { backgroundColor: "#101923", border: "1px solid #334155", borderRadius: 12, color: "#f8fafc" };

function shiftMonth(ano: number, mes: number, amount: number) {
  const index = ano * 12 + mes - 1 + amount;
  return { ano: Math.floor(index / 12), mes: (index % 12) + 1 };
}

function formatPeriod(ano: number, mes: number) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(new Date(ano, mes - 1, 1)).replace(" de ", "/");
}

function compactMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function scoreLabel(level?: RelatorioAnaliseFinanceira["saude_financeira"]["nivel"]) {
  if (level === "SOLIDA") return "Sólida";
  if (level === "EM_EVOLUCAO") return "Em evolução";
  if (level === "ATENCAO") return "Atenção";
  return "Crítica";
}

function InsightIcon({ type }: { type: string }) {
  if (type === "BOM") return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
  if (type === "ATENCAO" || type === "CRITICO") return <AlertTriangle className="h-5 w-5 text-amber-300" />;
  return <Lightbulb className="h-5 w-5 text-blue-400" />;
}

export function RelatoriosPage() {
  const [period, setPeriod] = useState<PeriodoRelatorio>("12meses");
  const [showComparison, setShowComparison] = useState(true);
  const [customDates, setCustomDates] = useState<{ start: Date; end: Date } | null>(null);
  const [expenseView, setExpenseView] = useState<ExpenseView>("categoria");

  const range = useMemo(() => {
    const now = new Date();
    const end = period === "custom" && customDates ? { ano: customDates.end.getFullYear(), mes: customDates.end.getMonth() + 1 } : { ano: now.getFullYear(), mes: now.getMonth() + 1 };
    if (period === "custom" && customDates) return { start: { ano: customDates.start.getFullYear(), mes: customDates.start.getMonth() + 1 }, end };
    const months = period === "12meses" ? 12 : period === "3meses" ? 3 : 1;
    return { start: shiftMonth(end.ano, end.mes, -(months - 1)), end };
  }, [customDates, period]);

  const analysis = useQuery({
    queryKey: ["relatorios", "vida-financeira", range],
    queryFn: () => api.relAnaliseFinanceira(range.start.ano, range.start.mes, range.end.ano, range.end.mes),
    retry: false,
  });
  const data = analysis.data;
  const variations = data?.comparacao.variacoes_percentuais;
  const categories = data?.categorias_gasto ?? [];
  const subcategories = data?.subcategorias_gasto ?? [];
  const expenseRows = expenseView === "categoria"
    ? categories.map((item) => ({ name: item.categoria, detail: `${formatMoney(item.media_mensal)} por mês`, value: toNumber(item.valor), percentage: toNumber(item.percentual) }))
    : subcategories.map((item) => ({ name: item.subcategoria, detail: item.categoria, value: toNumber(item.valor), percentage: toNumber(item.percentual) }));
  const planning = useMemo(() => data ? [
    { label: "Gastos", planned: toNumber(data.planejamento.gastos.planejado), actual: toNumber(data.planejamento.gastos.realizado), favorable: toNumber(data.planejamento.gastos.realizado) <= toNumber(data.planejamento.gastos.planejado) },
    { label: "Investimentos", planned: toNumber(data.planejamento.investimentos.planejado), actual: toNumber(data.planejamento.investimentos.realizado), favorable: toNumber(data.planejamento.investimentos.realizado) >= toNumber(data.planejamento.investimentos.planejado) },
  ] : [], [data]);

  return (
    <div className="space-y-4">
      <PageHeader title="Relatório da vida financeira" description="Receita, padrão de gastos, taxa de investimento e orçamento traduzidos em prioridades para os próximos meses." />

      <SectionCard title="Janela do diagnóstico" description={`De ${formatPeriod(range.start.ano, range.start.mes)} até ${formatPeriod(range.end.ano, range.end.mes)}. Períodos longos mostram hábitos; o mês mostra a execução atual.`} compact>
        <PeriodSelector selectedPeriod={period} onPeriodChange={setPeriod} onDateRangeChange={(start, end) => setCustomDates({ start, end })} showComparison comparisonEnabled={showComparison} onComparisonToggle={setShowComparison} />
      </SectionCard>

      {analysis.isLoading ? (
        <SectionCard title="Construindo seu diagnóstico"><p className="text-sm text-slate-400">Consolidando renda, gastos, investimentos, orçamento e histórico mensal...</p></SectionCard>
      ) : analysis.isError ? (
        <SectionCard title="Não foi possível gerar o relatório"><p className="text-sm text-rose-300">{analysis.error instanceof Error ? analysis.error.message : "Tente novamente em instantes."}</p></SectionCard>
      ) : !data ? null : (
        <>
          <section className={cn("overflow-hidden rounded-2xl border p-5", data.saude_financeira.score >= 80 ? "border-emerald-500/30 bg-emerald-500/10" : data.saude_financeira.score >= 60 ? "border-blue-500/30 bg-blue-500/10" : "border-amber-500/30 bg-amber-500/10")}>
            <div className="grid gap-5 lg:grid-cols-[220px_1fr] lg:items-center">
              <div className="flex items-center gap-4 lg:block lg:text-center">
                <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-[10px] border-slate-800 bg-slate-950/50 lg:mx-auto">
                  <span className="text-3xl font-bold text-slate-50">{data.saude_financeira.score}</span>
                  <span className="absolute -bottom-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-300">de 100</span>
                </div>
                <div className="lg:mt-3"><p className="text-xs uppercase tracking-wide text-slate-400">Saúde financeira</p><p className="text-xl font-bold text-slate-50">{scoreLabel(data.saude_financeira.nivel)}</p></div>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-50">Seu dinheiro está sendo transformado em quê?</h2>
                <p className="mt-1 text-sm text-slate-400">De cada R$ 100 recebidos no período:</p>
                <div className="mt-4 flex h-8 overflow-hidden rounded-full bg-slate-800">
                  <FlowSegment value={data.destino_receita.gastos_percentual} color="bg-orange-500" label="Gastos" />
                  <FlowSegment value={data.destino_receita.investimentos_percentual} color="bg-emerald-500" label="Investimentos" />
                  <FlowSegment value={Math.max(0, data.destino_receita.livre_percentual)} color="bg-blue-500" label="Livre" />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <FlowLegend color="bg-orange-500" label="Gastos" value={data.destino_receita.gastos_percentual} />
                  <FlowLegend color="bg-emerald-500" label="Investimentos" value={data.destino_receita.investimentos_percentual} />
                  <FlowLegend color="bg-blue-500" label="Saldo livre" value={data.destino_receita.livre_percentual} />
                </div>
              </div>
            </div>
          </section>

          <div className="metric-grid">
            <FinancialKPICard title="Renda média mensal" value={data.medias_mensais.receita} trend={showComparison ? variations?.receita ?? undefined : undefined} icon={<CircleDollarSign className="h-4 w-4" />} tone="blue" description="Média recebida por mês" />
            <FinancialKPICard title="Gasto médio mensal" value={data.medias_mensais.gasto} trend={showComparison ? variations?.gasto ?? undefined : undefined} icon={<ReceiptText className="h-4 w-4" />} tone="yellow" description={`${formatPercent(data.taxas.comprometimento_percentual)} da renda`} />
            <FinancialKPICard title="Investimento médio mensal" value={data.medias_mensais.investimento} trend={showComparison ? variations?.investimento ?? undefined : undefined} icon={<PiggyBank className="h-4 w-4" />} tone="green" description={`${formatPercent(data.medias_mensais.investimento_percentual)} em média nos meses com renda`} />
            <FinancialKPICard title="Saldo livre médio" value={data.medias_mensais.saldo_livre} trend={showComparison ? variations?.saldo_livre ?? undefined : undefined} icon={<WalletCards className="h-4 w-4" />} tone={data.medias_mensais.saldo_livre >= 0 ? "green" : "red"} description="Depois de gastos e investimentos" />
            <FinancialKPICard title="Regularidade dos aportes" value={data.consistencia.regularidade_investimento_percentual} isPercentage icon={<Target className="h-4 w-4" />} tone={data.consistencia.regularidade_investimento_percentual >= 75 ? "green" : "yellow"} description={`${data.consistencia.meses_com_investimento} de ${data.periodo.quantidade_meses} meses com investimento`} />
          </div>

          {data.insights.length > 0 && <SectionCard title="Prioridades para agir" description="Leituras produzidas a partir do seu fluxo e do seu orçamento."><div className="grid gap-3 lg:grid-cols-2">{data.insights.map((item, index) => <div key={`${item.titulo}-${index}`} className={cn("flex gap-3 rounded-xl border p-3", item.tipo === "BOM" ? "border-emerald-500/25 bg-emerald-500/10" : item.tipo === "ATENCAO" || item.tipo === "CRITICO" ? "border-amber-500/25 bg-amber-500/10" : "border-blue-500/25 bg-blue-500/10")}><InsightIcon type={item.tipo} /><div><p className="text-sm font-semibold text-slate-100">{item.titulo}</p><p className="mt-1 text-xs leading-5 text-slate-400">{item.mensagem}</p></div></div>)}</div></SectionCard>}

          <SectionCard title="Seu mês financeiro, ao longo do tempo" description="Barras mostram valores mensais; a linha mostra qual percentual da renda foi investido.">
            {!data.evolucao.some((item) => item.receita || item.gasto || item.investimento) ? <EmptyState title="Sem movimentações no período" description="Registre receitas, gastos e investimentos para formar o diagnóstico mensal." /> : (
              <div className="h-[400px]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.evolucao} margin={{ top: 12, right: 16, bottom: 6, left: 0 }}><CartesianGrid stroke="#263446" strokeDasharray="3 3" vertical={false} /><XAxis dataKey={(item) => formatPeriod(item.ano, item.mes)} tick={axisStyle} axisLine={false} tickLine={false} /><YAxis yAxisId="money" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => compactMoney(Number(value))} /><YAxis yAxisId="percent" orientation="right" domain={[0, "auto"]} tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} /><Tooltip contentStyle={tooltipStyle} formatter={(value, name) => name === "Taxa investida" ? [formatPercent(value as number), name] : [formatMoney(value as number), name]} /><Legend /><Bar yAxisId="money" dataKey="receita" name="Receita" fill="#3b82f6" radius={[5, 5, 0, 0]} /><Bar yAxisId="money" dataKey="gasto" name="Gastos" fill="#f97316" radius={[5, 5, 0, 0]} /><Bar yAxisId="money" dataKey="investimento" name="Investimentos" fill="#10b981" radius={[5, 5, 0, 0]} /><Line yAxisId="percent" type="monotone" dataKey="investimento_percentual" name="Taxa investida" stroke="#f8fafc" strokeWidth={2.5} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer></div>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-3"><SummaryBadge icon={<PiggyBank className="h-4 w-4" />} label="Taxa investida no período" value={formatPercent(data.taxas.investimento_percentual)} /><SummaryBadge icon={<Scale className="h-4 w-4" />} label="Meses no azul" value={`${data.consistencia.meses_saldo_positivo} de ${data.consistencia.meses_com_receita}`} /><SummaryBadge icon={<WalletCards className="h-4 w-4" />} label="Saldo livre total" value={formatMoney(data.totais.saldo_livre)} /></div>
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard title="Onde seu dinheiro é mais consumido" description="Veja as categorias e abra o detalhe por subcategoria." action={<div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1"><Button size="sm" variant={expenseView === "categoria" ? "primary" : "ghost"} onClick={() => setExpenseView("categoria")}>Categorias</Button><Button size="sm" variant={expenseView === "subcategoria" ? "primary" : "ghost"} onClick={() => setExpenseView("subcategoria")}>Subcategorias</Button></div>}>
              {!expenseRows.length ? <EmptyState title="Nenhum gasto encontrado" description="Não há gastos na janela selecionada." /> : <div className="space-y-3">{expenseRows.slice(0, 10).map((item, index) => <ExpenseRow key={`${item.name}-${item.detail}`} index={index} {...item} />)}</div>}
            </SectionCard>

            <SectionCard title="Qualidade do hábito financeiro" description="O índice resume comportamento observado; não substitui metas pessoais.">
              <div className="space-y-4">
                <ScoreRow label="Taxa investida" value={data.saude_financeira.componentes.taxa_investimento} detail="Peso 35% · 20% da renda atinge a nota máxima" />
                <ScoreRow label="Orçamento" value={data.saude_financeira.componentes.orcamento} detail="Peso 25% · compara gasto realizado ao limite" />
                <ScoreRow label="Fluxo de caixa" value={data.saude_financeira.componentes.fluxo_caixa} detail="Peso 25% · frequência de meses no azul" />
                <ScoreRow label="Planejamento" value={data.saude_financeira.componentes.planejamento} detail="Peso 15% · reduz gastos fora do plano" />
              </div>
              <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-[11px] leading-5 text-slate-500">{data.saude_financeira.metodologia} A referência de 20% serve como ponto de comparação e deve ser adaptada à sua renda, fase de vida e objetivos.</p>
            </SectionCard>
          </div>

          <SectionCard title="Planejado x realizado" description="Gastar abaixo do limite e investir acima da meta são leituras favoráveis.">
            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={planning} margin={{ top: 12, right: 16, bottom: 6, left: 0 }}><CartesianGrid stroke="#263446" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} /><YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => compactMoney(Number(value))} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} /><Legend /><Bar dataKey="planned" name="Planejado" fill="#64748b" radius={[5, 5, 0, 0]} /><Bar dataKey="actual" name="Realizado" radius={[5, 5, 0, 0]}>{planning.map((item) => <Cell key={item.label} fill={item.favorable ? "#10b981" : "#f59e0b"} />)}</Bar></BarChart></ResponsiveContainer></div>
              <div className="min-w-0 overflow-auto"><Table><thead><tr><Th>Item</Th><Th>Tipo</Th><Th className="text-right">Planejado</Th><Th className="text-right">Realizado</Th><Th className="text-right">Diferença</Th></tr></thead><tbody>{data.diagnostico_orcamento.filter((item) => item.natureza !== "RECEITA").slice(0, 10).map((item) => <tr key={`${item.natureza}-${item.item}`}><Td className="font-medium text-slate-100">{item.item}</Td><Td>{item.natureza === "GASTO" ? "Gasto" : "Investimento"}</Td><Td className="text-right">{formatMoney(item.planejado)}</Td><Td className="text-right">{formatMoney(item.realizado)}</Td><Td className={cn("text-right font-semibold", item.favoravel ? "text-emerald-400" : "text-amber-300")}>{item.desvio === 0 ? "No alvo" : `${formatMoney(Math.abs(item.desvio))} ${item.desvio > 0 ? "acima" : "abaixo"}`}</Td></tr>)}</tbody></Table>{!data.diagnostico_orcamento.length && <EmptyState title="Sem orçamento configurado" description="Crie limites de gasto e metas de investimento para medir a execução." />}</div>
            </div>
          </SectionCard>

          <SectionCard title="Como usar este relatório" description="Uma rotina simples para transformar os números em mudança."><div className="grid gap-3 md:grid-cols-3"><UseStep number="1" title="Proteja a taxa investida" text="Compare a taxa mensal com sua meta e automatize primeiro um valor sustentável." /><UseStep number="2" title="Ataque uma categoria" text="Escolha a maior categoria ajustável. Uma redução pequena e recorrente vale mais que cortes aleatórios." /><UseStep number="3" title="Revise no mesmo intervalo" text="Compare janelas equivalentes. Um único mês pode ser atípico; 3 a 12 meses revelam hábito." /></div></SectionCard>
        </>
      )}
    </div>
  );
}

function FlowSegment({ value, color, label }: { value: number; color: string; label: string }) {
  const width = Math.max(0, Math.min(100, value));
  return <div className={cn("flex items-center justify-center overflow-hidden text-[10px] font-bold text-white", color)} style={{ width: `${width}%` }} title={`${label}: ${formatPercent(value)}`}>{width >= 13 ? `${Math.round(value)}%` : ""}</div>;
}

function FlowLegend({ color, label, value }: { color: string; label: string; value: number }) {
  return <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2"><span className={cn("h-2.5 w-2.5 rounded-full", color)} /><span className="text-xs text-slate-400">{label}</span><span className="ml-auto text-sm font-semibold text-slate-100">{formatPercent(value)}</span></div>;
}

function ExpenseRow({ index, name, detail, value, percentage }: { index: number; name: string; detail: string; value: number; percentage: number }) {
  return <div><div className="mb-1 flex items-center gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-xs font-bold text-orange-300">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><span className="truncate text-sm font-semibold text-slate-100">{name}</span><span className="shrink-0 text-sm font-semibold text-slate-100">{formatMoney(value)}</span></div><div className="flex justify-between gap-3 text-[11px] text-slate-500"><span className="truncate">{detail}</span><span>{formatPercent(percentage)}</span></div></div></div><div className="ml-9 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(100, percentage)}%` }} /></div></div>;
}

function ScoreRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div><div className="flex items-end justify-between"><div><p className="text-sm font-semibold text-slate-200">{label}</p><p className="text-[11px] text-slate-500">{detail}</p></div><span className="text-sm font-bold text-slate-100">{Math.round(value)}/100</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className={cn("h-full rounded-full", value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-blue-500" : "bg-amber-500")} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div></div>;
}

function SummaryBadge({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/30 p-3"><span className="rounded-lg bg-white/5 p-2 text-slate-300">{icon}</span><div><p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p><p className="text-sm font-bold text-slate-100">{value}</p></div></div>;
}

function UseStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-4"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-300">{number}</span><p className="mt-3 text-sm font-semibold text-slate-100">{title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{text}</p></div>;
}
