import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { PatrimonioPage } from "./PatrimonioPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PatrimonioPage />
    </QueryClientProvider>,
  );
}

describe("PatrimonioPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "desempenhoInvestimentos").mockResolvedValue({
      patrimonio_atual_brl: 3000,
      total_aportado_brl: 2500,
      lucro_prejuizo_brl: 500,
      rentabilidade_percentual: 20,
      exterior_brl: 1000,
      alocacao_por_tipo: [],
      alocacao_por_ativo: [
        {
          ativo_id: "1",
          ticker: "BBAS3",
          nome: "Banco do Brasil",
          tipo_ativo: "ACAO_BR",
          tipo_label: "Acao BR",
          moeda: "BRL",
          corretora: "Santander",
          valor_atual_brl: 2000,
          valor_atual_original: 2000,
          total_aportado_brl: 1500,
          resultado_brl: 500,
          rentabilidade_percentual: 33.3,
          percentual: 66.7,
          cotacao_automatica: true,
        },
        {
          ativo_id: "2",
          ticker: "AAPL",
          nome: "Apple",
          tipo_ativo: "EXTERIOR",
          tipo_label: "Exterior",
          moeda: "USD",
          corretora: "Inter",
          valor_atual_brl: 1000,
          valor_atual_original: 200,
          total_aportado_brl: 1000,
          resultado_brl: 0,
          rentabilidade_percentual: 0,
          percentual: 33.3,
          cotacao_automatica: false,
        },
      ],
      top_ativos: [],
      maiores_ganhos: [],
      maiores_perdas: [],
      benchmarks: {
        dolar: { valor: 5, fonte: "AwesomeAPI" },
        ibovespa: { valor: 120000, fonte: "Yahoo Finance" },
        cdi: { valor: 0.04, fonte: "Banco Central SGS" },
      },
    });
  });

  it("renderiza patrimonio com filtros e agrupamento", async () => {
    renderPage();

    expect(await screen.findByText("Meu patrimonio")).toBeInTheDocument();
    expect((await screen.findAllByText("BBAS3"))[0]).toBeInTheDocument();
    expect((await screen.findAllByText("AAPL"))[0]).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Agrupar patrimonio"), { target: { value: "tipo" } });

    expect((await screen.findAllByText("Acoes"))[0]).toBeInTheDocument();
    expect((await screen.findAllByText("Exterior"))[0]).toBeInTheDocument();
  });
});
