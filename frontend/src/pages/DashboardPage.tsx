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
import { CompraAtivoModal } from "../features/investimentos/CompraAtivoModal";
import { DividendosForm } from "../features/investimentos/DividendosForm";
import { NovoLancamentoModal } from "../features/lancamentos/NovoLancamentoModal";
import { api } from "../lib/api";
import { toNumber } from "../lib/formatters";
import { invalidateDollarData, invalidateInvestmentData } from "../lib/queryInvalidation";
import { currentMonth } from "../lib/utils";
import { DolarActionDialog, type ActionType } from "./ExteriorDolarPage";

export function DashboardPage({ onNewLancamento }: { onNewLancamento?: () => void }) {
  const queryClient = useQueryClient();
  const month = currentMonth();
  const [localLancamentoOpen, setLocalLancamentoOpen] = useState(false);
  const [compraAtivoOpen, setCompraAtivoOpen] = useState(false);
  const [dividendoOpen, setDividendoOpen] = useState(false);
  const [dolarAction, setDolarAction] = useState<ActionType | null>(null);
  const abrirLancamento = onNewLancamento ?? (() => setLocalLancamentoOpen(true));
  const resumo = useQuery({ queryKey: ["painel", "resumo", month], queryFn: () => api.painelResumo(month.ano, month.mes) });
  const graficos = useQuery({ queryKey: ["dashboard", "graficos", month], queryFn: () => api.dashboardGraficos(month.ano, month.mes) });
  const ativosDividendos = useQuery({ queryKey: ["ativos-dividendos", "dashboard"], queryFn: api.ativosDividendos, enabled: dividendoOpen });
  const cotacaoDolar = useQuery({ queryKey: ["dolar-cotacao-atual"], queryFn: api.dolarCotacaoAtual, enabled: Boolean(dolarAction), retry: false });

  const criarDividendo = useMutation({ mutationFn: api.criarDividendo, onSuccess: () => invalidateInvestmentData(queryClient) });
  const movimentoDolar = useMutation({ mutationFn: api.dolarMovimento, onSuccess: () => invalidateDollarData(queryClient) });
  const comprarAtivo = useMutation({ mutationFn: api.comprar, onSuccess: () => invalidateInvestmentData(queryClient) });

  return (
    <div className="space-y-3">
      <DashboardCards resumo={resumo.data} />

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(320px,1fr)_minmax(280px,0.82fr)]">
        <ConciliacaoBox data={resumo.data} />
        <SectionCard title="Ações rápidas" description="Registre as movimentações mais comuns." className="self-start">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button className="min-h-16 justify-center rounded-2xl text-sm shadow-[0_18px_42px_rgba(34,197,94,0.32)] sm:flex-col sm:gap-2" aria-label="Novo lancamento" onClick={abrirLancamento}>
              <Plus className="h-5 w-5" />
              Novo lançamento
            </Button>
            <Button variant="secondary" className="min-h-16 justify-center rounded-2xl border-cyan-300/25 bg-gradient-to-br from-cyan-500 to-blue-700 text-sm text-white shadow-[0_18px_42px_rgba(14,165,233,0.24)] hover:border-cyan-200/40 sm:flex-col sm:gap-2" aria-label="Registrar investimento" onClick={() => setCompraAtivoOpen(true)}>
              <TrendingUp className="h-5 w-5" />
              Investimento
            </Button>
            <Button variant="secondary" className="min-h-16 justify-center rounded-2xl border-blue-300/25 bg-gradient-to-br from-blue-500 to-sky-800 text-sm text-white shadow-[0_18px_42px_rgba(59,130,246,0.22)] hover:border-blue-200/40 sm:flex-col sm:gap-2" aria-label="Registrar dividendo" onClick={() => setDividendoOpen(true)}>
              <Banknote className="h-5 w-5" />
              Dividendo
            </Button>
            <Button variant="secondary" className="min-h-16 justify-center rounded-2xl border-red-300/25 bg-gradient-to-br from-red-500 to-rose-800 text-sm text-white shadow-[0_18px_42px_rgba(239,68,68,0.20)] hover:border-red-200/40 sm:flex-col sm:gap-2" aria-label="Enviar dolar" onClick={() => setDolarAction("ENVIO")}>
              <DollarSign className="h-5 w-5" />
              Dólar
            </Button>
          </div>
        </SectionCard>
      </div>

      <GraficosResumo data={graficos.data} />

      <NovoLancamentoModal open={localLancamentoOpen} onClose={() => setLocalLancamentoOpen(false)} />

      <CompraAtivoModal open={compraAtivoOpen} onClose={() => setCompraAtivoOpen(false)} onSubmit={(payload) => comprarAtivo.mutateAsync(payload).then(() => undefined)} />

      <Dialog open={dividendoOpen} title="Registrar dividendo" onClose={() => setDividendoOpen(false)} className="max-w-6xl">
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
