import { useQuery } from "@tanstack/react-query";
import { Eye, Filter, Search, Tags, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { EmptyState } from "../components/finance/EmptyState";
import { MoneyCard } from "../components/finance/MoneyCard";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Td, Th, Table } from "../components/ui/table";
import { api } from "../lib/api";
import { formatMoney, formatPercent, toNumber } from "../lib/formatters";
import { cn } from "../lib/utils";
import type { DesempenhoAtivo, TipoAtivo } from "../lib/types";

type GroupBy = "ativo" | "tipo" | "corretora" | "moeda";
type SortBy = "valor" | "percentual" | "resultado" | "nome";
type CurrencyView = "BRL" | "USD";

interface PatrimonioRow {
  id: string;
  nome: string;
  detalhe: string;
  tipo?: TipoAtivo;
  moeda?: string;
  quantidade: number;
  valor: number;
  aportado: number;
  resultado: number;
  percentual: number;
}

const PIE_COLORS = ["#22C55E", "#3B82F6", "#EAB308", "#F97316", "#A855F7", "#EC4899", "#06B6D4", "#84CC16", "#94A3B8", "#F43F5E"];
const TYPE_DOT: Partial<Record<TipoAtivo, string>> = {
  ACAO_BR: "bg-blue-500",
  FII: "bg-brand-500",
  ETF_BR: "bg-cyan-500",
  EXTERIOR: "bg-amber-500",
  CRIPTO: "bg-yellow-400",
  CAIXINHA_CDB: "bg-teal-500",
  RESERVA_EMERGENCIA: "bg-lime-400",
  RENDA_FIXA: "bg-emerald-500",
  PREVIDENCIA: "bg-purple-500",
};
const tooltipStyle = { backgroundColor: "#111821", border: "1px solid #273343", borderRadius: 6, color: "#eef2f7" };

type MacroGrupo = "VARIAVEL" | "FII" | "EXTERIOR" | "RENDA_FIXA" | "CRIPTO" | "RESERVA_EMERGENCIA" | "PREVIDENCIA" | "OUTROS";

const MACRO_LABELS: Record<MacroGrupo, string> = {
  VARIAVEL: "Acoes",
  FII: "FII",
  EXTERIOR: "Exterior",
  RENDA_FIXA: "Renda fixa",
  CRIPTO: "Cripto",
  RESERVA_EMERGENCIA: "Reserva de emergencia",
  PREVIDENCIA: "Previdencia",
  OUTROS: "Outros",
};

const MACRO_ORDER: MacroGrupo[] = ["VARIAVEL", "FII", "EXTERIOR", "RENDA_FIXA", "CRIPTO", "RESERVA_EMERGENCIA", "PREVIDENCIA", "OUTROS"];

const TIPOS_A_PARTE: TipoAtivo[] = ["RESERVA_EMERGENCIA", "PREVIDENCIA"];
const EXCLUIR_RESERVAS_KEY = "patrimonio:excluir-reservas";

function macroGrupo(tipo?: TipoAtivo): MacroGrupo {
  switch (tipo) {
    case "ACAO_BR":
    case "ETF_BR":
      return "VARIAVEL";
    case "FII":
      return "FII";
    case "EXTERIOR":
    case "ACAO_EXTERIOR":
    case "ETF_EXTERIOR":
      return "EXTERIOR";
    case "RENDA_FIXA":
    case "CAIXINHA_CDB":
      return "RENDA_FIXA";
    case "CRIPTO":
      return "CRIPTO";
    case "RESERVA_EMERGENCIA":
      return "RESERVA_EMERGENCIA";
    case "PREVIDENCIA":
      return "PREVIDENCIA";
    default:
      return "OUTROS";
  }
}

function currencySymbol(currency: CurrencyView) {
  return currency === "USD" ? "US$" : "R$";
}

