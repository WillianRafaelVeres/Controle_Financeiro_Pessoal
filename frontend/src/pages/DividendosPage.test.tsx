import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    cleanup();
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
    vi.spyOn(api, "contas").mockResolvedValue([
      {
        id: "conta-1",
        nome: "Conta rendimento",
        saldo_inicial: 0,
        saldo_atual_informado: 0,
        conta_gasto: true,
        entra_no_saldo_em_contas: true,
        ativa: true,
        moeda: "BRL",
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
    vi.spyOn(api, "criarDividendo").mockResolvedValue({
      id: "div-juros",
      ativo_id: null,
      tipo_provento: "JUROS_RENDA_FIXA",
      data_recebimento: "2026-07-03",
      valor: 12.34,
      moeda: "BRL",
      valor_brl: 12.34,
      conta_destino_id: "conta-1",
      observacao: "Juros da conta",
    });
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

  it("registra juros da conta sem ativo", async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText("Origem"), { target: { value: "JUROS_CONTA" } });
    fireEvent.change(await screen.findByLabelText("Conta"), { target: { value: "conta-1" } });
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "12,34" } });
    fireEvent.change(screen.getByPlaceholderText("Ex.: rendimento Nubank"), { target: { value: "Juros Nubank" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() => {
      expect(api.criarDividendo).toHaveBeenCalledWith(
        expect.objectContaining({
          ativo_id: null,
          conta_destino_id: "conta-1",
          moeda: "BRL",
          observacao: "Juros Nubank",
          tipo_provento: "JUROS_RENDA_FIXA",
          valor: 12.34,
        }),
        expect.anything(),
      );
    });
  });
});
