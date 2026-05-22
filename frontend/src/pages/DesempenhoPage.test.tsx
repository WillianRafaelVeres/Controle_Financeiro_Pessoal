import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(api, "desempenhoInvestimentos").mockResolvedValue({
      patrimonio_atual_brl: 1500,
      total_aportado_brl: 1200,
      lucro_prejuizo_brl: 300,
      rentabilidade_percentual: 25,
      exterior_brl: 500,
      alocacao_por_tipo: [],
      alocacao_por_ativo: [],
      top_ativos: [],
      maiores_ganhos: [],
      maiores_perdas: [],
      benchmarks: {
        dolar: { valor: 5, variacao_percentual: 0.5, fonte: "AwesomeAPI", data: "2026-05-21" },
        ibovespa: { valor: 120000, variacao_percentual: 1, fonte: "Yahoo Finance", data: "2026-05-21" },
        cdi: { valor: 0.04, variacao_percentual: 0.04, fonte: "Banco Central SGS", data: "21/05/2026" },
      },
    });
    vi.spyOn(api, "historicoDesempenhoInvestimentos").mockResolvedValue([
      {
        id: "hist-1",
        ano: 2026,
        mes: 5,
        periodo: "05/2026",
        patrimonio_atual_brl: 1500,
        total_aportado_brl: 1200,
        lucro_prejuizo_brl: 300,
        dividendos_brl: 50,
        rentabilidade_percentual: 25,
      },
    ]);
    vi.spyOn(api, "ativos").mockResolvedValue([
      { id: "ativo-1", ticker: "BBAS3", nome: "Banco do Brasil", tipo_ativo: "ACAO_BR", moeda: "BRL" },
    ]);
    vi.spyOn(api, "historicoProventosInvestimentos").mockResolvedValue({
      modo: "mensal",
      total_brl: 120,
      media_periodo_brl: 120,
      maior_periodo_brl: 120,
      maior_periodo: "05/2026",
      quantidade: 2,
      por_periodo: [{ ano: 2026, mes: 5, periodo: "05/2026", total_brl: 120, quantidade: 2 }],
      por_classe: [{ tipo_ativo: "ACAO_BR", tipo_label: "Acao BR", total_brl: 120, quantidade: 2 }],
      por_tipo: [{ tipo_provento: "DIVIDENDO", tipo_label: "Dividendos", total_brl: 120, quantidade: 2 }],
      por_ativo: [
        {
          ativo_id: "ativo-1",
          ticker: "BBAS3",
          nome: "Banco do Brasil",
          tipo_ativo: "ACAO_BR",
          tipo_label: "Acao BR",
          total_brl: 120,
          quantidade: 2,
        },
      ],
    });
  });

  it("renderiza evolucao temporal e historico mensal", async () => {
    renderPage();

    expect(await screen.findByText("Evolucao mensal do patrimonio")).toBeInTheDocument();
    expect(await screen.findByText("Historico consolidado")).toBeInTheDocument();
    expect(await screen.findByText("05/2026")).toBeInTheDocument();
    expect(await screen.findByText("Mensal")).toBeInTheDocument();
    expect(await screen.findByText("Anual")).toBeInTheDocument();
  });

  it("alterna para acompanhamento de proventos com filtros", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /proventos/i }));

    expect(await screen.findByText("Proventos recebidos por mes")).toBeInTheDocument();
    expect(await screen.findByText("Filtros de proventos")).toBeInTheDocument();
    expect(await screen.findByText("Agrupamento selecionado")).toBeInTheDocument();
    expect((await screen.findAllByText("Acao BR")).length).toBeGreaterThan(0);
  });
});
