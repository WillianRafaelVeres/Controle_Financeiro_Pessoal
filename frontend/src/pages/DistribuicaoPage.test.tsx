import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import type { DesempenhoAtivo, DesempenhoInvestimentos, DistribuicaoPlano } from "../lib/types";
import { DistribuicaoPage } from "./DistribuicaoPage";

const planoInvestimentosComRebalanceamento: DistribuicaoPlano = {
  id: "plano-investimentos",
  nome: "Investimentos",
  itens: [
    { id: "i1", nome: "Renda fixa", percentual: 25, tipos_ativo: ["RENDA_FIXA", "CAIXINHA_CDB"] },
    { id: "i2", nome: "FIIs", percentual: 15, tipos_ativo: ["FII"] },
    { id: "i3", nome: "Acoes BR", percentual: 20, tipos_ativo: ["ACAO_BR", "ETF_BR"] },
    { id: "i4", nome: "Exterior", percentual: 25, tipos_ativo: ["EXTERIOR", "ACAO_EXTERIOR", "ETF_EXTERIOR"] },
    { id: "i5", nome: "Bitcoin", percentual: 15, tipos_ativo: ["CRIPTO"] },
  ],
};

function ativoDesempenho(tipo: string, valor: number): DesempenhoAtivo {
  return {
    ativo_id: `${tipo}-1`,
    ticker: tipo,
    nome: tipo,
    tipo_ativo: tipo as DesempenhoAtivo["tipo_ativo"],
    finalidade: "INVESTIMENTO",
    tipo_label: tipo,
    moeda: "BRL",
    valor_atual_brl: valor,
    valor_atual_original: valor,
    total_aportado_brl: valor,
    resultado_brl: 0,
    rentabilidade_percentual: 0,
    percentual: 0,
    cotacao_automatica: false,
  };
}

const desempenhoCarteira90mil: DesempenhoInvestimentos = {
  patrimonio_atual_brl: 90000,
  total_aportado_brl: 90000,
  lucro_prejuizo_brl: 0,
  rentabilidade_percentual: 0,
  exterior_brl: 20000,
  alocacao_por_tipo: [],
  alocacao_por_ativo: [
    ativoDesempenho("RENDA_FIXA", 20000),
    ativoDesempenho("FII", 10000),
    ativoDesempenho("ACAO_BR", 30000),
    ativoDesempenho("EXTERIOR", 20000),
    ativoDesempenho("CRIPTO", 10000),
  ],
  top_ativos: [],
  maiores_ganhos: [],
  maiores_perdas: [],
  benchmarks: {
    dolar: {},
    ibovespa: {},
    cdi: {},
  },
};

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

describe("DistribuicaoPage - rebalanceamento inteligente", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(api, "distribuicaoPlanos").mockResolvedValue([planoInvestimentosComRebalanceamento]);
  });

  it("sugere aporte proporcional ao deficit e zera a classe acima do alvo (exemplo da spec)", async () => {
    vi.spyOn(api, "desempenhoInvestimentos").mockResolvedValue(desempenhoCarteira90mil);
    renderPage();

    fireEvent.change(await screen.findByPlaceholderText("0,00"), { target: { value: "10000" } });

    const tabela = await screen.findByRole("table");
    const linhaAcoes = within(tabela).getByText("Acoes BR").closest("tr") as HTMLElement;
    expect(within(linhaAcoes).getByText("R$ 0,00")).toBeInTheDocument();
    expect(within(linhaAcoes).getByText("Acima do alvo")).toBeInTheDocument();
    expect(within(linhaAcoes).getByText(/direcionados as demais classes/)).toBeInTheDocument();

    const linhaBitcoin = within(tabela).getByText("Bitcoin").closest("tr") as HTMLElement;
    expect(within(linhaBitcoin).getByText("R$ 2.500,00")).toBeInTheDocument();
    expect(within(linhaBitcoin).getByText("Abaixo do alvo")).toBeInTheDocument();

    const linhaTotal = within(tabela).getByText("Total").closest("tr") as HTMLElement;
    expect(within(linhaTotal).getByText("R$ 10.000,00")).toBeInTheDocument();
  });

  it("rotula o campo de valor como aporte e usa o label 'Valor do novo aporte'", async () => {
    vi.spyOn(api, "desempenhoInvestimentos").mockResolvedValue(desempenhoCarteira90mil);
    renderPage();

    expect(await screen.findByText("Valor do novo aporte")).toBeInTheDocument();
  });

  it("cai pro rateio simples com aviso quando a carteira atual nao pode ser carregada", async () => {
    vi.spyOn(api, "desempenhoInvestimentos").mockRejectedValue(new Error("falha de rede"));
    renderPage();

    expect(await screen.findByText(/mostrando o rateio simples/)).toBeInTheDocument();
    expect(screen.getByText("Percentual")).toBeInTheDocument();
  });
});
