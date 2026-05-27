import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { AppShell } from "./components/layout/AppShell";
import { BackendBootGate } from "./components/layout/BackendBootGate";
import { NovoLancamentoModal } from "./features/lancamentos/NovoLancamentoModal";
import type { BackendBootResult } from "./lib/apiBase";
import { CartoesPage } from "./pages/CartoesPage";
import { ConfiguracoesPage } from "./pages/ConfiguracoesPage";
import { ContasFuturasPage } from "./pages/ContasFuturasPage";
import { ContasPage } from "./pages/ContasPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DesempenhoPage } from "./pages/DesempenhoPage";
import { DinheiroSeparadoPage } from "./pages/DinheiroSeparadoPage";
import { DividendosPage } from "./pages/DividendosPage";
import { ExteriorDolarPage } from "./pages/ExteriorDolarPage";
import { IntegracoesPage } from "./pages/IntegracoesPage";
import { InvestimentosPage } from "./pages/InvestimentosPage";
import { LancamentosPage } from "./pages/LancamentosPage";
import { OrcamentoPage } from "./pages/OrcamentoPage";
import { PatrimonioPage } from "./pages/PatrimonioPage";
import type { PageKey } from "./pages/pageTypes";
import { RelatoriosPage } from "./pages/RelatoriosPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const pageTitles: Record<PageKey, string> = {
  dashboard: "Painel",
  lancamentos: "Lançamentos",
  contas: "Contas",
  contas_futuras: "Contas futuras",
  dinheiro_separado: "Dinheiro separado",
  orcamento: "Orçamento",
  cartoes: "Cartões",
  patrimonio: "Meu patrimônio",
  investimentos: "Investimentos",
  desempenho: "Desempenho",
  dividendos: "Dividendos",
  exterior: "Exterior/Dólar",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
  integracoes: "Integrações",
};

function CurrentPage({ page, onNewLancamento }: { page: PageKey; onNewLancamento: () => void }) {
  switch (page) {
    case "lancamentos":
      return <LancamentosPage />;
    case "contas":
      return <ContasPage />;
    case "contas_futuras":
      return <ContasFuturasPage />;
    case "dinheiro_separado":
      return <DinheiroSeparadoPage />;
    case "orcamento":
      return <OrcamentoPage />;
    case "cartoes":
      return <CartoesPage />;
    case "patrimonio":
      return <PatrimonioPage />;
    case "investimentos":
      return <InvestimentosPage />;
    case "desempenho":
      return <DesempenhoPage />;
    case "dividendos":
      return <DividendosPage />;
    case "exterior":
      return <ExteriorDolarPage />;
    case "relatorios":
      return <RelatoriosPage />;
    case "configuracoes":
      return <ConfiguracoesPage />;
    case "integracoes":
      return <IntegracoesPage />;
    case "dashboard":
    default:
      return <DashboardPage onNewLancamento={onNewLancamento} />;
  }
}

export default function App() {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [boot, setBoot] = useState<BackendBootResult | null>(null);
  const [novoLancamentoOpen, setNovoLancamentoOpen] = useState(false);
  const handleReady = useCallback((result: BackendBootResult) => setBoot(result), []);
  const abrirNovoLancamento = useCallback(() => setNovoLancamentoOpen(true), []);
  const backendStatus = boot?.port ? `Serviço local em 127.0.0.1:${boot.port}` : "SQLite local";

  return (
    <BackendBootGate onReady={handleReady}>
      <QueryClientProvider client={queryClient}>
        <AppShell
          current={page}
          onNavigate={setPage}
          title={pageTitles[page]}
          backendStatus={backendStatus}
          onNewLancamento={abrirNovoLancamento}
        >
          <CurrentPage key={page} page={page} onNewLancamento={abrirNovoLancamento} />
        </AppShell>
        <NovoLancamentoModal open={novoLancamentoOpen} onClose={() => setNovoLancamentoOpen(false)} />
      </QueryClientProvider>
    </BackendBootGate>
  );
}
