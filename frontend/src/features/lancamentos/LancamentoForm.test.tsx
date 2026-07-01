import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LancamentoForm } from "./LancamentoForm";

const categorias = [
  { id: "cat-mercado", nome: "Mercado", natureza: "GASTO" as const, ativa: true },
  { id: "cat-salario", nome: "Salario", natureza: "RECEITA" as const, ativa: true },
];

const subcategorias = [
  { id: "sub-supermercado", nome: "Supermercado", categoria_id: "cat-mercado", natureza: "GASTO" as const, ativa: true },
  { id: "sub-bonus", nome: "Bonus", categoria_id: "cat-salario", natureza: "RECEITA" as const, ativa: true },
];

function renderForm() {
  return render(
    <LancamentoForm
      categorias={categorias}
      subcategorias={subcategorias}
      metodos={[{ id: "met-pix", nome: "Pix", tipo_metodo: "PIX", ativo: true }]}
      cartoes={[]}
      onSubmit={vi.fn()}
      onCreateCategoria={vi.fn(async (nome) => ({ id: `cat-${nome}`, label: nome }))}
      onCreateSubcategoria={vi.fn(async (nome) => ({ id: `sub-${nome}`, label: nome }))}
      onCreateMetodo={vi.fn(async (nome) => ({ id: `met-${nome}`, label: nome }))}
    />,
  );
}

describe("LancamentoForm item e sub-item", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lista itens e sub-itens reais do formulario", async () => {
    renderForm();

    fireEvent.focus(screen.getByRole("combobox", { name: "Item" }));
    expect(await screen.findByText("Mercado")).toBeInTheDocument();

    fireEvent.focus(screen.getByRole("combobox", { name: "Sub-item" }));
    expect(await screen.findByText("Supermercado")).toBeInTheDocument();
  });

  it("selecionar sub-item existente preenche o item correspondente", async () => {
    renderForm();

    const subItem = screen.getByRole("combobox", { name: "Sub-item" });
    fireEvent.focus(subItem);
    fireEvent.click(await screen.findByText("Supermercado"));

    expect(screen.getByRole("combobox", { name: "Sub-item" })).toHaveValue("Supermercado");
    expect(screen.getByRole("combobox", { name: "Item" })).toHaveValue("Mercado");
  });

  it("criar sub-item exige item correspondente", async () => {
    renderForm();

    const subItem = screen.getByRole("combobox", { name: "Sub-item" });
    fireEvent.focus(subItem);
    fireEvent.change(subItem, { target: { value: "Padaria" } });
    fireEvent.click(await screen.findByText('Criar sub-item "Padaria"'));

    await screen.findByRole("heading", { name: "Sub-item ainda nao existe" });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByText(/Selecione ou crie um item salvo antes de criar sub-item/i)).toBeInTheDocument();
  });

  it("envia nome do investimento para compra por valor", async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(
      <LancamentoForm
        categorias={categorias}
        subcategorias={subcategorias}
        metodos={[{ id: "met-pix", nome: "Pix", tipo_metodo: "PIX", ativo: true }]}
        cartoes={[]}
        onSubmit={onSubmit}
        onCreateCategoria={vi.fn(async (nome) => ({ id: `cat-${nome}`, label: nome }))}
        onCreateSubcategoria={vi.fn(async (nome) => ({ id: `sub-${nome}`, label: nome }))}
        onCreateMetodo={vi.fn(async (nome) => ({ id: `met-${nome}`, label: nome }))}
        initialType="INVESTIMENTO"
        allowInvestment
        lockType
      />,
    );

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "COMPRA_ATIVO" } });
    fireEvent.change(screen.getByLabelText("Tipo ativo"), { target: { value: "CAIXINHA_CDB" } });
    fireEvent.change(screen.getByPlaceholderText("Ex.: XP, Inter, Santander"), { target: { value: "Banco" } });
    fireEvent.change(screen.getByPlaceholderText("Ex.: Caixinha viagem, Reserva Nubank"), {
      target: { value: "Caixinha viagem" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        movimento_investimento: expect.objectContaining({
          tipo_ativo: "CAIXINHA_CDB",
          tipo_controle: "VALOR",
          ticker: null,
          nome: "Caixinha viagem",
          valor_total: 500,
          corretora: "Banco",
        }),
      }),
    );
  });
});
