import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "../components/finance/EmptyState";
import { MoneyCard } from "../components/finance/MoneyCard";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { AtivosTable } from "../features/investimentos/AtivosTable";
import { CompraAtivoModal } from "../features/investimentos/CompraAtivoModal";
import { VendaAtivoModal } from "../features/investimentos/VendaAtivoModal";
import { api } from "../lib/api";
import { formatMoney, toNumber } from "../lib/formatters";
import { INVESTMENT_TYPE_LABELS, INVESTMENT_TYPE_OPTIONS } from "../lib/investmentProfiles";
import type { Posicao, TipoAtivo } from "../lib/types";

function groupVisual(tipo: TipoAtivo) {
  if (tipo === "ACAO_BR") return { border: "border-blue-500/30", header: "bg-blue-500/10", accent: "text-blue-300", bar: "bg-blue-500" };
  if (tipo === "FII") return { border: "border-brand-500/30", header: "bg-brand-500/10", accent: "text-brand-400", bar: "bg-brand-500" };
  if (tipo === "ETF_BR") return { border: "border-cyan-500/30", header: "bg-cyan-500/10", accent: "text-cyan-300", bar: "bg-cyan-500" };
  if (tipo === "EXTERIOR") return { border: "border-amber-500/30", header: "bg-amber-500/10", accent: "text-amber-300", bar: "bg-amber-500" };
  if (tipo === "CRIPTO") return { border: "border-yellow-500/30", header: "bg-yellow-500/10", accent: "text-yellow-300", bar: "bg-yellow-500" };
  if (tipo === "RENDA_FIXA") return { border: "border-emerald-500/30", header: "bg-emerald-500/10", accent: "text-emerald-300", bar: "bg-emerald-500" };
  if (tipo === "PREVIDENCIA") return { border: "border-purple-500/30", header: "bg-purple-500/10", accent: "text-purple-300", bar: "bg-purple-500" };
  return { border: "border-slate-700", header: "bg-slate-900", accent: "text-slate-300", bar: "bg-slate-500" };
}

