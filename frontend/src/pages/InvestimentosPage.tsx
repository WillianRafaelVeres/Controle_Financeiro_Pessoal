import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "../components/finance/EmptyState";
import { MoneyCard } from "../components/finance/MoneyCard";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { AtivosTable } from "../features/investimentos/AtivosTable";
import { CompraAtivoModal } from "../features/investimentos/CompraAtivoModal";
import { VendaAtivoModal } from "../features/investimentos/VendaAtivoModal";
import { api } from "../lib/api";
import { toNumber } from "../lib/formatters";
import type { Posicao } from "../lib/types";

export function InvestimentosPage() {
  const queryClient = useQueryClient();
  const posicoes = useQuery({ queryKey: ["posicoes"], queryFn: api.posicoes });
  const dividendos = useQuery({ queryKey: ["dividendos"], queryFn: api.dividendos });
  const comprar = useMutation({ mutationFn: api.comprar, onSuccess: () => queryClient.invalidateQueries() });
  const vender = useMutation({ mutationFn: api.vender, onSuccess: () => queryClient.invalidateQueries() });
  const atualizarCotacoes = useMutation({
    mutationFn: api.atualizarCotacoesInvestimentos,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posicoes"] }),
  });
  const [compraOpen, setCompraOpen] = useState(false);
  const [vendaOpen, setVendaOpen] = useState(false);
  const [selectedSell, setSelectedSell] = useState<Posicao | null>(null);

  const cards = useMemo(() => {
    const lista = posicoes.data ?? [];
    const aportado = lista.reduce((acc, item) => acc + toNumber(item.valor_total_aportado), 0);
    const atual = lista.reduce((acc, item) => acc + toNumber(item.valor_atual), 0);
    const lucro = lista.reduce((acc, item) => acc + toNumber(item.lucro_prejuizo), 0);
    const anoAtual = new Date().getFullYear();
    const dividendosAno = (dividendos.data ?? [])
      .filter((item) => new Date(item.data_recebimento).getFullYear() === anoAtual)
      .reduce((acc, item) => acc + toNumber(item.valor), 0);
    return { aportado, atual, lucro, dividendosAno };
  }, [posicoes.data, dividendos.data]);

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
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyCard title="Patrimônio investido" value={cards.atual} subtitle="Valor atual informado" tone="green" />
        <MoneyCard title="Valor aportado" value={cards.aportado} subtitle="Custo ainda em posição" tone="blue" />
        <MoneyCard title="Lucro/prejuízo" value={cards.lucro} subtitle="Marcação manual" tone={cards.lucro < 0 ? "red" : "green"} />
        <MoneyCard title="Dividendos no ano" value={cards.dividendosAno} subtitle="Proventos registrados" tone="yellow" />
      </div>
      <SectionCard title="Tabela de posições">
        {(posicoes.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Nenhum ativo em carteira"
            description="Use Comprar ativo para criar o ticker automaticamente e registrar a primeira posição."
          />
        ) : (
          <AtivosTable
            posicoes={posicoes.data ?? []}
            onSell={(posicao) => {
              setSelectedSell(posicao);
              setVendaOpen(true);
            }}
            onUpdatePrice={async (posicao, preco) => {
              await api.atualizarCotacaoAtivo(posicao.ativo_id, preco);
              await queryClient.invalidateQueries({ queryKey: ["posicoes"] });
            }}
            onFetchPrice={async (posicao) => {
              await api.buscarCotacaoAtivo(posicao.ativo_id);
              await queryClient.invalidateQueries({ queryKey: ["posicoes"] });
            }}
          />
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
