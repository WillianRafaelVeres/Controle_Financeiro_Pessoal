import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { OrcamentoPage } from "./OrcamentoPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrcamentoPage />
    </QueryClientProvider>,
  );
}

describe("OrcamentoPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "planejamentoResumo").mockResolvedValue({
      ano: 2026,
      mes: 7,
      planejado_total: 10000,
      executado_total: 5500,
      disponivel_total: 4500,
      percentual_usado: 55,
      receitas_planejadas: 10000,
      receitas_executadas: 10000,
      receitas_nao_planejadas_total: 0,
      gastos_planejados: 8000,
      gastos_executados: 4000,
      gastos_nao_planejados_total: 500,
      investimentos_planejados: 2000,
      investimentos_executados: 1500,
      investimentos_nao_planejados_total: 300,
      itens_receitas: [],
      itens_gastos: [
        {
          item_orcamento_id: "orc-gasto",
          natureza: "GASTO",
          categoria_id: "cat-gasto",
          categoria: "Casa",
          valor_orcado: 8000,
          gasto_real: 4000,
          diferenca: 4000,
          percentual_usado: 50,
          media_3_meses: 0,
          media_6_meses: 0,
          media_12_meses: 0,
          situacao: "DENTRO",
        },
      ],
      itens_investimentos: [
        {
          item_orcamento_id: "orc-invest",
          natureza: "INVESTIMENTO",
          categoria_id: "cat-invest",
          categoria: "Investimentos",
          valor_orcado: 2000,
          gasto_real: 1500,
          diferenca: 500,
          percentual_usado: 75,
          media_3_meses: 0,
          media_6_meses: 0,
          media_12_meses: 0,
          situacao: "DENTRO",
        },
      ],
      receitas_nao_planejadas: [],
      gastos_nao_planejados: [],
      investimentos_nao_planejados: [],
      executado_total_com_nao_planejado: 6300,
      receitas_executadas_total_com_nao_planejado: 10000,
    });
  });

  it("separa gastos de investimentos e mostra o resultado do mes", async () => {
    renderPage();

    const saidasCard = (await screen.findByText("Saidas totais")).closest("section");
    expect(saidasCard).not.toBeNull();
    expect(within(saidasCard as HTMLElement).getByText("R$ 6.300,00")).toBeInTheDocument();
    expect(within(saidasCard as HTMLElement).getByText("Planejado: R$ 10.000,00")).toBeInTheDocument();

    const gastosCard = screen.getByText("Gastos", { selector: "p" }).closest("section");
    expect(gastosCard).not.toBeNull();
    expect(within(gastosCard as HTMLElement).getByText("R$ 4.500,00")).toBeInTheDocument();

    const investimentosCard = screen.getByText("Meta em andamento").closest("section");
    expect(investimentosCard).not.toBeNull();
    expect(within(investimentosCard as HTMLElement).getByText("R$ 1.800,00")).toBeInTheDocument();
    expect(within(investimentosCard as HTMLElement).getByText("Meta em andamento")).toBeInTheDocument();

    const resultadoCard = screen.getByText("Resultado do mes").closest("section");
    expect(resultadoCard).not.toBeNull();
    expect(within(resultadoCard as HTMLElement).getByText("R$ 3.700,00")).toBeInTheDocument();
  });
});
