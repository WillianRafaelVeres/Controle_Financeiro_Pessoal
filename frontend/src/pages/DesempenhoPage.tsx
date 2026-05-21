import { useQuery } from "@tanstack/react-query";
import { BarChart3, CircleDollarSign, LineChart, PieChart as PieChartIcon, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip } from "recharts";

import { EmptyState } from "../components/finance/EmptyState";
import { MoneyCard } from "../components/finance/MoneyCard";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/badge";
import { Td, Th, Table } from "../components/ui/table";
import { api } from "../lib/api";
import { formatMoney, formatPercent, toNumber } from "../lib/formatters";
import { cn } from "../lib/utils";
import type { DesempenhoAtivo, DesempenhoBenchmark, TipoAtivo } from "../lib/types";

const TYPE_COLORS: Partial<Record<TipoAtivo, { bar: string; text: string; bg: string }>> = {
  ACAO_BR: { bar: "bg-blue-500", text: "text-blue-300", bg: "bg-blue-500/10" },
  FII: { bar: "bg-brand-500", text: "text-brand-400", bg: "bg-brand-500/10" },
  ETF_BR: { bar: "bg-cyan-500", text: "text-cyan-300", bg: "bg-cyan-500/10" },
  EXTERIOR: { bar: "bg-amber-500", text: "text-amber-300", bg: "bg-amber-500/10" },
  CRIPTO: { bar: "bg-yellow-500", text: "text-yellow-300", bg: "bg-yellow-500/10" },
  RENDA_FIXA: { bar: "bg-emerald-500", text: "text-emerald-300", bg: "bg-emerald-500/10" },
  PREVIDENCIA: { bar: "bg-purple-500", text: "text-purple-300", bg: "bg-purple-500/10" },
};

const PIE_COLORS: Partial<Record<TipoAtivo, string>> = {
  ACAO_BR: "#3B82F6",
  FII: "#16A34A",
  ETF_BR: "#06B6D4",
  EXTERIOR: "#F59E0B",
  CRIPTO: "#EAB308",
  RENDA_FIXA: "#10B981",
  PREVIDENCIA: "#A855F7",
  OUTRO: "#94A3B8",
};

const tooltipStyle = { backgroundColor: "#111821", border: "1px solid #273343", borderRadius: 6, color: "#eef2f7" };

