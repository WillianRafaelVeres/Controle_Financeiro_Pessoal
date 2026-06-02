import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { DividendosPage } from "./DividendosPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DividendosPage />
    </QueryClientProvider>,
  );
}

describe("DividendosPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "ativosDividendos").mockResolvedValue([
      {
        id: "ativo-1",
        ticker: "IVV",
        nome: "iShares Core S&P 500",
        tipo_ativo: "EXTERIOR",
        moeda: "USD",
        corretora: "Inter",
      },
    ]);
    vi.spyOn(api, "dividendos").mockResolvedValue([
      {
        id: "div-1",
        ativo_id: "ativo-1",
        tipo_provento: "DIVIDENDO",
        data_recebimento: "2026-05-02",
        valor: "0.01",
        moeda: "USD",
        valor_brl: "0.05",
      },
    ]);
  });

  it("mostra coluna de acoes com editar e excluir no historico", async () => {
    renderPage();

    expect(await screen.findByRole("columnheader", { name: "Acoes" })).toBeInTheDocument();
    const ativo = await screen.findByText("IVV");
    const row = ativo.closest("tr");

    expect(row).not.toBeNull();
    expect(within(row!).getByRole("button", { name: /editar dividendo/i })).toBeInTheDocument();
    expect(within(row!).getByRole("button", { name: /excluir dividendo/i })).toBeInTheDocument();
  });
});
