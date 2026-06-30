import { useQuery } from "@tanstack/react-query";
import { AreaChart, Banknote, CalendarDays, CircleDollarSign, Filter, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "../components/finance/EmptyState";
import { MoneyCard } from "../components/finance/MoneyCard";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { Td, Th, Table } from "../components/ui/table";
import { api } from "../lib/api";
import { formatMoney, formatPercent, toNumber } from "../lib/formatters";
import { INVESTMENT_TYPE_OPTIONS } from "../lib/investmentProfiles";
import type { TipoAtivo, TipoProvento } from "../lib/types";
import { cn } from "../lib/utils";

type Periodo = "mensal" | "anual";
type Visao = "patrimonio" | "proventos";
type ProventosGroup = "periodo" | "classe" | "ativo" | "tipo";
type ChartPoint = {
  periodo: string;
  patrimonio?: number;
  aportado?: number;
  resultado?: number;
  proventos?: number;
  quantidade?: number;
  rentabilidade?: number;
  dividendos?: number;
};
type ProventoGroupRow = {
  id: string;
  label: string;
  detail: string;
  total: number;
  quantidade: number;
};

const tooltipStyle = { backgroundColor: "#111821", border: "1px solid #273343", borderRadius: 6, color: "#eef2f7" };

const chartLabels: Record<string, string> = {
  patrimonio: "Patrimonio",
  aportado: "Aportado",
  resultado: "Resultado",
  proventos: "Proventos",
  rentabilidade: "Carteira",
};

const proventoOptions: Array<{ value: "" | TipoProvento; label: string }> = [
  { value: "", label: "Todos os proventos" },
  { value: "DIVIDENDO", label: "Dividendos" },
  { value: "JCP", label: "JCP" },
  { value: "RENDIMENTO_FII", label: "Rendimentos FII" },
  { value: "DIVIDENDO_EXTERIOR", label: "Dividendos exterior" },
  { value: "JUROS_RENDA_FIXA", label: "Juros" },
  { value: "OUTRO", label: "Outros" },
];

function compactMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function BenchmarkLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/30 px-3 py-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-100">{value}</span>
    </div>
  );
}

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <section className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
      <p className="truncate text-[11px] font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-100">{value}</p>
      {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
    </section>
  );
}

