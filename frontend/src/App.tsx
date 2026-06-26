import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "./components/layout/AppShell";
import { BackendBootGate } from "./components/layout/BackendBootGate";
import { NovoLancamentoModal } from "./features/lancamentos/NovoLancamentoModal";
import type { BackendBootResult } from "./lib/apiBase";
import { getAccessToken, isSupabaseConfigured, signOut } from "./lib/supabase";
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
import { LoginPage } from "./pages/LoginPage";
import { OrcamentoPage } from "./pages/OrcamentoPage";
import { PatrimonioPage } from "./pages/PatrimonioPage";
import type { PageKey } from "./pages/pageTypes";
import { RelatoriosPage } from "./pages/RelatoriosPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function CurrentPage({ page, onNewLancamento }: { page: PageKey; onNewLancamento: () => void }) {
  switch (page) {
    case "lancamentos": return <LancamentosPage />;
    case "contas": return <ContasPage />;
    case "contas_futuras": return <ContasFuturasPage />;
    case "dinheiro_separado": return <DinheiroSeparadoPage />;
    case "orcamento": return <OrcamentoPage />;
    case "cartoes": return <CartoesPage />;
    case "patrimonio": return <PatrimonioPage />;
    case "investimentos": return <InvestimentosPage />;
    case "desempenho": return <DesempenhoPage />;
    case "dividendos": return <DividendosPage />;
    case "exterior": return <ExteriorDolarPage />;
    case "relatorios": return <RelatoriosPage />;
    case "configuracoes": return <ConfiguracoesPage />;
    case "integracoes": return <IntegracoesPage />;
    case "dashboard": default: return <DashboardPage onNewLancamento={onNewLancamento} />;
  }
}

type AuthState = "checking" | "authenticated" | "unauthenticated";

export default function App() {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [boot, setBoot] = useState<BackendBootResult | null>(null);
  const [novoLancamentoOpen, setNovoLancamentoOpen] = useState(false);
  const [authState, setAuthState] = useState<AuthState>(
    isSupabaseConfigured ? "checking" : "authenticated"
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getAccessToken().then((t) => setAuthState(t ? "authenticated" : "unauthenticated"));
  }, []);

  const handleReady = useCallback((result: BackendBootResult) => setBoot(result), []);
  const abrirNovoLancamento = useCallback(() => setNovoLancamentoOpen(true), []);
  const handleLogin = useCallback(() => setAuthState("authenticated"), []);
  const handleLogout = useCallback(async () => {
    await signOut();
    queryClient.clear();
    setAuthState("unauthenticated");
  }, []);

  const backendStatus = boot?.port ? `Servico local em 127.0.0.1:${boot.port}` : "SQLite local";

  if (authState === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07111f]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <BackendBootGate onReady={handleReady}>
      <QueryClientProvider client={queryClient}>
        <AppShell
          current={page}
          onNavigate={setPage}
          backendStatus={backendStatus}
          onNewLancamento={abrirNovoLancamento}
          onLogout={handleLogout}
        >
          <CurrentPage key={page} page={page} onNewLancamento={abrirNovoLancamento} />
        </AppShell>
        <NovoLancamentoModal open={novoLancamentoOpen} onClose={() => setNovoLancamentoOpen(false)} />
      </QueryClientProvider>
    </BackendBootGate>
  );
}