function displayDate(value?: string | null) {
  if (!value) return "-";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function benchmarkValue(kind: "dolar" | "ibovespa" | "cdi", item?: DesempenhoBenchmark) {
  const value = toNumber(item?.valor);
  if (!value) return "-";
  if (kind === "dolar") return formatMoney(value);
  if (kind === "cdi") return formatPercent(value);
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function BenchmarkCard({
  title,
  kind,
  item,
}: {
  title: string;
  kind: "dolar" | "ibovespa" | "cdi";
  item?: DesempenhoBenchmark;
}) {
  const variation = toNumber(item?.variacao_percentual);
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/35 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase text-slate-500">{title}</p>
          <p className="mt-1 text-lg font-semibold text-slate-100">{benchmarkValue(kind, item)}</p>
        </div>
        <Badge tone={item?.erro ? "yellow" : "blue"}>{item?.fonte || "Fonte"}</Badge>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>{item?.erro || `Atualizado em ${displayDate(item?.data)}`}</span>
        {item?.variacao_percentual !== null && item?.variacao_percentual !== undefined && (
          <span className={variation < 0 ? "font-medium text-danger-600" : "font-medium text-brand-400"}>{formatPercent(variation)}</span>
        )}
      </div>
    </div>
  );
}

function RankingTable({ title, icon, rows }: { title: string; icon: ReactNode; rows: DesempenhoAtivo[] }) {
  return (
    <SectionCard title={title} action={<div className="text-slate-500">{icon}</div>}>
      {rows.length === 0 ? (
        <EmptyState title="Sem dados para exibir" description="Os rankings aparecem quando houver posicoes com cotacao." />
      ) : (
        <Table className="min-w-[720px]">
          <thead>
            <tr>
              <Th>Ativo</Th>
              <Th>Tipo</Th>
              <Th className="text-right">Valor atual</Th>
              <Th className="text-right">Resultado</Th>
              <Th className="text-right">Rentab.</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.ativo_id}>
                <Td>
                  <div className="font-semibold text-slate-100">{item.ticker}</div>
                  <div className="text-[11px] text-slate-500">{item.corretora || item.nome}</div>
                </Td>
                <Td>
                  <Badge tone="neutral">{item.tipo_label}</Badge>
                </Td>
                <Td className="text-right font-semibold text-slate-100">{formatMoney(item.valor_atual_brl)}</Td>
                <Td className={cn("text-right font-medium", toNumber(item.resultado_brl) < 0 ? "text-danger-600" : "text-brand-400")}>
                  {formatMoney(item.resultado_brl)}
                </Td>
                <Td className="text-right">{formatPercent(item.rentabilidade_percentual)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </SectionCard>
  );
}

export function DesempenhoPage() {
  const desempenho = useQuery({
    queryKey: ["investimentos", "desempenho"],
    queryFn: api.desempenhoInvestimentos,
    refetchInterval: 60_000,
    retry: false,
  });
  const data = desempenho.data;
  const lucro = toNumber(data?.lucro_prejuizo_brl);
  const resultadoLabel = lucro < 0 ? "Prejuizo" : "Lucro";
  const alocacao = data?.alocacao_por_tipo ?? [];
  const topAtivos = data?.top_ativos ?? [];
  const pieData = alocacao
    .map((item) => ({
      name: item.tipo_label,
      tipo: item.tipo_ativo,
      value: toNumber(item.valor_atual_brl),
      percentual: toNumber(item.percentual),
    }))
    .filter((item) => item.value > 0);

  return (
    <div className="space-y-2">
      <PageHeader
        title="Desempenho"
        description="Snapshot atual da carteira com cotacoes, alocacao e indicadores de mercado."
      />

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <MoneyCard title="Patrimonio atual" value={data?.patrimonio_atual_brl ?? 0} subtitle="Carteira marcada a mercado" tone="green" icon={<PieChartIcon className="h-4 w-4" />} />
        <MoneyCard title="Total aportado" value={data?.total_aportado_brl ?? 0} subtitle="Custo ainda em posicao" tone="blue" icon={<CircleDollarSign className="h-4 w-4" />} />
        <MoneyCard title={resultadoLabel} value={data?.lucro_prejuizo_brl ?? 0} subtitle="Resultado aberto" tone={lucro < 0 ? "red" : "green"} icon={lucro < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />} />
        <section className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
          <p className="text-[11px] font-medium uppercase text-slate-500">Rentabilidade simples</p>
          <p className={cn("mt-0.5 text-lg font-semibold", toNumber(data?.rentabilidade_percentual) < 0 ? "text-danger-600" : "text-brand-400")}>
            {formatPercent(data?.rentabilidade_percentual)}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">Resultado sobre aportado</p>
        </section>
        <MoneyCard title="Exterior em BRL" value={data?.exterior_brl ?? 0} subtitle="Convertido por USD/BRL" tone="yellow" icon={<LineChart className="h-4 w-4" />} />
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        <BenchmarkCard title="Dolar" kind="dolar" item={data?.benchmarks.dolar} />
        <BenchmarkCard title="Ibovespa" kind="ibovespa" item={data?.benchmarks.ibovespa} />
        <BenchmarkCard title="CDI diario" kind="cdi" item={data?.benchmarks.cdi} />
      </div>

      <div className="grid gap-2 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Alocacao por tipo" description="Peso atual de cada classe na carteira.">
          {alocacao.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="h-6 w-6" />}
              title="Sem posicoes em carteira"
              description="A alocacao aparece depois que houver ativos comprados."
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-[260px_1fr] lg:items-center">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart style={{ outline: "none" }}>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={100} paddingAngle={2}>
                      {pieData.map((item) => (
                        <Cell key={item.tipo} fill={PIE_COLORS[item.tipo] ?? "#64748B"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(value as number)} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {alocacao.map((item) => {
                  const visual = TYPE_COLORS[item.tipo_ativo] ?? { bar: "bg-slate-500", text: "text-slate-300", bg: "bg-slate-800" };
                  return (
                    <div key={item.tipo_ativo} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-slate-800 bg-slate-950/25 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full", visual.bar)} />
                        <div className="min-w-0">
                          <p className={cn("truncate text-sm font-semibold", visual.text)}>{item.tipo_label}</p>
                          <p className="text-[11px] text-slate-500">{item.quantidade_posicoes} posicao{item.quantidade_posicoes === 1 ? "" : "es"}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-100">{formatMoney(item.valor_atual_brl)}</p>
                        <p className="text-[11px] text-slate-500">{formatPercent(item.percentual)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Top ativos por valor atual" description="Maiores posicoes da carteira marcada a mercado.">
          {topAtivos.length === 0 ? (
            <EmptyState title="Sem ativos para ranquear" description="Compre ativos para acompanhar a concentracao da carteira." />
          ) : (
            <div className="space-y-2">
              {topAtivos.map((item, index) => {
                const visual = TYPE_COLORS[item.tipo_ativo] ?? { bar: "bg-slate-500", text: "text-slate-300", bg: "bg-slate-800" };
                return (
                  <div key={item.ativo_id} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-md border border-slate-800 bg-slate-950/25 px-3 py-2">
                    <div className={cn("flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold", visual.bg, visual.text)}>
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-100">{item.ticker}</p>
                      </div>
                      <p className="truncate text-[11px] text-slate-500">
                        {item.tipo_label} | {item.corretora || item.nome}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-100">{formatMoney(item.valor_atual_brl)}</p>
                      <p className="text-[11px] text-slate-500">{formatPercent(item.percentual)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-2 xl:grid-cols-2">
        <RankingTable title="Maiores ganhos" icon={<TrendingUp className="h-4 w-4" />} rows={data?.maiores_ganhos ?? []} />
        <RankingTable title="Maiores perdas" icon={<TrendingDown className="h-4 w-4" />} rows={data?.maiores_perdas ?? []} />
      </div>

      {desempenho.isError && (
        <div className="rounded-md border border-danger-600/40 bg-danger-600/10 px-3 py-2 text-sm text-danger-600">
          Nao foi possivel carregar os indicadores de desempenho.
        </div>
      )}
      {desempenho.isFetching && !data && <p className="text-xs text-slate-500">Carregando desempenho da carteira...</p>}
    </div>
  );
}
