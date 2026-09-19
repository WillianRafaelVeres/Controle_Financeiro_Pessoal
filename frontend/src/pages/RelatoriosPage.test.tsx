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
      taxas: { economia_percentual: 40, investimento_percentual: 25, comprometimento_percentual: 60 },
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
      categorias_gasto: [{ categoria: "Casa", valor: 3000, percentual: 50 }],
      diagnostico_orcamento: [
        { natureza: "GASTO", item: "Casa", planejado: 3500, realizado: 3000, desvio: -500, favoravel: true },
        { natureza: "INVESTIMENTO", item: "Investimentos", planejado: 2000, realizado: 2500, desvio: 500, favoravel: true },
      ],
      insights: [{ tipo: "BOM", titulo: "Meta de investimentos superada", mensagem: "R$ 500,00 além da meta." }],
      evolucao: [{ ano: 2026, mes: 9, receita: 10000, gasto: 6000, investimento: 2500, saldo: 1500 }],
    });
  });

  it("mostra diagnostico e aplica a janela de tres meses", async () => {
    renderPage();

    expect(await screen.findByText("Meta de investimentos superada")).toBeInTheDocument();
    expect(screen.getByText("Ajustes sugeridos no orçamento")).toBeInTheDocument();

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
