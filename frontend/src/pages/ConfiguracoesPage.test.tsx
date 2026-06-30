import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { ConfiguracoesPage } from "./ConfiguracoesPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfiguracoesPage />
    </QueryClientProvider>,
  );
}

describe("ConfiguracoesPage", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(api, "categorias").mockResolvedValue([
      { id: "cat-gasto", nome: "Moradia", natureza: "GASTO", ativa: true },
      { id: "cat-invest", nome: "Investimentos", natureza: "INVESTIMENTO", ativa: true },
    ]);
    vi.spyOn(api, "subcategorias").mockResolvedValue([
      { id: "sub-gasto", nome: "Aluguel", categoria_id: "cat-gasto", natureza: "GASTO", ativa: true },
      { id: "sub-invest", nome: "Acao BR", categoria_id: "cat-invest", natureza: "INVESTIMENTO", ativa: true },
    ]);
    vi.spyOn(api, "metodos").mockResolvedValue([]);
    vi.spyOn(api, "contas").mockResolvedValue([]);
    vi.spyOn(api, "cartoes").mockResolvedValue([]);
    vi.spyOn(api, "diagnostico").mockResolvedValue({
      status: "ok",
      desktop: false,
      banco: "db",
      pasta_dados: "dados",
      pasta_logs: "logs",
      pasta_backups: "backups",
    });
  });

  it("nao mostra categorias e subcategorias de investimento nas configuracoes", async () => {
    renderPage();

    expect(await screen.findByText("Moradia")).toBeInTheDocument();
    expect(screen.getByText("Aluguel")).toBeInTheDocument();
    expect(screen.queryByText("Investimentos")).not.toBeInTheDocument();
    expect(screen.queryByText("Acao BR")).not.toBeInTheDocument();
  });
});
