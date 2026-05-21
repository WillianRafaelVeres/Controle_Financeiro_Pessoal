import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { DesempenhoPage } from "./DesempenhoPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DesempenhoPage />
    </QueryClientProvider>,
  );
}

describe("DesempenhoPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "desempenhoInvestimentos").mockResolvedValue({
      patrimonio_atual_brl: 1500,
      total_aportado_brl: 1200,
      lucro_prejuizo_brl: 300,
      rentabilidade_percentual: 25,
      exterior_brl: 500,
      alocacao_por_tipo: [
        { tipo_ativo: "ACAO_BR", tipo_label: "Acao BR", valor_atual_brl: 1000, percentual: 66.67, quantidade_posicoes: 1 },
        { tipo_ativo: "EXTERIOR", tipo_label: "Exterior", valor_atual_brl: 500, percentual: 33.33, quantidade_posicoes: 1 },
      ],
      alocacao_por_ativo: [],
      top_ativos: [
        {
          ativo_id: "ativo-1",
          ticker: "BBAS3",
          nome: "Banco do Brasil",
          tipo_ativo: "ACAO_BR",
          tipo_label: "Acao BR",
          moeda: "BRL",
          corretora: "Santander",
          valor_atual_brl: 1000,
          valor_atual_original: 1000,
          total_aportado_brl: 800,
          resultado_brl: 200,
          rentabilidade_percentual: 25,
          percentual: 66.67,
          cotacao_automatica: true,
        },
      ],
      maiores_ganhos: [],
      maiores_perdas: [],
      benchmarks: {
        dolar: { valor: 5, variacao_percentual: 0.5, fonte: "AwesomeAPI", data: "2026-05-21" },
        ibovespa: { valor: 120000, variacao_percentual: 1, fonte: "Yahoo Finance", data: "2026-05-21" },
        cdi: { valor: 0.04, variacao_percentual: 0.04, fonte: "Banco Central SGS", data: "21/05/2026" },
      },
    });
  });

  it("renderiza snapshot, benchmarks e rankings", async () => {
    renderPage();

    expect(await screen.findByText("Patrimonio atual")).toBeInTheDocument();
    expect(await screen.findByText("Dolar")).toBeInTheDocument();
    expect(await screen.findByText("Ibovespa")).toBeInTheDocument();
    expect(await screen.findByText("CDI diario")).toBeInTheDocument();
    expect(await screen.findByText("BBAS3")).toBeInTheDocument();
    expect(await screen.findByText("Alocacao por tipo")).toBeInTheDocument();
  });
});
