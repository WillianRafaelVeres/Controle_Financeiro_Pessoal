import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { ExteriorDolarPage } from "./ExteriorDolarPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExteriorDolarPage />
    </QueryClientProvider>,
  );
}

describe("ExteriorDolarPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "dolarResumo").mockResolvedValue({
      saldo_teorico_usd: 800,
      saldo_informado_usd: 800,
      diferenca_conciliacao_usd: 0,
      cotacao_brl: 5,
      valor_estimado_brl: 4000,
      total_brl_enviado: 5000,
      total_usd_recebido: 1000,
      dolar_medio: 5,
      status: "Conta dolar conciliada.",
    });
    vi.spyOn(api, "dolarExtrato").mockResolvedValue([
      {
        id: "ext-1",
        data_movimento: "2026-05-09",
        tipo: "COMPRA_EXTERIOR",
        descricao: "Compra AAPL",
        entrada_usd: 0,
        saida_usd: 200,
        valor_brl: 0,
        cotacao_efetiva: 0,
        saldo_acumulado_usd: 800,
        origem: "INVESTIMENTO",
        referencia_id: "mov-1",
        editavel: false,
      },
    ]);
    vi.spyOn(api, "dolarCotacaoAtual").mockResolvedValue({
      cotacao_brl: 5,
      compra_brl: 5,
      venda_brl: 5,
      data_cotacao: "2026-05-09",
      fonte: "mock",
      erro: null,
    });
    vi.spyOn(api, "movimentosInvestimentos").mockResolvedValue([
      {
        id: "mov-1",
        ativo_id: "ativo-1",
        ticker: "AAPL",
        nome: "Apple",
        tipo_ativo: "EXTERIOR",
        tipo_controle: "QUANTIDADE",
        tipo_movimento: "COMPRA",
        data_movimento: "2026-05-09",
        quantidade: 2,
        preco_unitario: 100,
        valor_total: 200,
        taxas: 0,
        valor_financeiro: 200,
        moeda: "USD",
        corretora: "Inter",
        conta_id: null,
        conta_nome: null,
        observacao: "Compra AAPL",
        origem_dolar: true,
      },
    ]);
    vi.spyOn(api, "atualizarMovimentoInvestimento").mockResolvedValue({} as never);
  });

  it("permite editar compra exterior pelo extrato dolar", async () => {
    renderPage();

    expect(await screen.findByText("COMPRA_EXTERIOR")).toBeInTheDocument();
    await waitFor(() => expect(api.movimentosInvestimentos).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: /editar investimento exterior/i }));

    expect(await screen.findByRole("heading", { name: "Editar operacao de investimento" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(api.atualizarMovimentoInvestimento).toHaveBeenCalledWith(
        "mov-1",
        expect.objectContaining({
          quantidade: 2,
          preco_unitario: 100,
          taxas: 0,
          conta_id: null,
          corretora: "Inter",
        }),
      );
    });
  });
});
