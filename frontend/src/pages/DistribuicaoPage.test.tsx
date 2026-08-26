import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import type { DistribuicaoPlano } from "../lib/types";
import { DistribuicaoPage } from "./DistribuicaoPage";

const planoInvestimentos: DistribuicaoPlano = {
  id: "plano-investimentos",
  nome: "Investimentos",
  itens: [
    { id: "i1", nome: "Renda fixa", percentual: 25 },
    { id: "i2", nome: "FIIs", percentual: 15 },
    { id: "i3", nome: "Acoes BR", percentual: 20 },
    { id: "i4", nome: "Exterior", percentual: 25 },
    { id: "i5", nome: "Bitcoin", percentual: 15 },
  ],
};

const planoRendaExtra: DistribuicaoPlano = {
  id: "plano-renda-extra",
  nome: "Renda Extra",
  itens: [
    { id: "r1", nome: "Viagens", percentual: 50 },
    { id: "r2", nome: "Fundo carro/casa", percentual: 15 },
    { id: "r3", nome: "Investimentos", percentual: 15, subplano_id: "plano-investimentos" },
    { id: "r4", nome: "Reserva de emergencia", percentual: 10 },
    { id: "r5", nome: "Previdencia PGBL", percentual: 10 },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DistribuicaoPage />
    </QueryClientProvider>,
  );
}

describe("DistribuicaoPage", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(api, "distribuicaoPlanos").mockResolvedValue([planoInvestimentos, planoRendaExtra]);
  });

  it("carrega os planos salvos (o primeiro plano vem selecionado) e calcula ao digitar o valor", async () => {
    renderPage();

    // O plano por padrao e' o primeiro da lista -- "Investimentos" nesse mock.
    expect(await screen.findByText("Bitcoin")).toBeInTheDocument();

    const valorInput = screen.getByPlaceholderText("0,00");
    fireEvent.change(valorInput, { target: { value: "2000" } });

    const linhaBitcoin = (await screen.findByText("Bitcoin")).closest("tr");
    expect(linhaBitcoin).not.toBeNull();
    expect(within(linhaBitcoin as HTMLElement).getByText("R$ 300,00")).toBeInTheDocument();

    const linhaTotal = screen.getByText("Total").closest("tr");
    expect(within(linhaTotal as HTMLElement).getByText("R$ 2.000,00")).toBeInTheDocument();
  });

  it("recalcula quando o valor muda", async () => {
    renderPage();
    await screen.findByText("Bitcoin");

    const valorInput = screen.getByPlaceholderText("0,00");
    fireEvent.change(valorInput, { target: { value: "2000" } });
    let linhaBitcoin = (await screen.findByText("Bitcoin")).closest("tr");
    expect(within(linhaBitcoin as HTMLElement).getByText("R$ 300,00")).toBeInTheDocument();

    fireEvent.change(valorInput, { target: { value: "1000" } });
    linhaBitcoin = (await screen.findByText("Bitcoin")).closest("tr");
    expect(within(linhaBitcoin as HTMLElement).getByText("R$ 150,00")).toBeInTheDocument();
  });

  it("recalcula quando o plano muda", async () => {
    renderPage();
    await screen.findByText("Bitcoin");

    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "2000" } });
    await screen.findByText("Bitcoin");

    fireEvent.change(screen.getByLabelText("Plano"), { target: { value: "plano-renda-extra" } });

    const linhaViagens = (await screen.findByText("Viagens")).closest("tr");
    expect(within(linhaViagens as HTMLElement).getByText("R$ 1.000,00")).toBeInTheDocument();
    expect(screen.queryByText("Bitcoin")).not.toBeInTheDocument();
  });

  it("expande a subdivisao de um item ligado a outro plano", async () => {
    renderPage();
    await screen.findByText("Bitcoin");

    fireEvent.change(screen.getByLabelText("Plano"), { target: { value: "plano-renda-extra" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "2000" } });

    // "Investimentos" tambem e' o nome de um plano no seletor -- restringe a
    // busca a tabela pra achar so a linha do item.
    const tabela = await screen.findByRole("table");
    const linhaInvestimentos = within(tabela).getByText("Investimentos").closest("tr");
    expect(linhaInvestimentos).not.toBeNull();

    fireEvent.click(within(linhaInvestimentos as HTMLElement).getByRole("button", { name: /Expandir/i }));

    expect(await screen.findByText(/Rateio de R\$ 300,00/)).toBeInTheDocument();
    expect(screen.getByText("Renda fixa")).toBeInTheDocument();
    expect(screen.getByText("Bitcoin")).toBeInTheDocument();
  });

  it("mostra estado vazio quando nao ha planos", async () => {
    vi.spyOn(api, "distribuicaoPlanos").mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("Nenhum plano de distribuicao")).toBeInTheDocument();
  });
});
