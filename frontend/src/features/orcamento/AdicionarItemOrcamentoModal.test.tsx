import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../lib/api";
import { AdicionarItemOrcamentoModal } from "./AdicionarItemOrcamentoModal";

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdicionarItemOrcamentoModal open ano={2026} mes={6} onClose={vi.fn()} onSuccess={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("AdicionarItemOrcamentoModal", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(api, "categorias").mockImplementation(async (natureza) => {
      if (natureza === "INVESTIMENTO") return [{ id: "cat-invest", nome: "Investimentos", natureza: "INVESTIMENTO", ativa: true }];
      if (natureza === "GASTO") return [{ id: "cat-gasto", nome: "Moradia", natureza: "GASTO", ativa: true }];
      return [];
    });
    vi.spyOn(api, "subcategorias").mockResolvedValue([]);
  });

  it("usa tipos de investimento no planejamento de investimento", async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText("Tipo de planejamento"), { target: { value: "INVESTIMENTO" } });

    const tipoInvestimento = await screen.findByLabelText("Tipo de investimento");
    expect(tipoInvestimento).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Acao BR" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "FII" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Categoria")).not.toBeInTheDocument();
  });
});