function formatCurrency(value: number, currency: CurrencyView) {
  if (currency === "USD") {
    return `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return formatMoney(value);
}

function normalize(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function groupKey(item: DesempenhoAtivo, groupBy: GroupBy) {
  if (groupBy === "tipo") return macroGrupo(item.tipo_ativo);
  if (groupBy === "corretora") return item.corretora || "Sem corretora";
  if (groupBy === "moeda") return item.moeda || "BRL";
  return item.ativo_id;
}

function groupName(item: DesempenhoAtivo, groupBy: GroupBy) {
  if (groupBy === "tipo") return MACRO_LABELS[macroGrupo(item.tipo_ativo)];
  if (groupBy === "corretora") return item.corretora || "Sem corretora";
  if (groupBy === "moeda") return item.moeda === "USD" ? "Exterior em dolar" : "Brasil em reais";
  return item.ticker;
}

function groupDetail(item: DesempenhoAtivo, groupBy: GroupBy) {
  if (groupBy === "tipo") return "Classe de ativo";
  if (groupBy === "corretora") return "Conta/corretora";
  if (groupBy === "moeda") return "Moeda de origem";
  return [item.tipo_label, item.corretora || item.nome].filter(Boolean).join(" | ");
}

export function PatrimonioPage() {
  const patrimonio = useQuery({
    queryKey: ["investimentos", "desempenho", "patrimonio"],
    queryFn: api.desempenhoInvestimentos,
    retry: false,
  });
  const [groupBy, setGroupBy] = useState<GroupBy>("ativo");
  const [sortBy, setSortBy] = useState<SortBy>("valor");
  const [currency, setCurrency] = useState<CurrencyView>("BRL");
  const [typeFilter, setTypeFilter] = useState<"TODOS" | MacroGrupo>("TODOS");
  const [currencyFilter, setCurrencyFilter] = useState<"TODAS" | "BRL" | "USD">("TODAS");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [excluirReservas, setExcluirReservas] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(EXCLUIR_RESERVAS_KEY) === "1";
  });

  function toggleExcluirReservas(valor: boolean) {
    setExcluirReservas(valor);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EXCLUIR_RESERVAS_KEY, valor ? "1" : "0");
    }
  }

  const dolar = toNumber(patrimonio.data?.benchmarks.dolar.valor) || 1;
  const ativosTodos = patrimonio.data?.alocacao_por_ativo ?? [];
  const ativos = useMemo(
    () => (excluirReservas ? ativosTodos.filter((item) => !TIPOS_A_PARTE.includes(item.tipo_ativo)) : ativosTodos),
    [ativosTodos, excluirReservas],
  );
  const availableTypes = useMemo(() => {
    const presentes = new Set(ativos.map((item) => macroGrupo(item.tipo_ativo)));
    return MACRO_ORDER.filter((macro) => presentes.has(macro));
  }, [ativos]);

  function displayValue(brl: number) {
    return currency === "USD" && dolar > 0 ? brl / dolar : brl;
  }

  const rows = useMemo(() => {
    const term = normalize(search);
    const filtered = ativos.filter((item) => {
      const matchesType = typeFilter === "TODOS" || macroGrupo(item.tipo_ativo) === typeFilter;
      const matchesCurrency = currencyFilter === "TODAS" || item.moeda === currencyFilter;
      const haystack = normalize([item.ticker, item.nome, item.tipo_label, item.corretora, item.moeda].filter(Boolean).join(" "));
      return matchesType && matchesCurrency && (!term || haystack.includes(term));
    });

    const map = new Map<string, PatrimonioRow>();
    for (const item of filtered) {
      const id = groupKey(item, groupBy);
      const existing = map.get(id);
      const valor = displayValue(toNumber(item.valor_atual_brl));
      const aportado = displayValue(toNumber(item.total_aportado_brl));
      const resultado = displayValue(toNumber(item.resultado_brl));
      if (existing) {
        existing.quantidade += 1;
        existing.valor += valor;
        existing.aportado += aportado;
        existing.resultado += resultado;
      } else {
        map.set(id, {
          id,
          nome: groupName(item, groupBy),
          detalhe: groupDetail(item, groupBy),
          tipo: item.tipo_ativo,
          moeda: item.moeda,
          quantidade: 1,
          valor,
          aportado,
          resultado,
          percentual: 0,
        });
      }
    }

    const total = [...map.values()].reduce((acc, item) => acc + item.valor, 0);
    const grouped = [...map.values()].map((item) => ({
      ...item,
      percentual: total > 0 ? (item.valor / total) * 100 : 0,
    }));
    grouped.sort((a, b) => {
      if (sortBy === "nome") return a.nome.localeCompare(b.nome);
      if (sortBy === "resultado") return b.resultado - a.resultado;
      if (sortBy === "percentual") return b.percentual - a.percentual;
      return b.valor - a.valor;
    });
    return grouped;
  }, [ativos, currency, currencyFilter, groupBy, search, sortBy, typeFilter, dolar]);

  const total = rows.reduce((acc, item) => acc + item.valor, 0);
  const aportado = rows.reduce((acc, item) => acc + item.aportado, 0);
  const resultado = rows.reduce((acc, item) => acc + item.resultado, 0);
  const maior = rows[0];
  const chartData = rows.filter((item) => item.valor > 0);
  const activeRow = rows.find((item) => item.id === activeId);

  return (
    <div className="space-y-2">
      <PageHeader
        title="Meu patrimonio"
        description="Composicao atual com agrupamentos, filtros e leitura visual da carteira."
      />

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyCard title={`Patrimonio em ${currency}`} value={total} subtitle="Valor filtrado atual" tone="green" currency={currency} icon={<WalletCards className="h-4 w-4" />} />
        <MoneyCard title="Total aportado" value={aportado} subtitle="Custo em posicao" tone="blue" currency={currency} />
        <MoneyCard title={resultado < 0 ? "Prejuizo" : "Lucro"} value={resultado} subtitle="Resultado aberto" tone={resultado < 0 ? "red" : "green"} currency={currency} />
        <section className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
          <p className="truncate text-[11px] font-medium uppercase text-slate-500">Maior participacao</p>
          <p className="mt-0.5 truncate text-lg font-semibold text-slate-100">{maior?.nome ?? "-"}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{maior ? `${formatPercent(maior.percentual)} do filtro atual` : "Sem dados"}</p>
        </section>
      </div>

      <SectionCard title="Controle de visualizacao" description="Altere agrupamento, filtros e moeda sem sair da tela.">
        <div className="grid gap-2 md:grid-cols-[1fr_150px_150px_150px_150px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-500" />
            <Input className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ativo, corretora ou tipo" />
          </label>
          <Select value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)} aria-label="Agrupar patrimonio">
            <option value="ativo">Agrupar: ativo</option>
            <option value="tipo">Agrupar: tipo</option>
            <option value="corretora">Agrupar: corretora</option>
            <option value="moeda">Agrupar: moeda</option>
          </Select>
          <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "TODOS" | MacroGrupo)} aria-label="Filtrar tipo">
            <option value="TODOS">Todos os tipos</option>
            {availableTypes.map((macro) => (
              <option key={macro} value={macro}>
                {MACRO_LABELS[macro]}
              </option>
            ))}
          </Select>
          <Select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value as "TODAS" | "BRL" | "USD")} aria-label="Filtrar moeda">
            <option value="TODAS">Todas moedas</option>
            <option value="BRL">Somente BRL</option>
            <option value="USD">Somente USD</option>
          </Select>
          <Select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)} aria-label="Ordenar patrimonio">
            <option value="valor">Ordenar: valor</option>
            <option value="percentual">Ordenar: % total</option>
            <option value="resultado">Ordenar: resultado</option>
            <option value="nome">Ordenar: nome</option>
          </Select>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-700">
            {(["BRL", "USD"] as CurrencyView[]).map((item) => (
              <button
                key={item}
                className={cn(
                  "h-8 px-3 text-xs font-semibold transition",
                  currency === item ? "bg-brand-500 text-white" : "bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-100",
                )}
                onClick={() => setCurrency(item)}
              >
                {currencySymbol(item)} {item}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => setActiveId(null)}>
            <Eye className="h-4 w-4" />
            Mostrar tudo
          </Button>
          <label
            className={cn(
              "inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs font-semibold transition",
              excluirReservas ? "border-brand-500/50 bg-brand-500/10 text-brand-300" : "border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-100",
            )}
            title="Remove Reserva de emergencia e Previdencia de todos os calculos, graficos e do patrimonio total."
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-brand-500"
              checked={excluirReservas}
              onChange={(event) => toggleExcluirReservas(event.target.checked)}
            />
            Desconsiderar Reserva e Previdencia
          </label>
          <Badge tone="blue">{rows.length} linha{rows.length === 1 ? "" : "s"}</Badge>
          <Badge tone="neutral">Dolar {formatMoney(dolar)}</Badge>
        </div>
      </SectionCard>

      <div className="grid gap-2 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard title="Divisao do patrimonio" description="Passe o mouse sobre o grafico ou linhas para destacar.">
          {chartData.length === 0 ? (
            <EmptyState title="Sem patrimonio para exibir" description="A composicao aparece conforme os ativos forem registrados." />
          ) : (
            <div className="grid gap-3 lg:grid-cols-[300px_1fr] lg:items-center">
              <div className="relative h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart style={{ outline: "none" }}>
                    <Pie
                      data={chartData}
                      dataKey="valor"
                      nameKey="nome"
                      innerRadius={70}
                      outerRadius={122}
                      paddingAngle={2}
                      isAnimationActive
                      onMouseEnter={(item) => setActiveId(String(item.payload?.id || ""))}
                    >
                      {chartData.map((item, index) => (
                        <Cell
                          key={item.id}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                          stroke={activeId === item.id ? "#F8FAFC" : "#111821"}
                          strokeWidth={activeId === item.id ? 3 : 1}
                          opacity={!activeId || activeId === item.id ? 1 : 0.35}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => formatCurrency(Number(value), currency)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Total</p>
                    <p className="text-xl font-semibold text-slate-100">{formatCurrency(total, currency)}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {rows.slice(0, 10).map((item, index) => (
                  <button
                    key={item.id}
                    className={cn(
                      "grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-md border px-3 py-2 text-left transition duration-200",
                      activeId === item.id
                        ? "scale-[1.01] border-brand-500/40 bg-brand-500/10 shadow-lg shadow-brand-500/5"
                        : "border-slate-800 bg-slate-950/25 hover:border-slate-700 hover:bg-slate-900/80",
                    )}
                    onMouseEnter={() => setActiveId(item.id)}
                    onFocus={() => setActiveId(item.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                        <span className="truncate text-sm font-semibold text-slate-100">{item.nome}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-800">
                        <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.max(2, Math.min(100, item.percentual))}%`, backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-100">{formatPercent(item.percentual)}</p>
                      <p className="text-[11px] text-slate-500">{formatCurrency(item.valor, currency)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Composicao detalhada"
          description={activeRow ? `${activeRow.nome}: ${formatCurrency(activeRow.valor, currency)}` : "Tabela sincronizada com filtros e agrupamento."}
          action={
            <div className="flex items-center gap-1 text-slate-500">
              <Tags className="h-4 w-4" />
              <Filter className="h-4 w-4" />
            </div>
          }
        >
          {rows.length === 0 ? (
            <EmptyState title="Nenhum item encontrado" description="Ajuste busca, tipo ou moeda para ampliar a visualizacao." />
          ) : (
            <Table className="min-w-[720px]">
              <thead>
                <tr>
                  <Th>{groupBy === "ativo" ? "Ativo" : "Grupo"}</Th>
                  <Th className="text-right">Valor atual</Th>
                  <Th className="text-right">% total</Th>
                  <Th className="text-right">Resultado</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item, index) => {
                  const positive = item.resultado >= 0;
                  return (
                    <tr
                      key={item.id}
                      className={cn("transition-colors", activeId === item.id ? "bg-brand-500/10" : "hover:bg-slate-900/50")}
                      onMouseEnter={() => setActiveId(item.id)}
                    >
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2.5 w-2.5 rounded-full", item.tipo ? TYPE_DOT[item.tipo] : "")} style={!item.tipo ? { backgroundColor: PIE_COLORS[index % PIE_COLORS.length] } : undefined} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-100">{item.nome}</div>
                            <div className="truncate text-[11px] text-slate-500">
                              {item.detalhe} {groupBy !== "ativo" ? `| ${item.quantidade} ativo${item.quantidade === 1 ? "" : "s"}` : ""}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td className="text-right font-semibold text-slate-100">{formatCurrency(item.valor, currency)}</Td>
                      <Td className="text-right">{formatPercent(item.percentual)}</Td>
                      <Td className="text-right">
                        <div className={positive ? "font-semibold text-brand-400" : "font-semibold text-danger-600"}>{positive ? "Lucro" : "Prejuizo"}</div>
                        <div>{formatCurrency(item.resultado, currency)}</div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </SectionCard>
      </div>

      {patrimonio.isFetching && !patrimonio.data && <p className="text-xs text-slate-500">Carregando composicao do patrimonio...</p>}
      {patrimonio.isError && (
        <div className="rounded-md border border-danger-600/40 bg-danger-600/10 px-3 py-2 text-sm text-danger-600">
          Nao foi possivel carregar seu patrimonio agora.
        </div>
      )}
    </div>
  );
}