export function InvestimentosPage() {
  const queryClient = useQueryClient();
  const posicoes = useQuery({ queryKey: ["posicoes"], queryFn: api.posicoes });
  const dividendos = useQuery({ queryKey: ["dividendos"], queryFn: api.dividendos });
  const cotacaoDolar = useQuery({ queryKey: ["dolar-cotacao-atual"], queryFn: api.dolarCotacaoAtual, refetchInterval: 60_000, retry: false });
  const cotacoesAutomaticas = useQuery({
    queryKey: ["investimentos-cotacoes-auto"],
    queryFn: api.atualizarCotacoesInvestimentos,
    refetchInterval: 60_000,
    retry: false,
  });
  const comprar = useMutation({ mutationFn: api.comprar, onSuccess: () => queryClient.invalidateQueries() });
  const vender = useMutation({ mutationFn: api.vender, onSuccess: () => queryClient.invalidateQueries() });
  const atualizarCotacoes = useMutation({
    mutationFn: api.atualizarCotacoesInvestimentos,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posicoes"] }),
  });
  const [compraOpen, setCompraOpen] = useState(false);
  const [vendaOpen, setVendaOpen] = useState(false);
  const [selectedSell, setSelectedSell] = useState<Posicao | null>(null);
  const dolarCotacao = toNumber(cotacaoDolar.data?.cotacao_brl);

  useEffect(() => {
    if (!cotacoesAutomaticas.dataUpdatedAt) return;
    queryClient.invalidateQueries({ queryKey: ["posicoes"] });
  }, [cotacoesAutomaticas.dataUpdatedAt, queryClient]);

  function posicaoToBrl(item: Posicao, field: "valor_atual" | "valor_total_aportado" | "lucro_prejuizo") {
    const value = toNumber(item[field]);
    return item.moeda === "USD" && dolarCotacao > 0 ? value * dolarCotacao : value;
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
      .reduce((acc, item) => acc + toNumber(item.valor), 0);
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

  const resultadoTitle = cards.lucro < 0 ? "Prejuizo" : "Lucro";

  return (
    <div className="space-y-2">
      <PageHeader
        title="Investimentos"
        description="Posições atuais, compras, vendas e ajustes sem tratar ativos no exterior como BDR."
        actions={
          <>
            <Button onClick={() => setCompraOpen(true)}>
              <TrendingUp className="h-4 w-4" />
              Comprar ativo
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedSell(null);
                setVendaOpen(true);
              }}
            >
              <TrendingDown className="h-4 w-4" />
              Vender ativo
            </Button>
            <Button
              variant="secondary"
              disabled={atualizarCotacoes.isPending}
              onClick={() => atualizarCotacoes.mutateAsync().catch((error) => alert(error instanceof Error ? error.message : "Nao foi possivel atualizar cotacoes."))}
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar cotações
            </Button>
          </>
        }
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <MoneyCard title="Patrimônio investido" value={cards.atual} subtitle="Valor atual em BRL" tone="green" />
        <MoneyCard title="Valor aportado" value={cards.aportado} subtitle="Custo ainda em posição" tone="blue" />
        <MoneyCard title="Exterior em reais" value={cards.exteriorBrl} subtitle={dolarCotacao > 0 ? "Convertido pela cotacao atual" : "Sem cotacao USD/BRL"} tone="blue" />
        <MoneyCard title={resultadoTitle} value={cards.lucro} subtitle="Marcado por cotacao" tone={cards.lucro < 0 ? "red" : "green"} />
        <MoneyCard title="Dividendos no ano" value={cards.dividendosAno} subtitle="Proventos registrados" tone="yellow" />
      </div>
      <SectionCard title="Posicoes por tipo">
        {(posicoes.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Nenhum ativo em carteira"
            description="Use Comprar ativo para criar o ticker automaticamente e registrar a primeira posição."
          />
        ) : (
          <div className="space-y-3">
            {grupos.map(([tipo, itens]) => {
              const totalBrl = itens.reduce((acc, item) => acc + posicaoToBrl(item, "valor_atual"), 0);
              const aportadoBrl = itens.reduce((acc, item) => acc + posicaoToBrl(item, "valor_total_aportado"), 0);
              const resultadoBrl = itens.reduce((acc, item) => acc + posicaoToBrl(item, "lucro_prejuizo"), 0);
              const visual = groupVisual(tipo);
              return (
                <div key={tipo} className={`overflow-hidden rounded-md border ${visual.border}`}>
                  <div className={`relative flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-3 py-3 ${visual.header}`}>
                    <div className={`absolute left-0 top-0 h-full w-1 ${visual.bar}`} />
                    <div className="pl-2">
                      <p className={`text-base font-semibold ${visual.accent}`}>{INVESTMENT_TYPE_LABELS[tipo]}</p>
                      <p className="text-xs text-slate-500">{itens.length} posicao{itens.length === 1 ? "" : "es"}</p>
                    </div>
                    <div className="grid min-w-[360px] flex-1 gap-2 text-right sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] font-medium uppercase text-slate-500">Aportado</p>
                        <p className="font-semibold text-slate-100">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(aportadoBrl)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium uppercase text-slate-500">Atual</p>
                        <p className="font-semibold text-slate-100">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalBrl)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium uppercase text-slate-500">{resultadoBrl < 0 ? "Prejuizo" : "Lucro"}</p>
                        <p className={resultadoBrl < 0 ? "font-semibold text-danger-600" : "font-semibold text-brand-400"}>
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(resultadoBrl)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <AtivosTable
                    posicoes={itens}
                    dolarCotacao={dolarCotacao}
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
      <CompraAtivoModal open={compraOpen} onClose={() => setCompraOpen(false)} onSubmit={(payload) => comprar.mutateAsync(payload).then(() => undefined)} />
      <VendaAtivoModal
        open={vendaOpen}
        posicoes={posicoes.data ?? []}
        selected={selectedSell}
        onClose={() => setVendaOpen(false)}
        onSubmit={(payload) => vender.mutateAsync(payload).then(() => undefined)}
      />
    </div>
  );
}
