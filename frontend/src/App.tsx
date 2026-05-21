import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { AppShell } from "./components/layout/AppShell";
import { BackendBootGate } from "./components/layout/BackendBootGate";
import type { BackendBootResult } from "./lib/apiBase";
import { CartoesPage } from "./pages/CartoesPage";
import { ConfiguracoesPage } from "./pages/ConfiguracoesPage";
import { ContasFuturasPage } from "./pages/ContasFuturasPage";
import { ContasPage } from "./pages/ContasPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DividendosPage } from "./pages/DividendosPage";
import { ExteriorDolarPage } from "./pages/ExteriorDolarPage";
import { IntegracoesPage } from "./pages/IntegracoesPage";
import { InvestimentosPage } from "./pages/InvestimentosPage";
import { LancamentosPage } from "./pages/LancamentosPage";
import { OrcamentoPage } from "./pages/OrcamentoPage";
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
  orcamento: "Orçamento",
  cartoes: "Cartões",
  investimentos: "Investimentos",
  dividendos: "Dividendos",
  exterior: "Exterior/Dólar",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
  integracoes: "Integrações",
};

function CurrentPage({ page }: { page: PageKey }) {
  switch (page) {
    case "lancamentos":
      return <LancamentosPage />;
    case "contas":
      return <ContasPage />;
    case "contas_futuras":
      return <ContasFuturasPage />;
    case "orcamento":
      return <OrcamentoPage />;
    case "cartoes":
      return <CartoesPage />;
    case "investimentos":
      return <InvestimentosPage />;
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
      return <DashboardPage />;
  }
}

export default function App() {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [boot, setBoot] = useState<BackendBootResult | null>(null);
  const handleReady = useCallback((result: BackendBootResult) => setBoot(result), []);
  const backendStatus = boot?.port ? `Serviço local em 127.0.0.1:${boot.port}` : "SQLite local";

  return (
    <BackendBootGate onReady={handleReady}>
      <QueryClientProvider client={queryClient}>
        <AppShell
          current={page}
          onNavigate={setPage}
          title={pageTitles[page]}
          backendStatus={backendStatus}
          onNewLancamento={() => setPage("lancamentos")}
        >
          <CurrentPage key={page} page={page} />
        </AppShell>
      </QueryClientProvider>
    </BackendBootGate>
  );
}
