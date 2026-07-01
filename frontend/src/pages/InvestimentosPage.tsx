import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, History, Pencil, RefreshCw, ShieldCheck, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { EmptyState } from "../components/finance/EmptyState";
import { MoneyCard } from "../components/finance/MoneyCard";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Table, Td, Th } from "../components/ui/table";
import { AtivosTable } from "../features/investimentos/AtivosTable";
import { CompraAtivoModal } from "../features/investimentos/CompraAtivoModal";
import { MovimentoInvestimentoDialog } from "../features/investimentos/MovimentoInvestimentoDialog";
import { VendaAtivoModal } from "../features/investimentos/VendaAtivoModal";
import { api } from "../lib/api";
import { formatDate, formatMoney, formatPercent, toNumber } from "../lib/formatters";
import { INVESTMENT_TYPE_LABELS, INVESTMENT_TYPE_OPTIONS } from "../lib/investmentProfiles";
import { invalidateInvestmentData } from "../lib/queryInvalidation";
import type { MovimentoInvestimento, Posicao, TipoAtivo } from "../lib/types";
import { currentMonth } from "../lib/utils";

function groupVisual(tipo: TipoAtivo) {
  if (tipo === "ACAO_BR") return { border: "border-blue-500/30", header: "bg-blue-500/10", accent: "text-blue-300", bar: "bg-blue-500" };
  if (tipo === "FII") return { border: "border-brand-500/30", header: "bg-brand-500/10", accent: "text-brand-400", bar: "bg-brand-500" };
  if (tipo === "ETF_BR") return { border: "border-cyan-500/30", header: "bg-cyan-500/10", accent: "text-cyan-300", bar: "bg-cyan-500" };
  if (tipo === "EXTERIOR") return { border: "border-amber-500/30", header: "bg-amber-500/10", accent: "text-amber-300", bar: "bg-amber-500" };
  if (tipo === "CRIPTO") return { border: "border-yellow-500/30", header: "bg-yellow-500/10", accent: "text-yellow-300", bar: "bg-yellow-500" };
  if (tipo === "RESERVA_EMERGENCIA") return { border: "border-lime-500/40", header: "bg-lime-500/10", accent: "text-lime-300", bar: "bg-lime-400" };
  if (tipo === "CAIXINHA_CDB") return { border: "border-teal-500/30", header: "bg-teal-500/10", accent: "text-teal-300", bar: "bg-teal-500" };
  if (tipo === "RENDA_FIXA") return { border: "border-emerald-500/30", header: "bg-emerald-500/10", accent: "text-emerald-300", bar: "bg-emerald-500" };
  if (tipo === "PREVIDENCIA") return { border: "border-purple-500/30", header: "bg-purple-500/10", accent: "text-purple-300", bar: "bg-purple-500" };
  return { border: "border-slate-700", header: "bg-slate-900", accent: "text-slate-300", bar: "bg-slate-500" };
}

const DIVIDEND_TYPES = new Set<TipoAtivo>(["ACAO_BR", "FII", "ETF_BR", "EXTERIOR"]);
const RESERVA_MESES_KEY = "central-financeira:reserva-emergencia:meses";

function supportsDividendos(tipo: TipoAtivo) {
  return DIVIDEND_TYPES.has(tipo);
}

function movimentoLabel(tipo: MovimentoInvestimento["tipo_movimento"]) {
  if (tipo === "COMPRA") return "Compra";
  if (tipo === "VENDA") return "Venda";
  if (tipo === "APORTE") return "Aporte";
  if (tipo === "RESGATE") return "Resgate";
  return "Ajuste";
}

function formatQuantity(value: string | number) {
  return toNumber(value).toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}

