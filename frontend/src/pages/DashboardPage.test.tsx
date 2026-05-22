import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { DashboardPage } from "./DashboardPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

function mockApi() {
  vi.spyOn(api, "painelResumo").mockResolvedValue({
    saldo_livre: 1000,
    receitas_mes: 2000,
    despesas_mes: 500,
    investimentos_mes: 100,
    saldo_em_contas_informado: 1200,
    saldo_em_contas: 1200,
    saldo_explicado: 1000,
    reservado_cartao: 0,
    compromissos_futuros_cartao: 0,
    saldo_teorico_usd: 0,
    gastos_nao_planejados_mes: 0,
    investimentos_nao_planejados_mes: 0,
    gasto_mes: 0,
    orcamento_restante: 0,
    investimentos: 0,
    diferenca_conciliacao: 0,
  });
  vi.spyOn(api, "conciliacao").mockResolvedValue({ status: "Tudo conciliado.", diferenca_nao_explicada: 0 });
  vi.spyOn(api, "dashboardGraficos").mockResolvedValue({ gastos_por_categoria: [], receitas_vs_gastos: [] });
  vi.spyOn(api, "dolarResumo").mockResolvedValue({
    saldo_teorico_usd: 0,
    saldo_informado_usd: 0,
    diferenca_conciliacao_usd: 0,
    cotacao_brl: 0,
    valor_estimado_brl: 0,
    status: "ok",
  });
  vi.spyOn(api, "categorias").mockResolvedValue([
    { id: "cat-gasto", nome: "Moradia", natureza: "GASTO", ativa: true },
    { id: "cat-inv", nome: "Investimentos", natureza: "INVESTIMENTO", ativa: true },
  ]);
  vi.spyOn(api, "subcategorias").mockResolvedValue([
    { id: "sub-gasto", nome: "Aluguel", categoria_id: "cat-gasto", natureza: "GASTO", ativa: true },
    { id: "sub-inv", nome: "Acoes Brasil", categoria_id: "cat-inv", natureza: "INVESTIMENTO", ativa: true },
  ]);
  vi.spyOn(api, "metodos").mockResolvedValue([{ id: "met-cartao", nome: "Cartao", tipo_metodo: "CARTAO_CREDITO", ativo: true }]);
  vi.spyOn(api, "cartoes").mockResolvedValue([
    {
      id: "card-1",
      nome: "XP",
      limite_total: 1000,
      limite_utilizado_informado: 0,
      fatura_atual_informada: 0,
      reservado_para_pagar: 0,
      compromisso_futuro: 0,
      limite_utilizado_total: 0,
      diferenca_limite: 0,
    },
  ]);
  vi.spyOn(api, "ativosDividendos").mockResolvedValue([]);
}

describe("Dashboard quick actions", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockApi();
  });

  it("abre modal de novo lancamento", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /novo lancamento/i }));
    expect(await screen.findByRole("heading", { name: "Novo lancamento" })).toBeInTheDocument();
  });

  it("abre fluxo de registrar investimento", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /registrar investimento/i }));
    expect(await screen.findByRole("heading", { name: "Comprar ativo" })).toBeInTheDocument();
  });

  it("abre modal de dividendos", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /registrar dividendo/i }));
    expect(await screen.findByRole("heading", { name: "Registrar dividendo" })).toBeInTheDocument();
  });

  it("abre modal de envio de dolar", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /enviar dolar/i }));
    expect(await screen.findByRole("heading", { name: "Enviar dolar" })).toBeInTheDocument();
  });
});
