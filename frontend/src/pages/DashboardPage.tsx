import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, DollarSign, Plus, TrendingUp } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "../components/finance/EmptyState";
import { SectionCard } from "../components/finance/SectionCard";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { ConciliacaoBox } from "../features/dashboard/ConciliacaoBox";
import { DashboardCards } from "../features/dashboard/DashboardCards";
import { GraficosResumo } from "../features/dashboard/GraficosResumo";
import { DividendosForm } from "../features/investimentos/DividendosForm";
import { LancamentoForm } from "../features/lancamentos/LancamentoForm";
import { api } from "../lib/api";
import { toNumber } from "../lib/formatters";
import type { TipoLancamento } from "../lib/types";
import { currentMonth } from "../lib/utils";
import { DolarActionDialog, type ActionType } from "./ExteriorDolarPage";

type QuickLaunch = "novo" | "investimento";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const month = currentMonth();
  const resumo = useQuery({ queryKey: ["painel", "resumo", month], queryFn: () => api.painelResumo(month.ano, month.mes) });
  const conciliacao = useQuery({ queryKey: ["dashboard", "conciliacao"], queryFn: api.conciliacao });
  const graficos = useQuery({ queryKey: ["dashboard", "graficos", month], queryFn: () => api.dashboardGraficos(month.ano, month.mes) });
  const categorias = useQuery({ queryKey: ["categorias", "dashboard"], queryFn: () => api.categorias(undefined, true) });
  const subcategorias = useQuery({ queryKey: ["subcategorias", "dashboard"], queryFn: () => api.subcategorias(undefined, true) });
  const metodos = useQuery({ queryKey: ["metodos", "dashboard"], queryFn: api.metodos });
  const cartoes = useQuery({ queryKey: ["cartoes", "dashboard"], queryFn: api.cartoes });
  const ativosDividendos = useQuery({ queryKey: ["ativos-dividendos", "dashboard"], queryFn: api.ativosDividendos });
  const cotacaoDolar = useQuery({ queryKey: ["dolar-cotacao-atual"], queryFn: api.dolarCotacaoAtual, retry: false });

  const criarLancamento = useMutation({ mutationFn: api.criarLancamento, onSuccess: () => queryClient.invalidateQueries() });
  const criarCategoria = useMutation({ mutationFn: api.criarCategoria, onSuccess: () => queryClient.invalidateQueries() });
  const criarSubcategoria = useMutation({ mutationFn: api.criarSubcategoria, onSuccess: () => queryClient.invalidateQueries() });
  const criarMetodo = useMutation({ mutationFn: api.criarMetodo, onSuccess: () => queryClient.invalidateQueries() });
  const criarContaFutura = useMutation({ mutationFn: api.criarContaFutura, onSuccess: () => queryClient.invalidateQueries() });
  const criarDividendo = useMutation({ mutationFn: api.criarDividendo, onSuccess: () => queryClient.invalidateQueries() });
  const movimentoDolar = useMutation({ mutationFn: api.dolarMovimento, onSuccess: () => queryClient.invalidateQueries() });

  const [quickLaunch, setQuickLaunch] = useState<QuickLaunch | null>(null);
  const [dividendoOpen, setDividendoOpen] = useState(false);
  const [dolarAction, setDolarAction] = useState<ActionType | null>(null);

  const initialType: TipoLancamento = quickLaunch === "investimento" ? "INVESTIMENTO" : "GASTO";
  const launchTitle = quickLaunch === "investimento" ? "Registrar investimento" : "Novo lancamento";

  return (
    <div className="space-y-2">
      <DashboardCards resumo={resumo.data} />
      <div className="grid items-start gap-2 xl:grid-cols-[minmax(320px,1fr)_minmax(320px,1fr)]">
        <ConciliacaoBox data={conciliacao.data} />
        <SectionCard title="Acoes rapidas" description="Atalhos operacionais para o dia a dia." className="self-start">
          <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
            <Button className="h-8 whitespace-nowrap px-2.5" aria-label="Novo lancamento" onClick={() => setQuickLaunch("novo")}>
              <Plus className="h-4 w-4" />
              Lancamento
            </Button>
            <Button className="h-8 whitespace-nowrap px-2.5" variant="secondary" aria-label="Registrar investimento" onClick={() => setQuickLaunch("investimento")}>
              <TrendingUp className="h-4 w-4" />
              Investimento
            </Button>
            <Button className="h-8 whitespace-nowrap px-2.5" variant="secondary" aria-label="Registrar dividendo" onClick={() => setDividendoOpen(true)}>
              <Banknote className="h-4 w-4" />
              Dividendo
            </Button>
            <Button className="h-8 whitespace-nowrap px-2.5" variant="secondary" aria-label="Enviar dolar" onClick={() => setDolarAction("ENVIO")}>
              <DollarSign className="h-4 w-4" />
              Dolar
            </Button>
          </div>
        </SectionCard>
      </div>
      <SectionCard title="Resumo do mes atual" description="Este bloco usa o mes corrente automaticamente e nao controla o restante do app.">
        <GraficosResumo data={graficos.data} />
      </SectionCard>

      <Dialog open={quickLaunch !== null} title={launchTitle} onClose={() => setQuickLaunch(null)} className="max-w-6xl">
        {quickLaunch && (
          <LancamentoForm
            key={quickLaunch}
            categorias={categorias.data ?? []}
            subcategorias={subcategorias.data ?? []}
            metodos={metodos.data ?? []}
            cartoes={cartoes.data ?? []}
            initialType={initialType}
            allowInvestment={quickLaunch === "investimento"}
            lockType={quickLaunch === "investimento"}
            onSubmit={async (payload) => {
              await criarLancamento.mutateAsync(payload);
              setQuickLaunch(null);
            }}
            onCreateContaFutura={async (payload) => {
              await criarContaFutura.mutateAsync(payload);
              setQuickLaunch(null);
            }}
            onCreateCategoria={async (nome, natureza) => {
              const categoria = await criarCategoria.mutateAsync({ nome, natureza });
              return { id: categoria.id, label: categoria.nome };
            }}
            onCreateSubcategoria={async (nome, categoria_id) => {
              const subcategoria = await criarSubcategoria.mutateAsync({ nome, categoria_id });
              return { id: subcategoria.id, label: subcategoria.nome };
            }}
            onCreateMetodo={async (nome) => {
              const metodo = await criarMetodo.mutateAsync({ nome });
              return { id: metodo.id, label: metodo.nome };
            }}
          />
        )}
      </Dialog>

      <Dialog open={dividendoOpen} title="Registrar dividendo" onClose={() => setDividendoOpen(false)} className="max-w-3xl">
        {(ativosDividendos.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Banknote className="h-6 w-6" />}
            title="Nenhum ativo em carteira"
            description="Somente ativos com quantidade atual maior que zero aparecem na lista de dividendos."
          />
        ) : (
          <DividendosForm
            ativos={ativosDividendos.data ?? []}
            onSubmit={async (payload) => {
              await criarDividendo.mutateAsync(payload);
              setDividendoOpen(false);
            }}
          />
        )}
      </Dialog>

      <DolarActionDialog
        action={dolarAction}
        onClose={() => setDolarAction(null)}
        onMovimento={(payload) => movimentoDolar.mutateAsync(payload).then(() => undefined)}
        cotacaoAtual={toNumber(cotacaoDolar.data?.cotacao_brl)}
      />
    </div>
  );
}
