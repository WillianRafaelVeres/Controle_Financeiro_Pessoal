import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { RelatoriosPage } from "./RelatoriosPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RelatoriosPage />
    </QueryClientProvider>,
  );
}

describe("RelatoriosPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "relAnaliseFinanceira").mockResolvedValue({
      periodo: { ano_inicio: 2026, mes_inicio: 9, ano_fim: 2026, mes_fim: 9, quantidade_meses: 1 },
      totais: { receita: 10000, gasto: 6000, investimento: 2500, saldo_livre: 1500 },
      taxas: { economia_percentual: 40, investimento_percentual: 25, comprometimento_percentual: 60, saldo_livre_percentual: 15 },
      medias_mensais: { receita: 10000, gasto: 6000, investimento: 2500, saldo_livre: 1500, investimento_percentual: 25 },
      destino_receita: { gastos_percentual: 60, investimentos_percentual: 25, livre_percentual: 15 },
      consistencia: {
        meses_com_receita: 1,
        meses_com_investimento: 1,
        meses_saldo_positivo: 1,
        regularidade_investimento_percentual: 100,
        regularidade_fluxo_percentual: 100,
      },
      saude_financeira: {
        score: 92,
        nivel: "SOLIDA",
        componentes: { taxa_investimento: 100, orcamento: 100, fluxo_caixa: 100, planejamento: 80 },
        metodologia: "Indicador diagnostico.",
      },
      comparacao: {
        periodo_anterior: { ano_inicio: 2026, mes_inicio: 8, ano_fim: 2026, mes_fim: 8 },
        totais: { receita: 9000, gasto: 6500, investimento: 1500, saldo_livre: 1000 },
        variacoes_percentuais: { receita: 11.11, gasto: -7.69, investimento: 66.67, saldo_livre: 50 },
      },
      planejamento: {
        receitas: { planejado: 9000, realizado: 10000 },
        gastos: { planejado: 6500, realizado: 6000, nao_planejado: 100 },
        investimentos: { planejado: 2000, realizado: 2500, nao_planejado: 0 },
      },
      categorias_gasto: [{ categoria: "Casa", valor: 3000, percentual: 50, media_mensal: 3000 }],
      subcategorias_gasto: [{ categoria: "Casa", subcategoria: "Aluguel", valor: 2500, percentual: 41.67 }],
      diagnostico_orcamento: [
        { natureza: "GASTO", item: "Casa", planejado: 3500, realizado: 3000, desvio: -500, favoravel: true },
        { natureza: "INVESTIMENTO", item: "Investimentos", planejado: 2000, realizado: 2500, desvio: 500, favoravel: true },
      ],
      insights: [{ tipo: "BOM", titulo: "Meta de investimentos superada", mensagem: "R$ 500,00 além da meta." }],
      evolucao: [{ ano: 2026, mes: 9, receita: 10000, gasto: 6000, investimento: 2500, saldo: 1500, gasto_percentual: 60, investimento_percentual: 25, saldo_percentual: 15 }],
    });
  });

  it("mostra diagnostico e aplica a janela de tres meses", async () => {
    renderPage();

    expect(await screen.findByText("Meta de investimentos superada")).toBeInTheDocument();
    expect(screen.getByText("Planejado x realizado")).toBeInTheDocument();
    expect(screen.getByText("Saúde financeira")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Últimos 3 meses" }));

    const now = new Date();
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1;
    const endIndex = endYear * 12 + endMonth - 1;
    const startIndex = endIndex - 2;
    await waitFor(() => {
      expect(api.relAnaliseFinanceira).toHaveBeenLastCalledWith(
        Math.floor(startIndex / 12),
        (startIndex % 12) + 1,
        endYear,
        endMonth,
      );
    });
  });
});
