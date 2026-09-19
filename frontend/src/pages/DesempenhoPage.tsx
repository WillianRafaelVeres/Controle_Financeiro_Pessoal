import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
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
import { Select } from "../components/ui/select";
import { Td, Th, Table } from "../components/ui/table";
import { api } from "../lib/api";
import { formatMoney, formatPercent, toNumber } from "../lib/formatters";
import type {
  BenchmarkResumoItem,
  DesempenhoAlocacaoTipo,
  EscopoDesempenho,
  PeriodoDesempenho,
} from "../lib/types";
import { cn } from "../lib/utils";

const tooltipStyle = { backgroundColor: "#101923", border: "1px solid #334155", borderRadius: 12, color: "#f8fafc" };
const axisStyle = { fill: "#94a3b8", fontSize: 11 };
const BENCHMARKS = [
  { id: "CDI", label: "CDI", color: "#60a5fa" },
  { id: "IBOVESPA", label: "Ibovespa", color: "#f59e0b" },
  { id: "IFIX", label: "IFIX", color: "#a78bfa" },
  { id: "SP500_BRL", label: "S&P 500 em reais", color: "#f472b6" },
] as const;
const SCOPES: Array<{ value: EscopoDesempenho; label: string; benchmarks: string[] }> = [
  { value: "CARTEIRA_TOTAL", label: "Carteira total", benchmarks: ["CDI", "IBOVESPA", "IFIX", "SP500_BRL"] },
  { value: "RENDA_FIXA", label: "Renda fixa", benchmarks: ["CDI"] },
  { value: "ACAO_BR", label: "Ações brasileiras", benchmarks: ["IBOVESPA"] },
  { value: "FII", label: "Fundos imobiliários", benchmarks: ["IFIX"] },
  { value: "ETF_BR", label: "ETFs Brasil", benchmarks: ["IBOVESPA"] },
  { value: "EXTERIOR", label: "Exterior", benchmarks: ["SP500_BRL"] },
  { value: "CRIPTO", label: "Criptomoedas", benchmarks: ["CDI"] },
  { value: "PREVIDENCIA", label: "Previdência", benchmarks: ["CDI"] },
  { value: "OUTRO", label: "Outros", benchmarks: ["CDI"] },
];

type Decision = { tone: "good" | "attention" | "neutral"; title: string; detail: string };

function compactMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function signedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${formatPercent(value)}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return day ? `${day}/${month}/${year}` : value;
}

function DecisionCard({ item }: { item: Decision }) {
  const Icon = item.tone === "good" ? CheckCircle2 : item.tone === "attention" ? AlertTriangle : Sparkles;
  return (
    <div className={cn(
      "flex gap-3 rounded-xl border p-3",
      item.tone === "good" && "border-emerald-500/25 bg-emerald-500/10",
      item.tone === "attention" && "border-amber-500/25 bg-amber-500/10",
      item.tone === "neutral" && "border-blue-500/25 bg-blue-500/10",
    )}>
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", item.tone === "good" ? "text-emerald-400" : item.tone === "attention" ? "text-amber-300" : "text-blue-400")} />
      <div><p className="text-sm font-semibold text-slate-100">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{item.detail}</p></div>
    </div>
  );
}

