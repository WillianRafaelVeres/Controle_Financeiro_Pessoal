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
    vi.spyOn(api, "rentabilidadeComparadaInvestimentos").mockResolvedValue({
      escopo: { codigo: "CARTEIRA_TOTAL", label: "Carteira total", tipos_ativo: [], ativos_ids: [] },
      data_inicio_efetiva: "2026-01-01",
      data_fim: "2026-05-31",
      moeda_base: "BRL",
      metodologia: "MODIFIED_DIETZ_MENSAL_ENCADEADO",
      incluir_proventos: true,
      cobertura: { completa: true, avisos: [] },
      resumo: {
        carteira_percentual: 18.42,
        benchmarks: {
          CDI: { label: "CDI", rentabilidade_percentual: 14.21, diferenca_pp: 4.21 },
          IBOVESPA: { label: "Ibovespa", rentabilidade_percentual: 11.48, diferenca_pp: 6.94 },
        },
      },
      serie: [
        {
          periodo: "05/2026",
          data: "2026-05-31",
          retorno_periodo_carteira: 1.35,
          carteira: 18.42,
          CDI: 14.21,
          IBOVESPA: 11.48,
        },
      ],
    });
    vi.spyOn(api, "evolucaoCategoriasInvestimentos").mockResolvedValue({
      modo: "mensal",
      data_inicio: "2026-01-01",
      data_fim: "2026-05-31",
      cobertura: { completa: true, avisos: [] },
      periodos: [
        {
          ano: 2026,
          mes: 5,
          periodo: "05/2026",
          data: "2026-05-31",
          patrimonio_total_brl: 1500,
          categorias: [
            { tipo: "ACAO_BR", label: "Ações brasileiras", valor_brl: 1000, percentual_carteira: 66.67 },
            { tipo: "FII", label: "Fundos imobiliários", valor_brl: 500, percentual_carteira: 33.33 },
          ],
        },
      ],
    });
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

  it("renderiza evolucao temporal, rentabilidade comparada e evolucao por categoria", async () => {
    renderPage();

    expect(await screen.findByText("Evolucao mensal do patrimonio")).toBeInTheDocument();
    expect(await screen.findByText("Rentabilidade comparada")).toBeInTheDocument();
    expect(await screen.findByText("Evolução por categoria")).toBeInTheDocument();
    expect(await screen.findByText("Historico consolidado")).toBeInTheDocument();
    expect(await screen.findByText("05/2026")).toBeInTheDocument();
  });

  it("alterna para acompanhamento de proventos com filtros", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /proventos/i }));

    expect(await screen.findByText("Proventos recebidos por mes")).toBeInTheDocument();
    expect(await screen.findByText("Filtros de proventos")).toBeInTheDocument();
  });
});