function GroupMetric({ label, children, tone = "default" }: { label: string; children: ReactNode; tone?: "default" | "green" | "red" | "yellow" }) {
  return (
    <div className="min-w-[112px] rounded-md bg-slate-950/35 px-2.5 py-2 text-right">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div
        className={
          tone === "red"
            ? "text-sm font-semibold text-danger-600"
            : tone === "green"
              ? "text-sm font-semibold text-brand-400"
              : tone === "yellow"
                ? "text-sm font-semibold text-yellow-300"
                : "text-sm font-semibold text-slate-100"
        }
      >
        {children}
      </div>
    </div>
  );
}
export function InvestimentosPage() {
  const queryClient = useQueryClient();
  const month = useMemo(currentMonth, []);
  const posicoes = useQuery({ queryKey: ["posicoes"], queryFn: api.posicoes });
  const dividendos = useQuery({ queryKey: ["dividendos"], queryFn: api.dividendos });
  const planejamento = useQuery({
    queryKey: ["planejamento", "resumo", "reserva-emergencia", month],
    queryFn: () => api.planejamentoResumo(month.ano, month.mes),
  });
  const cotacaoDolar = useQuery({ queryKey: ["dolar-cotacao-atual"], queryFn: api.dolarCotacaoAtual, refetchInterval: 60_000, retry: false });
  const movimentos = useQuery({ queryKey: ["investimentos", "movimentos"], queryFn: api.movimentosInvestimentos });
  const comprar = useMutation({ mutationFn: api.comprar, onSuccess: () => invalidateInvestmentData(queryClient) });
  const vender = useMutation({ mutationFn: api.vender, onSuccess: () => invalidateInvestmentData(queryClient) });
  const atualizarMovimento = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.atualizarMovimentoInvestimento(id, payload),
    onSuccess: () => invalidateInvestmentData(queryClient),
  });
  const excluirMovimento = useMutation({ mutationFn: api.excluirMovimentoInvestimento, onSuccess: () => invalidateInvestmentData(queryClient) });
  const atualizarCotacoes = useMutation({
    mutationFn: api.atualizarCotacoesInvestimentos,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posicoes"] }),
  });
  const [compraOpen, setCompraOpen] = useState(false);
  const [compraTipoInicial, setCompraTipoInicial] = useState<TipoAtivo | undefined>();
  const [vendaOpen, setVendaOpen] = useState(false);
  const [selectedSell, setSelectedSell] = useState<Posicao | null>(null);
  const [editingMovimento, setEditingMovimento] = useState<MovimentoInvestimento | null>(null);
  const [deleteMovimento, setDeleteMovimento] = useState<MovimentoInvestimento | null>(null);
  const [deleteMovimentoError, setDeleteMovimentoError] = useState("");
  const [reservaMeses, setReservaMeses] = useState(() => localStorage.getItem(RESERVA_MESES_KEY) || "6");
  const dolarCotacao = toNumber(cotacaoDolar.data?.cotacao_brl);
  const gastoProjetadoMes = toNumber(planejamento.data?.gastos_planejados);

  useEffect(() => {
    localStorage.setItem(RESERVA_MESES_KEY, reservaMeses);
  }, [reservaMeses]);

  function posicaoToBrl(item: Posicao, field: "valor_atual" | "valor_total_aportado" | "lucro_prejuizo") {
    const value = toNumber(item[field]);
    return item.moeda === "USD" && dolarCotacao > 0 ? value * dolarCotacao : value;
  }

  function valorPosicaoToBrl(item: Posicao, value: string | number | null | undefined) {
    const parsed = toNumber(value);
    return item.moeda === "USD" && dolarCotacao > 0 ? parsed * dolarCotacao : parsed;
  }

  const cards = useMemo(() => {
    const lista = posicoes.data ?? [];
    const aportado = lista.reduce((acc, item) => acc + posicaoToBrl(item, "valor_total_aportado"), 0);
    const atual = lista.reduce((acc, item) => acc + posicaoToBrl(item, "valor_atual"), 0);
    const lucro = lista.reduce((acc, item) => acc + posicaoToBrl(item, "lucro_prejuizo"), 0);
    const exteriorBrl = lista.filter((item) => item.moeda === "USD").reduce((acc, item) => acc + posicaoToBrl(item, "valor_atual"), 0);
    const anoAtual = new Date().getFullYear();
    const dividendosAno = (dividendos.data ?? [])
      .filter((item) => new Date(item.data_recebimento).getFullYear() === anoAtual)
      .reduce((acc, item) => acc + toNumber(item.valor_brl ?? item.valor), 0);
    return { aportado, atual, lucro, exteriorBrl, dividendosAno };
  }, [posicoes.data, dividendos.data, dolarCotacao]);

  const grupos = useMemo(() => {
    const ordem = INVESTMENT_TYPE_OPTIONS.map((item) => item.value);
    const map = new Map<TipoAtivo, Posicao[]>();
    for (const posicao of posicoes.data ?? []) {
      const tipo = posicao.tipo_ativo.includes("EXTERIOR") ? "EXTERIOR" : posicao.tipo_ativo;
      const lista = map.get(tipo) ?? [];
      lista.push(posicao);
      map.set(tipo, lista);
    }
    return [...map.entries()].sort(([a], [b]) => {
      const indexA = ordem.indexOf(a);
      const indexB = ordem.indexOf(b);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
  }, [posicoes.data]);

  const reserva = useMemo(() => {
    const itens = (posicoes.data ?? []).filter((item) => item.tipo_ativo === "RESERVA_EMERGENCIA");
    const atual = itens.reduce((acc, item) => acc + posicaoToBrl(item, "valor_atual"), 0);
    const aportado = itens.reduce((acc, item) => acc + posicaoToBrl(item, "valor_total_aportado"), 0);
    return { atual, aportado, resultado: atual - aportado, posicoes: itens.length };
  }, [posicoes.data, dolarCotacao]);

  const reservaMesesNumero = Math.max(1, toNumber(reservaMeses));
  const reservaValorMensalNumero = gastoProjetadoMes;
  const reservaMeta = reservaValorMensalNumero * reservaMesesNumero;
  const reservaPercentual = reservaMeta > 0 ? Math.min(100, (reserva.atual / reservaMeta) * 100) : 0;
  const reservaFalta = Math.max(reservaMeta - reserva.atual, 0);

  function abrirCompra(tipo?: TipoAtivo) {
    setCompraTipoInicial(tipo);
    setCompraOpen(true);
  }

  function fecharCompra() {
    setCompraOpen(false);
    setCompraTipoInicial(undefined);
  }

  async function confirmarExclusaoMovimento() {
    if (!deleteMovimento) return;
    setDeleteMovimentoError("");
    try {
      await excluirMovimento.mutateAsync(deleteMovimento.id);
      setDeleteMovimento(null);
    } catch (error) {
      setDeleteMovimentoError(error instanceof Error ? error.message : "Nao foi possivel excluir a operacao.");
    }
  }

  const resultadoTitle = cards.lucro < 0 ? "Prejuizo" : "Lucro";

  return (
    <div className="space-y-2">
      <PageHeader
        title="Investimentos"
        description="Compras, vendas e cotacoes da carteira atual."
        actions={
          <>
            <Button onClick={() => abrirCompra()}>
              <TrendingUp className="h-4 w-4" />
              Comprar/Aportar
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedSell(null);
                setVendaOpen(true);
              }}
            >
              <TrendingDown className="h-4 w-4" />
              Vender/Resgatar
            </Button>
            <Button
              variant="secondary"
              disabled={atualizarCotacoes.isPending}
              onClick={() => atualizarCotacoes.mutateAsync().catch((error) => alert(error instanceof Error ? error.message : "Nao foi possivel atualizar cotacoes."))}
            >
              <RefreshCw className={atualizarCotacoes.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Atualizar
            </Button>
          </>
        }
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyCard title="Patrimônio investido" value={cards.atual} subtitle="Valor atual em BRL" tone="green" />
        <MoneyCard title="Valor aportado" value={cards.aportado} subtitle="Custo ainda em posição" tone="blue" />
        <MoneyCard title={resultadoTitle} value={cards.lucro} subtitle="Resultado aberto" tone={cards.lucro < 0 ? "red" : "green"} />
        <MoneyCard title="Dividendos no ano" value={cards.dividendosAno} subtitle="Proventos registrados" tone="yellow" />
      </div>
      <SectionCard
        title="Reserva de emergencia"
        description="Meta calculada pelo gasto planejado do mes e pela quantidade de meses desejada."
        className="border-lime-500/25 bg-gradient-to-r from-lime-500/10 via-[#111821] to-[#111821]"
        action={
          <Button size="sm" onClick={() => abrirCompra("RESERVA_EMERGENCIA")}>
            <ShieldCheck className="h-4 w-4" />
            Aportar reserva
          </Button>
        }
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.8fr)_1fr] xl:items-center">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-500">Gasto mensal base</span>
              <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2">
                <p className="text-sm font-semibold text-slate-100">{formatMoney(reservaValorMensalNumero)}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {planejamento.isFetching ? "Atualizando pelo orcamento..." : "Automatico pelo planejamento de gastos do mes."}
                </p>
              </div>
            </div>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">Meses de cobertura</span>
              <Input type="number" min="1" max="60" value={reservaMeses} onChange={(event) => setReservaMeses(event.target.value)} />
            </label>
          </div>
          <div className="space-y-2 rounded-md border border-lime-500/20 bg-slate-950/35 p-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <GroupMetric label="Meta">{formatMoney(reservaMeta)}</GroupMetric>
              <GroupMetric label="Guardado" tone="green">{formatMoney(reserva.atual)}</GroupMetric>
              <GroupMetric label="Falta" tone={reservaFalta > 0 ? "yellow" : "green"}>{formatMoney(reservaFalta)}</GroupMetric>
              <GroupMetric label="Progresso" tone="green">{formatPercent(reservaPercentual)}</GroupMetric>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-lime-400 transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, reservaPercentual))}%` }} />
            </div>
            <p className="text-xs text-slate-500">
              Usando {formatMoney(reservaValorMensalNumero)} por mes por {reservaMesesNumero.toLocaleString("pt-BR")} mes{reservaMesesNumero === 1 ? "" : "es"}.
            </p>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Carteira por classe" description={`${posicoes.data?.length ?? 0} posicao${(posicoes.data?.length ?? 0) === 1 ? "" : "es"} em aberto.`}>
        {(posicoes.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Nenhum ativo em carteira"
            description="Use Registrar investimento para criar a primeira posicao."
          />
        ) : (
          <div className="space-y-2">
            {grupos.map(([tipo, itens]) => {
              const totalBrl = itens.reduce((acc, item) => acc + posicaoToBrl(item, "valor_atual"), 0);
              const aportadoBrl = itens.reduce((acc, item) => acc + posicaoToBrl(item, "valor_total_aportado"), 0);
              const resultadoBrl = itens.reduce((acc, item) => acc + posicaoToBrl(item, "lucro_prejuizo"), 0);
              const dividendosBrl = itens.reduce((acc, item) => acc + valorPosicaoToBrl(item, item.dividendos_recebidos), 0);
              const resultadoComDividendosBrl = itens.reduce((acc, item) => acc + valorPosicaoToBrl(item, item.lucro_prejuizo_com_dividendos ?? item.lucro_prejuizo), 0);
              const rentabilidade = aportadoBrl > 0 ? (resultadoBrl / aportadoBrl) * 100 : 0;
              const rentabilidadeComDividendos = aportadoBrl > 0 ? (resultadoComDividendosBrl / aportadoBrl) * 100 : 0;
              const mostraDividendos = supportsDividendos(tipo);
              const visual = groupVisual(tipo);
              return (
                <div key={tipo} className={`group overflow-hidden rounded-md border bg-[#101720]/80 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-600 hover:shadow-lg hover:shadow-slate-950/30 ${visual.border}`}>
                  <div className={`relative grid gap-3 border-b border-slate-800 px-3 py-2.5 xl:grid-cols-[minmax(180px,1fr)_auto] xl:items-center ${visual.header}`}>
                    <div className={`absolute left-0 top-0 h-full w-1 ${visual.bar}`} />
                    <div className="min-w-0 pl-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${visual.bar}`} />
                        <p className={`truncate text-sm font-semibold ${visual.accent}`}>{INVESTMENT_TYPE_LABELS[tipo]}</p>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">{itens.length} posicao{itens.length === 1 ? "" : "es"}</p>
                    </div>
                    <div className={mostraDividendos ? "grid gap-2 sm:grid-cols-3 xl:grid-cols-6" : "grid gap-2 sm:grid-cols-2 xl:grid-cols-4"}>
                      <GroupMetric label="Aportado">{formatMoney(aportadoBrl)}</GroupMetric>
                      <GroupMetric label="Atual">{formatMoney(totalBrl)}</GroupMetric>
                      <GroupMetric label={resultadoBrl < 0 ? "Prejuizo" : "Lucro"} tone={resultadoBrl < 0 ? "red" : "green"}>{formatMoney(resultadoBrl)}</GroupMetric>
                      <GroupMetric label="Rentab." tone={resultadoBrl < 0 ? "red" : "green"}>{formatPercent(rentabilidade)}</GroupMetric>
                      {mostraDividendos && <GroupMetric label="Dividendos" tone="yellow">{formatMoney(dividendosBrl)}</GroupMetric>}
                      {mostraDividendos && (
                        <GroupMetric label="Retorno total" tone={resultadoComDividendosBrl < 0 ? "red" : "green"}>
                          {formatPercent(rentabilidadeComDividendos)}
                        </GroupMetric>
                      )}
                    </div>
                  </div>
                  <AtivosTable
                    posicoes={itens}
                    dolarCotacao={dolarCotacao}
                    showDividendos={mostraDividendos}
                    onSell={(posicao) => {
                      setSelectedSell(posicao);
                      setVendaOpen(true);
                    }}
                    onFetchPrice={async (posicao) => {
                      await api.buscarCotacaoAtivo(posicao.ativo_id);
                      await queryClient.invalidateQueries({ queryKey: ["posicoes"] });
                    }}
                    onUpdatePrice={async (posicao, preco) => {
                      await api.atualizarCotacaoAtivo(posicao.ativo_id, preco);
                      await queryClient.invalidateQueries({ queryKey: ["posicoes"] });
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
      <SectionCard
        title="Operacoes de investimento"
        description="Historico de compras, vendas, aportes e resgates. Edicoes aqui atualizam a carteira e o extrato dolar vinculado."
      >
        {(movimentos.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<History className="h-6 w-6" />}
            title="Nenhuma operacao registrada"
            description="Compras e vendas de ativos aparecerao aqui para edicao ou exclusao."
          />
        ) : (
          <Table className="min-w-[980px]">
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Operacao</Th>
                <Th>Ativo</Th>
                <Th>Classe</Th>
                <Th>Conta/corretora</Th>
                <Th className="text-right">Quantidade</Th>
                <Th className="text-right">Preco</Th>
                <Th className="text-right">Total</Th>
                <Th className="w-[84px] text-center">Acoes</Th>
              </tr>
            </thead>
            <tbody>
              {(movimentos.data ?? []).map((movimento) => {
                const entrada = ["COMPRA", "APORTE", "AJUSTE"].includes(movimento.tipo_movimento);
                return (
                  <tr key={movimento.id}>
                    <Td>{formatDate(movimento.data_movimento)}</Td>
                    <Td>
                      <span className={entrada ? "rounded border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-xs font-semibold text-brand-400" : "rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-300"}>
                        {movimentoLabel(movimento.tipo_movimento)}
                      </span>
                    </Td>
                    <Td>
                      <p className="font-semibold text-slate-100">{movimento.ticker}</p>
                      <p className="text-xs text-slate-500">{movimento.nome}</p>
                    </Td>
                    <Td>{INVESTMENT_TYPE_LABELS[movimento.tipo_ativo] ?? movimento.tipo_ativo}</Td>
                    <Td>{[movimento.conta_nome, movimento.corretora].filter(Boolean).join(" / ") || "-"}</Td>
                    <Td className="text-right">{movimento.tipo_controle === "VALOR" ? "-" : formatQuantity(movimento.quantidade ?? 0)}</Td>
                    <Td className="text-right">{movimento.tipo_controle === "VALOR" ? "-" : formatMoney(movimento.preco_unitario, movimento.moeda)}</Td>
                    <Td className="text-right font-semibold text-slate-100">{formatMoney(movimento.valor_financeiro, movimento.moeda)}</Td>
                    <Td className="text-center">
                      <div className="inline-flex items-center gap-1">
                        <Button size="icon" variant="secondary" title="Editar operacao" aria-label="Editar operacao" onClick={() => setEditingMovimento(movimento)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Excluir operacao"
                          aria-label="Excluir operacao"
                          onClick={() => {
                            setDeleteMovimentoError("");
                            setDeleteMovimento(movimento);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </SectionCard>
      <CompraAtivoModal open={compraOpen} initialTipoAtivo={compraTipoInicial} onClose={fecharCompra} onSubmit={(payload) => comprar.mutateAsync(payload).then(() => undefined)} />
      <VendaAtivoModal
        open={vendaOpen}
        posicoes={posicoes.data ?? []}
        selected={selectedSell}
        onClose={() => setVendaOpen(false)}
        onSubmit={(payload) => vender.mutateAsync(payload).then(() => undefined)}
      />
      <MovimentoInvestimentoDialog
        movimento={editingMovimento}
        onClose={() => setEditingMovimento(null)}
        onSubmit={(id, payload) => atualizarMovimento.mutateAsync({ id, payload }).then(() => undefined)}
      />
      <Dialog open={deleteMovimento !== null} title="Excluir operacao" onClose={() => setDeleteMovimento(null)}>
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            A operacao sera removida da carteira. Se ela tiver extrato dolar ou lancamento BRL vinculado, ele sera ajustado junto.
          </p>
          {deleteMovimento && (
            <div className="rounded-md border border-slate-800 bg-slate-950/45 p-3 text-sm">
              <p className="font-semibold text-slate-100">
                {movimentoLabel(deleteMovimento.tipo_movimento)} {deleteMovimento.ticker}
              </p>
              <p className="mt-1 text-slate-400">
                {formatDate(deleteMovimento.data_movimento)} · {formatMoney(deleteMovimento.valor_financeiro, deleteMovimento.moeda)}
              </p>
            </div>
          )}
          {deleteMovimentoError && <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs font-medium text-red-300">{deleteMovimentoError}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteMovimento(null)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={excluirMovimento.isPending} onClick={confirmarExclusaoMovimento}>
              Excluir
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