export function DesempenhoPage() {
  const [scope, setScope] = useState<EscopoDesempenho>("CARTEIRA_TOTAL");
  const [period, setPeriod] = useState<PeriodoDesempenho>("12m");
  const [benchmarks, setBenchmarks] = useState<string[]>(["CDI", "IBOVESPA", "IFIX", "SP500_BRL"]);
  const [includeIncome, setIncludeIncome] = useState(true);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const overview = useQuery({ queryKey: ["desempenho", "overview"], queryFn: api.desempenhoInvestimentos, retry: false });
  const performance = useQuery({
    queryKey: ["desempenho", "decisao", scope, period, benchmarks, includeIncome, customStart, customEnd],
    queryFn: () => api.rentabilidadeComparadaInvestimentos({
      escopo: scope,
      periodo: period,
      benchmarks,
      incluir_proventos: includeIncome,
      data_inicio: period === "personalizado" ? customStart || undefined : undefined,
      data_fim: period === "personalizado" ? customEnd || undefined : undefined,
    }),
    enabled: period !== "personalizado" || Boolean(customStart && customEnd),
    retry: false,
  });
  const income = useQuery({ queryKey: ["desempenho", "proventos"], queryFn: () => api.historicoProventosInvestimentos("mensal"), retry: false });

  const current = overview.data;
  const compared = performance.data;
  const positions = useMemo(
    () => (current?.alocacao_por_ativo ?? []).filter((item) => item.finalidade !== "GUARDADO"),
    [current?.alocacao_por_ativo],
  );
  const allocations = useMemo<DesempenhoAlocacaoTipo[]>(() => {
    const total = positions.reduce((sum, item) => sum + toNumber(item.valor_atual_brl), 0);
    const grouped = new Map<string, DesempenhoAlocacaoTipo>();
    positions.forEach((item) => {
      const existing = grouped.get(item.tipo_ativo) ?? {
        tipo_ativo: item.tipo_ativo,
        tipo_label: item.tipo_label,
        valor_atual_brl: 0,
        percentual: 0,
        quantidade_posicoes: 0,
      };
      existing.valor_atual_brl = toNumber(existing.valor_atual_brl) + toNumber(item.valor_atual_brl);
      existing.quantidade_posicoes += 1;
      grouped.set(item.tipo_ativo, existing);
    });
    return [...grouped.values()]
      .map((item) => ({ ...item, percentual: total > 0 ? toNumber(item.valor_atual_brl) / total * 100 : 0 }))
      .sort((left, right) => toNumber(right.valor_atual_brl) - toNumber(left.valor_atual_brl));
  }, [positions]);
  const scopeConfig = SCOPES.find((item) => item.value === scope) ?? SCOPES[0];
  const benchmarkRows = benchmarks.map((code) => ({ code, item: compared?.resumo.benchmarks[code] })).filter((row) => row.item);
  const primaryBenchmark = benchmarkRows.find((row) => row.item?.rentabilidade_percentual != null);

  const decisions = useMemo<Decision[]>(() => {
    if (!current) return [];
    const result: Decision[] = [];
    const benchmark = primaryBenchmark?.item;
    if (benchmark?.diferenca_pp != null) {
      result.push({
        tone: benchmark.diferenca_pp >= 0 ? "good" : "attention",
        title: benchmark.diferenca_pp >= 0 ? `Carteira acima de ${benchmark.label}` : `Carteira abaixo de ${benchmark.label}`,
        detail: `${Math.abs(benchmark.diferenca_pp).toFixed(2).replace(".", ",")} ponto(s) percentual(is) de diferença no mesmo período, sem confundir aportes com rentabilidade.`,
      });
    }
    const topAsset = positions[0];
    if (topAsset && toNumber(topAsset.percentual) >= 30) result.push({ tone: "attention", title: `Concentração em ${topAsset.ticker}`, detail: `${formatPercent(topAsset.percentual)} da carteira está em um único ativo. Avalie se esse peso ainda combina com seu risco e objetivo.` });
    const topClass = allocations[0];
    if (topClass && toNumber(topClass.percentual) >= 50) result.push({ tone: "attention", title: `${topClass.tipo_label} domina a carteira`, detail: `A classe representa ${formatPercent(topClass.percentual)} do patrimônio investido. Compare esse peso com sua estratégia antes do próximo aporte.` });
    const drawdown = compared?.resumo.drawdown_atual_percentual ?? 0;
    if (drawdown < 0) result.push({ tone: drawdown <= -10 ? "attention" : "neutral", title: "Carteira abaixo do pico", detail: `O retorno acumulado está ${formatPercent(drawdown)} abaixo do melhor ponto da janela. Use o contexto de longo prazo antes de reagir.` });
    else if (compared?.serie.length) result.push({ tone: "good", title: "Carteira no maior nível da janela", detail: `O retorno acumulado de ${signedPercent(compared.resumo.carteira_percentual)} está no pico do período analisado.` });
    if (!result.length && compared?.serie.length) result.push({ tone: "neutral", title: "Carteira sem alerta dominante", detail: "Use a alocação e os benchmarks abaixo para decidir onde direcionar o próximo aporte." });
    return result.slice(0, 4);
  }, [allocations, compared, current, positions, primaryBenchmark]);

  const toggleBenchmark = (code: string) => setBenchmarks((codes) => codes.includes(code) ? codes.filter((item) => item !== code) : [...codes, code]);
  const changeScope = (next: EscopoDesempenho) => {
    const config = SCOPES.find((item) => item.value === next);
    setScope(next);
    if (config) setBenchmarks(config.benchmarks);
  };
  const refresh = () => { void overview.refetch(); void performance.refetch(); void income.refetch(); };
  const loading = overview.isLoading || performance.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Desempenho dos investimentos"
        description="Retorno, risco, concentração e renda da carteira em uma única leitura para orientar o próximo aporte."
        actions={<Button size="sm" variant="secondary" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" />Atualizar dados</Button>}
      />

      <SectionCard title="O que analisar" description="Escolha uma parte da carteira, a janela e os referenciais adequados. Aportes e resgates não viram lucro.">
        <div className="grid gap-3 lg:grid-cols-[220px_180px_1fr_auto] lg:items-end">
          <label className="space-y-1"><span className="text-xs font-medium text-slate-400">Parte da carteira</span><Select value={scope} onChange={(event) => changeScope(event.target.value as EscopoDesempenho)}>{SCOPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></label>
          <label className="space-y-1"><span className="text-xs font-medium text-slate-400">Período</span><Select value={period} onChange={(event) => setPeriod(event.target.value as PeriodoDesempenho)}><option value="ano_atual">Ano atual</option><option value="12m">Últimos 12 meses</option><option value="24m">Últimos 24 meses</option><option value="36m">Últimos 36 meses</option><option value="desde_inicio">Desde o início</option><option value="personalizado">Personalizado</option></Select></label>
          <div><span className="text-xs font-medium text-slate-400">Benchmarks</span><div className="mt-1 flex flex-wrap gap-2">{BENCHMARKS.map((item) => <button key={item.id} type="button" onClick={() => toggleBenchmark(item.id)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition", benchmarks.includes(item.id) ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200")}>{item.label}</button>)}</div></div>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-3 text-xs text-slate-300"><input type="checkbox" checked={includeIncome} onChange={(event) => setIncludeIncome(event.target.checked)} />Somar proventos ao retorno</label>
        </div>
        {period === "personalizado" && <div className="mt-3 flex flex-wrap gap-3"><label className="space-y-1"><span className="block text-xs text-slate-400">Início</span><input className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label className="space-y-1"><span className="block text-xs text-slate-400">Fim</span><input className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></div>}
      </SectionCard>

      {overview.isError ? (
        <SectionCard title="Não foi possível carregar sua carteira"><p className="text-sm text-rose-300">{overview.error instanceof Error ? overview.error.message : "Verifique a conexão com o servidor e tente atualizar."}</p></SectionCard>
      ) : !loading && toNumber(current?.patrimonio_atual_brl) <= 0 && !positions.length ? (
        <EmptyState icon={<Wallet className="h-6 w-6" />} title="Ainda não há uma carteira para analisar" description="Registre um investimento e sua cotação atual. Esta tela separará aporte, retorno, proventos e risco automaticamente." />
      ) : (
        <>
          <div className="metric-grid">
            <FinancialKPICard title="Patrimônio investido" value={current?.patrimonio_atual_brl ?? 0} icon={<Wallet className="h-4 w-4" />} tone="blue" description={`${positions.length} posição(ões) em carteira`} />
            <FinancialKPICard title={`Retorno · ${scopeConfig.label}`} value={compared?.resumo.carteira_percentual ?? 0} isPercentage icon={<TrendingUp className="h-4 w-4" />} tone={(compared?.resumo.carteira_percentual ?? 0) >= 0 ? "green" : "red"} description={`${formatDate(compared?.data_inicio_efetiva)} a ${formatDate(compared?.data_fim)}`} />
            <FinancialKPICard title="Resultado no período" value={compared?.resumo.resultado_brl ?? 0} icon={<CircleDollarSign className="h-4 w-4" />} tone={(compared?.resumo.resultado_brl ?? 0) >= 0 ? "green" : "red"} description="Variação patrimonial sem aportes líquidos" />
            <FinancialKPICard title="Proventos no período" value={compared?.resumo.proventos_brl ?? 0} icon={<Sparkles className="h-4 w-4" />} tone="yellow" description={includeIncome ? "Incluídos no retorno" : "Exibidos, mas fora do retorno"} />
            <FinancialKPICard title="Maior queda" value={compared?.resumo.max_drawdown_percentual ?? 0} isPercentage icon={<ShieldCheck className="h-4 w-4" />} tone={(compared?.resumo.max_drawdown_percentual ?? 0) <= -15 ? "red" : "yellow"} description="Queda do pico ao vale na janela" />
          </div>

          {performance.isError && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">A carteira atual carregou, mas a comparação histórica falhou: {performance.error instanceof Error ? performance.error.message : "erro desconhecido"}.</div>}

          {decisions.length > 0 && <SectionCard title="Leitura para decidir" description="Os sinais de maior impacto agora — não são recomendações de compra ou venda."><div className="grid gap-3 lg:grid-cols-2">{decisions.map((item) => <DecisionCard key={item.title} item={item} />)}</div></SectionCard>}

          <SectionCard title="Carteira x referências" description="Crescimento acumulado no mesmo período. O retorno da carteira neutraliza aportes e retiradas pelo Modified Dietz mensal encadeado.">
            {!compared?.serie.length ? <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Sem histórico suficiente" description={compared?.cobertura.avisos[0] ?? "Registre movimentações e cotações para formar a série histórica."} /> : (
              <>
                <div className="h-[390px]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={compared.serie} margin={{ top: 16, right: 18, bottom: 4, left: 0 }}><CartesianGrid stroke="#263446" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="periodo" tick={axisStyle} axisLine={false} tickLine={false} /><YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} /><Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatPercent(value as number), name === "carteira" ? "Sua carteira" : String(name)]} /><Legend /><Area type="monotone" dataKey="carteira" name="Sua carteira" stroke="#34d399" fill="#10b981" fillOpacity={0.13} strokeWidth={3} dot={false} />{benchmarks.map((code) => { const config = BENCHMARKS.find((item) => item.id === code); const status = compared.resumo.benchmarks[code]; if (status?.disponivel === false) return null; return <Line key={code} type="monotone" dataKey={code} name={status?.label ?? config?.label ?? code} stroke={config?.color ?? "#94a3b8"} strokeWidth={1.8} strokeDasharray="6 4" dot={false} />; })}</ComposedChart></ResponsiveContainer></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><SmallMetric label="Retorno anualizado" value={formatPercent(compared.resumo.rentabilidade_anualizada_percentual)} /><SmallMetric label="Volatilidade anual" value={formatPercent(compared.resumo.volatilidade_anualizada_percentual)} /><SmallMetric label="Meses positivos" value={`${compared.resumo.meses_positivos ?? 0} de ${compared.resumo.meses_analisados ?? 0}`} /><SmallMetric label="Melhor mês" value={compared.resumo.melhor_mes ? `${compared.resumo.melhor_mes.periodo} · ${signedPercent(compared.resumo.melhor_mes.rentabilidade_percentual)}` : "—"} /><SmallMetric label="Pior mês" value={compared.resumo.pior_mes ? `${compared.resumo.pior_mes.periodo} · ${signedPercent(compared.resumo.pior_mes.rentabilidade_percentual)}` : "—"} /></div>
                {benchmarkRows.length > 0 && <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{benchmarkRows.map(({ code, item }) => <BenchmarkComparison key={code} portfolio={compared.resumo.carteira_percentual} item={item as BenchmarkResumoItem} />)}</div>}
              </>
            )}
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <SectionCard title="Alocação atual" description="Onde o patrimônio está concentrado hoje."><div className="space-y-3">{allocations.map((item) => <AllocationRow key={item.tipo_ativo} item={item} />)}{!allocations.length && <p className="text-sm text-slate-500">Sem alocação disponível.</p>}</div>{toNumber(current?.guardado_total_brl) > 0 && <p className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-200">Dinheiro guardado fora da carteira de crescimento: <strong>{formatMoney(current?.guardado_total_brl)}</strong>. Ele aparece separado para não diluir a rentabilidade dos investimentos.</p>}</SectionCard>
            <SectionCard title="Renda gerada pela carteira" description="Proventos mensais ajudam a medir geração de caixa, mas não substituem a análise de retorno total.">{!income.data?.por_periodo.length ? <EmptyState title="Nenhum provento registrado" description="Dividendos, JCP, rendimentos e juros aparecerão aqui quando forem registrados." /> : <div className="h-[320px]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={income.data.por_periodo.slice(-18)} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}><CartesianGrid stroke="#263446" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="periodo" tick={axisStyle} axisLine={false} tickLine={false} /><YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(value) => compactMoney(Number(value))} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatMoney(value as number), "Proventos"]} /><Bar dataKey="total_brl" name="Proventos" fill="#f59e0b" radius={[6, 6, 0, 0]} /></ComposedChart></ResponsiveContainer></div>}</SectionCard>
          </div>

          <SectionCard title="Posições que explicam o resultado" description="Ordenadas por valor atual. Compare peso, custo, resultado e atualização da cotação.">
            <Table><thead><tr><Th>Ativo</Th><Th>Classe</Th><Th className="text-right">Peso</Th><Th className="text-right">Atual</Th><Th className="text-right">Aportado</Th><Th className="text-right">Resultado total</Th><Th className="text-right">Retorno total</Th></tr></thead><tbody>{positions.map((item) => { const totalResult = toNumber(item.resultado_com_dividendos_brl ?? item.resultado_brl); const totalReturn = toNumber(item.rentabilidade_com_dividendos_percentual ?? item.rentabilidade_percentual); return <tr key={item.ativo_id}><Td><div className="font-semibold text-slate-100">{item.ticker}</div><div className="max-w-[220px] truncate text-[11px] text-slate-500">{item.nome}{item.data_cotacao ? ` · cotação ${formatDate(item.data_cotacao)}` : ""}</div></Td><Td>{item.tipo_label}</Td><Td className="text-right font-medium">{formatPercent(item.percentual)}</Td><Td className="text-right">{formatMoney(item.valor_atual_brl)}</Td><Td className="text-right">{formatMoney(item.total_aportado_brl)}</Td><Td className={cn("text-right font-semibold", totalResult >= 0 ? "text-emerald-400" : "text-rose-400")}>{formatMoney(totalResult)}</Td><Td className={cn("text-right font-semibold", totalReturn >= 0 ? "text-emerald-400" : "text-rose-400")}>{signedPercent(totalReturn)}</Td></tr>; })}</tbody></Table>
          </SectionCard>

          <SectionCard title="Como ler estes números" description="Transparência metodológica para não tomar decisão com um indicador enganoso."><div className="grid gap-3 text-xs leading-5 text-slate-400 md:grid-cols-3"><MethodItem icon={<Target className="h-4 w-4" />} title="Retorno comparável" text="Aportes e retiradas são ponderados pela data e neutralizados. Assim, depositar dinheiro não cria uma falsa rentabilidade." /><MethodItem icon={<Gauge className="h-4 w-4" />} title="Risco observado" text="Drawdown mostra a queda desde um pico; volatilidade mostra a oscilação dos retornos mensais. Ambos dependem do histórico disponível." /><MethodItem icon={<Layers3 className="h-4 w-4" />} title="Benchmark com contexto" text="CDI é referência para renda fixa; Ibovespa para ações brasileiras; IFIX para FIIs; S&P 500 em reais para exterior." /></div></SectionCard>
        </>
      )}
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-100">{value}</p></div>;
}

function BenchmarkComparison({ portfolio, item }: { portfolio: number; item: BenchmarkResumoItem }) {
  if (item.disponivel === false || item.rentabilidade_percentual == null) return <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><p className="text-xs font-semibold text-slate-300">{item.label}</p><p className="mt-1 text-[11px] text-amber-300">{item.erro ?? "Indisponível"}</p></div>;
  const delta = portfolio - item.rentabilidade_percentual;
  const Icon = delta >= 0 ? ArrowUpRight : ArrowDownRight;
  return <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-300">{item.label}</p><Icon className={cn("h-4 w-4", delta >= 0 ? "text-emerald-400" : "text-rose-400")} /></div><p className="mt-1 text-lg font-bold text-slate-100">{signedPercent(item.rentabilidade_percentual)}</p><p className={cn("text-[11px]", delta >= 0 ? "text-emerald-400" : "text-rose-400")}>{delta >= 0 ? "+" : ""}{delta.toFixed(2).replace(".", ",")} p.p. da carteira</p></div>;
}

function AllocationRow({ item }: { item: DesempenhoAlocacaoTipo }) {
  const percentage = Math.max(0, Math.min(100, toNumber(item.percentual)));
  return <div><div className="mb-1 flex items-center justify-between gap-3 text-xs"><div><span className="font-semibold text-slate-200">{item.tipo_label}</span><span className="ml-2 text-slate-500">{item.quantidade_posicoes} posição(ões)</span></div><div className="text-right"><span className="font-semibold text-slate-100">{formatMoney(item.valor_atual_brl)}</span><span className="ml-2 text-slate-500">{formatPercent(item.percentual)}</span></div></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className={cn("h-full rounded-full", percentage >= 50 ? "bg-amber-400" : "bg-emerald-500")} style={{ width: `${percentage}%` }} /></div></div>;
}

function MethodItem({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3"><div className="flex items-center gap-2 font-semibold text-slate-200">{icon}{title}</div><p className="mt-1">{text}</p></div>;
}
