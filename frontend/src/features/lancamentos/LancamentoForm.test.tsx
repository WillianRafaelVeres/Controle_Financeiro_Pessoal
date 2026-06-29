import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