export function DesempenhoPage() {
  const [visao, setVisao] = useState<Visao>("patrimonio");
  const [periodo, setPeriodo] = useState<Periodo>("mensal");
  const [tipoAtivoFiltro, setTipoAtivoFiltro] = useState<TipoAtivo | "">("");
  const [ativoFiltro, setAtivoFiltro] = useState("");
  const [tipoProventoFiltro, setTipoProventoFiltro] = useState<TipoProvento | "">("");
  const [proventosGroup, setProventosGroup] = useState<ProventosGroup>("classe");

  const desempenho = useQuery({
    queryKey: ["investimentos", "desempenho"],
    queryFn: api.desempenhoInvestimentos,
    retry: false,
  });
  const historico = useQuery({
    queryKey: ["investimentos", "desempenho", "historico", periodo],
    queryFn: () => api.historicoDesempenhoInvestimentos(periodo),
    enabled: visao === "patrimonio" && Boolean(desempenho.data),
    retry: false,
  });
  const ativos = useQuery({
    queryKey: ["investimentos", "ativos", "desempenho"],
    queryFn: api.ativos,
    enabled: visao === "proventos",
  });
  const proventos = useQuery({
    queryKey: ["investimentos", "desempenho", "proventos", periodo, tipoAtivoFiltro, ativoFiltro, tipoProventoFiltro],
    queryFn: () =>
      api.historicoProventosInvestimentos(periodo, {
        tipo_ativo: tipoAtivoFiltro,
        ativo_id: ativoFiltro,
        tipo_provento: tipoProventoFiltro,
    }),
    enabled: visao === "proventos",
    retry: false,
  });

  const data = desempenho.data;
  const pontos = historico.data ?? [];
  const proventosData = proventos.data;
  const lucro = toNumber(data?.lucro_prejuizo_brl);
  const resultadoLabel = lucro < 0 ? "Prejuizo" : "Lucro";

  const ativosFiltrados = useMemo(
    () => (ativos.data ?? []).filter((ativo) => !tipoAtivoFiltro || ativo.tipo_ativo === tipoAtivoFiltro),
    [ativos.data, tipoAtivoFiltro],
  );

  const patrimonioChartData = useMemo<ChartPoint[]>(
    () =>
      pontos.map((item) => ({
        periodo: item.periodo,
        patrimonio: toNumber(item.patrimonio_atual_brl),
        aportado: toNumber(item.total_aportado_brl),
        resultado: toNumber(item.lucro_prejuizo_brl),
        rentabilidade: toNumber(item.rentabilidade_percentual),
        dividendos: toNumber(item.dividendos_brl),
      })),
    [pontos],
  );

  const proventosChartData = useMemo<ChartPoint[]>(
    () =>
      (proventosData?.por_periodo ?? []).map((item) => ({
        periodo: item.periodo,
        proventos: toNumber(item.total_brl),
        quantidade: item.quantidade,
      })),
    [proventosData],
  );

  const proventosGroupedRows = useMemo<ProventoGroupRow[]>(() => {
    if (!proventosData) return [];
    if (proventosGroup === "periodo") {
      return [...proventosData.por_periodo].reverse().map((item) => ({
        id: item.periodo,
        label: item.periodo,
        detail: "Periodo de recebimento",
        total: toNumber(item.total_brl),
        quantidade: item.quantidade,
      }));
    }
    if (proventosGroup === "ativo") {
      return proventosData.por_ativo.map((item) => ({
        id: item.ativo_id,
        label: item.ticker,
        detail: [item.tipo_label, item.corretora || item.nome].filter(Boolean).join(" | "),
        total: toNumber(item.total_brl),
        quantidade: item.quantidade,
      }));
    }
    if (proventosGroup === "tipo") {
      return proventosData.por_tipo.map((item) => ({
        id: item.tipo_provento,
        label: item.tipo_label,
        detail: "Tipo de provento",
        total: toNumber(item.total_brl),
        quantidade: item.quantidade,
      }));
    }
    return (proventosData.por_classe ?? []).map((item) => ({
      id: item.tipo_ativo,
      label: item.tipo_label,
      detail: "Classe de investimento",
      total: toNumber(item.total_brl),
      quantidade: item.quantidade,
    }));
  }, [proventosData, proventosGroup]);

  const chartData = visao === "patrimonio" ? patrimonioChartData : proventosChartData;
  const erro = desempenho.isError || (visao === "patrimonio" && historico.isError) || (visao === "proventos" && proventos.isError);

  return (
    <div className="space-y-2">
      <PageHeader
        title="Desempenho"
        description="Evolucao mensal da carteira e dos proventos, sempre consolidada em reais."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-slate-700 bg-slate-950 p-1">
              <Button size="sm" variant={visao === "patrimonio" ? "primary" : "ghost"} onClick={() => setVisao("patrimonio")}>
                Patrimonio
              </Button>
              <Button size="sm" variant={visao === "proventos" ? "primary" : "ghost"} onClick={() => setVisao("proventos")}>
                Proventos
              </Button>
            </div>
            <div className="flex rounded-md border border-slate-700 bg-slate-950 p-1">
              <Button size="sm" variant={periodo === "mensal" ? "primary" : "ghost"} onClick={() => setPeriodo("mensal")}>
                Mensal
              </Button>
              <Button size="sm" variant={periodo === "anual" ? "primary" : "ghost"} onClick={() => setPeriodo("anual")}>
                Anual
              </Button>
            </div>
          </div>
        }
      />

      {visao === "patrimonio" ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <MoneyCard title="Patrimonio atual" value={data?.patrimonio_atual_brl ?? 0} subtitle="Snapshot do mes atual" tone="green" icon={<AreaChart className="h-4 w-4" />} />
          <MoneyCard title="Total aportado" value={data?.total_aportado_brl ?? 0} subtitle="Custo ainda em posicao" tone="blue" icon={<CircleDollarSign className="h-4 w-4" />} />
          <MoneyCard title={resultadoLabel} value={data?.lucro_prejuizo_brl ?? 0} subtitle="Resultado aberto" tone={lucro < 0 ? "red" : "green"} icon={lucro < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />} />
          <section className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
            <p className="text-[11px] font-medium uppercase text-slate-500">Rentabilidade</p>
            <p className={cn("mt-0.5 text-lg font-semibold", toNumber(data?.rentabilidade_percentual) < 0 ? "text-danger-600" : "text-brand-400")}>
              {formatPercent(data?.rentabilidade_percentual)}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">Resultado sobre aportado</p>
          </section>
        </div>
      ) : (
        <>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <MoneyCard title="Proventos recebidos" value={proventosData?.total_brl ?? 0} subtitle="Consolidado em BRL" tone="yellow" icon={<Banknote className="h-4 w-4" />} />
            <MoneyCard title="Media por periodo" value={proventosData?.media_periodo_brl ?? 0} subtitle={periodo === "mensal" ? "Media mensal" : "Media anual"} tone="blue" />
            <MoneyCard title="Maior periodo" value={proventosData?.maior_periodo_brl ?? 0} subtitle={proventosData?.maior_periodo ?? "Sem registros"} tone="green" />
            <StatCard label="Registros" value={String(proventosData?.quantidade ?? 0)} subtitle="Dividendos, JCP, rendimentos e juros" />
          </div>
          <SectionCard title="Filtros de proventos" description="Use para comparar uma classe, um ativo ou um tipo de recebimento." action={<Filter className="h-4 w-4 text-slate-500" />}>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[200px_minmax(240px,1fr)_220px_200px]">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Classe</span>
                <Select
                  value={tipoAtivoFiltro}
                  onChange={(event) => {
                    setTipoAtivoFiltro(event.target.value as TipoAtivo | "");
                    setAtivoFiltro("");
                  }}
                >
                  <option value="">Todas as classes</option>
                  {INVESTMENT_TYPE_OPTIONS.map((tipo) => (
                    <option key={tipo.value} value={tipo.value}>
                      {tipo.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Ativo</span>
                <Select value={ativoFiltro} onChange={(event) => setAtivoFiltro(event.target.value)}>
                  <option value="">Todos os ativos</option>
                  {ativosFiltrados.map((ativo) => (
                    <option key={ativo.id} value={ativo.id}>
                      {ativo.ticker} - {ativo.nome}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Tipo</span>
                <Select value={tipoProventoFiltro} onChange={(event) => setTipoProventoFiltro(event.target.value as TipoProvento | "")}>
                  {proventoOptions.map((tipo) => (
                    <option key={tipo.value || "todos"} value={tipo.value}>
                      {tipo.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Agrupar</span>
                <Select value={proventosGroup} onChange={(event) => setProventosGroup(event.target.value as ProventosGroup)}>
                  <option value="classe">Classe</option>
                  <option value="ativo">Ativo</option>
                  <option value="tipo">Tipo de provento</option>
                  <option value="periodo">Periodo</option>
                </Select>
              </label>
            </div>
          </SectionCard>
        </>
      )}

      <SectionCard
        title={
          visao === "patrimonio"
            ? periodo === "mensal"
              ? "Evolucao mensal do patrimonio"
              : "Evolucao anual do patrimonio"
            : periodo === "mensal"
              ? "Proventos recebidos por mes"
              : "Proventos recebidos por ano"
        }
        description={
          visao === "patrimonio"
            ? "O mes atual e atualizado automaticamente quando esta aba e carregada."
            : "Valores em USD entram em BRL pela cotacao gravada no dia do recebimento."
        }
      >
        {chartData.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-6 w-6" />}
            title={visao === "patrimonio" ? "Sem historico de desempenho" : "Sem proventos no filtro"}
            description={visao === "patrimonio" ? "O primeiro snapshot mensal sera criado automaticamente ao carregar os dados da carteira." : "Registre proventos ou ajuste os filtros para ver a evolucao."}
          />
        ) : (
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart data={chartData} margin={{ top: 16, right: 24, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="#243244" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="periodo" stroke="#94a3b8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => compactMoney(Number(value))} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [formatMoney(value as number), chartLabels[String(name)] ?? String(name)]}
                  labelFormatter={(label) => `Periodo: ${label}`}
                />
                <Legend formatter={(value) => chartLabels[String(value)] ?? String(value)} />
                {visao === "patrimonio" ? (
                  <>
                    <Line type="monotone" dataKey="patrimonio" stroke="#22c55e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="aportado" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="resultado" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  </>
                ) : (
                  <Line type="monotone" dataKey="proventos" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                )}
              </RechartsLineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {visao === "patrimonio" && patrimonioChartData.length > 0 && (
        <div className="grid gap-2 xl:grid-cols-2">
          <SectionCard title="Evolucao acumulada da carteira" description="Rentabilidade simples gravada nos snapshots mensais.">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={patrimonioChartData} margin={{ top: 16, right: 20, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#243244" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="periodo" stroke="#94a3b8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [formatPercent(value as number), "Carteira"]}
                    labelFormatter={(label) => `Periodo: ${label}`}
                  />
                  <Legend formatter={(value) => chartLabels[String(value)] ?? String(value)} />
                  <Line type="monotone" dataKey="rentabilidade" stroke="#22c55e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
          <SectionCard title="Patrimonio e proventos" description="Barras mostram patrimonio; linha mostra proventos do periodo.">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={patrimonioChartData} margin={{ top: 16, right: 20, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#243244" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="periodo" stroke="#94a3b8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" stroke="#94a3b8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => compactMoney(Number(value))} />
                  <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => compactMoney(Number(value))} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [formatMoney(value as number), chartLabels[String(name)] ?? String(name)]}
                    labelFormatter={(label) => `Periodo: ${label}`}
                  />
                  <Legend formatter={(value) => chartLabels[String(value)] ?? String(value)} />
                  <Bar yAxisId="left" dataKey="patrimonio" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="dividendos" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>
      )}

      {visao === "patrimonio" ? (
        <div className="grid gap-2 xl:grid-cols-[1fr_360px]">
          <SectionCard title="Historico consolidado" description="Pontos mensais usados no grafico.">
            {pontos.length === 0 ? (
              <EmptyState title="Sem registros" description="O historico aparecera depois do primeiro snapshot mensal." />
            ) : (
              <Table className="min-w-[760px]">
                <thead>
                  <tr>
                    <Th>Periodo</Th>
                    <Th className="text-right">Patrimonio</Th>
                    <Th className="text-right">Aportado</Th>
                    <Th className="text-right">Resultado</Th>
                    <Th className="text-right">Dividendos</Th>
                    <Th className="text-right">Rentab.</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...pontos].reverse().map((item) => {
                    const resultado = toNumber(item.lucro_prejuizo_brl);
                    return (
                      <tr key={`${item.ano}-${item.mes}`}>
                        <Td className="font-semibold text-slate-100">{item.periodo}</Td>
                        <Td className="text-right font-semibold text-slate-100">{formatMoney(item.patrimonio_atual_brl)}</Td>
                        <Td className="text-right">{formatMoney(item.total_aportado_brl)}</Td>
                        <Td className={cn("text-right font-medium", resultado < 0 ? "text-danger-600" : "text-brand-400")}>{formatMoney(item.lucro_prejuizo_brl)}</Td>
                        <Td className="text-right">{formatMoney(item.dividendos_brl)}</Td>
                        <Td className={cn("text-right font-medium", toNumber(item.rentabilidade_percentual) < 0 ? "text-danger-600" : "text-brand-400")}>
                          {formatPercent(item.rentabilidade_percentual)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </SectionCard>

          <SectionCard title="Indicadores atuais" description="Referencias de mercado para contexto.">
            <div className="space-y-2">
              <BenchmarkLine label="Dolar" value={data?.benchmarks.dolar.valor ? formatMoney(data.benchmarks.dolar.valor) : "-"} />
              <BenchmarkLine label="Ibovespa" value={data?.benchmarks.ibovespa.valor ? toNumber(data.benchmarks.ibovespa.valor).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "-"} />
              <BenchmarkLine label="CDI diario" value={data?.benchmarks.cdi.valor ? formatPercent(data.benchmarks.cdi.valor) : "-"} />
            </div>
          </SectionCard>
        </div>
      ) : (
        <div className="grid gap-2 xl:grid-cols-[1fr_380px]">
          <SectionCard title="Historico de proventos" description="Cada linha ja esta consolidada em BRL.">
            {(proventosData?.por_periodo.length ?? 0) === 0 ? (
              <EmptyState title="Sem registros" description="Os recebimentos aparecerao aqui quando houver proventos registrados." />
            ) : (
              <Table className="min-w-[560px]">
                <thead>
                  <tr>
                    <Th>Periodo</Th>
                    <Th className="text-right">Proventos</Th>
                    <Th className="text-right">Registros</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...(proventosData?.por_periodo ?? [])].reverse().map((item) => (
                    <tr key={`${item.ano}-${item.mes}`}>
                      <Td className="font-semibold text-slate-100">{item.periodo}</Td>
                      <Td className="text-right font-semibold text-amber-300">{formatMoney(item.total_brl)}</Td>
                      <Td className="text-right">{item.quantidade}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </SectionCard>
          <div className="space-y-2">
            <SectionCard title="Agrupamento selecionado" description="Compare por classe, ativo, tipo ou periodo.">
              <div className="space-y-2">
                {proventosGroupedRows.slice(0, 10).map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/30 px-3 py-2 transition hover:border-amber-500/30 hover:bg-amber-500/5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-xs font-semibold text-amber-300">{index + 1}</span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-100">{item.label}</div>
                        <div className="truncate text-[11px] text-slate-500">{item.detail}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-100">{formatMoney(item.total)}</div>
                      <div className="text-[11px] text-slate-500">{item.quantidade} registro{item.quantidade === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                ))}
                {proventosGroupedRows.length === 0 && <p className="text-xs text-slate-500">Sem dados no filtro.</p>}
              </div>
            </SectionCard>
            <SectionCard title="Tipos de recebimento" description="Dividendos, JCP, juros e rendimentos.">
              <div className="space-y-2">
                {(proventosData?.por_tipo ?? []).map((item) => (
                  <div key={item.tipo_provento} className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/30 px-3 py-2">
                    <span className="text-xs font-medium text-slate-400">{item.tipo_label}</span>
                    <span className="text-sm font-semibold text-slate-100">{formatMoney(item.total_brl)}</span>
                  </div>
                ))}
                {(proventosData?.por_tipo.length ?? 0) === 0 && <p className="text-xs text-slate-500">Sem tipos no filtro.</p>}
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {erro && (
        <div className="rounded-md border border-danger-600/40 bg-danger-600/10 px-3 py-2 text-sm text-danger-600">
          Nao foi possivel carregar o desempenho dos investimentos.
        </div>
      )}
      {desempenho.isFetching && !data && <p className="text-xs text-slate-500">Carregando desempenho da carteira...</p>}
    </div>
  );
}
