import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComboboxCreate, type ComboOption } from "./ComboboxCreate";

const options: ComboOption[] = [
  { id: "1", label: "Assinaturas" },
  { id: "2", label: "Alimentacao" },
  { id: "3", label: "Aluguel" },
  { id: "4", label: "Mercado" },
  { id: "5", label: "Transporte" },
];

describe("ComboboxCreate", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", { value: 841, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 1880, configurable: true });
    // Campo no meio da tela: bottom = 464 de uma viewport de 841px de altura.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 432,
      bottom: 464,
      left: 950,
      right: 1240,
      width: 290,
      height: 32,
      x: 950,
      y: 432,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("ancora a lista logo abaixo do campo (nao no rodape da tela)", async () => {
    render(<ComboboxCreate label="Item" options={options} onSelect={vi.fn()} />);

    fireEvent.focus(screen.getByRole("combobox", { name: "Item" }));
    const listbox = await screen.findByRole("listbox");

    expect(listbox.className).toContain("fixed");
    const top = parseFloat(listbox.style.top);
    expect(top).toBeGreaterThanOrEqual(464); // abaixo do campo (bottom = 464)
    expect(top).toBeLessThan(520); // colado no campo, longe do rodape (841px)
  });

  it("prefere abrir abaixo quando ainda ha espaco util abaixo do campo", async () => {
    vi.mocked(Element.prototype.getBoundingClientRect).mockReturnValue({
      top: 300,
      bottom: 340,
      left: 950,
      right: 1240,
      width: 290,
      height: 40,
      x: 950,
      y: 300,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(window, "innerHeight", { value: 500, configurable: true });

    render(<ComboboxCreate label="Item" options={options} onSelect={vi.fn()} />);

    fireEvent.focus(screen.getByRole("combobox", { name: "Item" }));
    const listbox = await screen.findByRole("listbox");

    expect(parseFloat(listbox.style.top)).toBeGreaterThanOrEqual(340);
  });

  it("mostra todas as opcoes ao abrir", async () => {
    render(<ComboboxCreate label="Item" options={options} onSelect={vi.fn()} />);

    fireEvent.focus(screen.getByRole("combobox", { name: "Item" }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("button")).toHaveLength(options.length);
  });

  it("filtra conforme o texto digitado", async () => {
    render(<ComboboxCreate label="Item" options={options} onSelect={vi.fn()} />);

    const input = screen.getByRole("combobox", { name: "Item" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "al" } });

    const labels = within(screen.getByRole("listbox"))
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["Alimentacao", "Aluguel"]);
  });

  it("ranqueia sugestoes conforme a proximidade do texto digitado", async () => {
    render(
      <ComboboxCreate
        label="Item"
        options={[
          { id: "1", label: "Supermercado" },
          { id: "2", label: "Plano Mercado" },
          { id: "3", label: "Mercado" },
        ]}
        onSelect={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Item" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "mer" } });

    const labels = within(screen.getByRole("listbox"))
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["Mercado", "Plano Mercado", "Supermercado"]);
  });

  it("seleciona a opcao clicada", async () => {
    const onSelect = vi.fn();
    render(<ComboboxCreate label="Item" options={options} onSelect={onSelect} />);

    fireEvent.focus(screen.getByRole("combobox", { name: "Item" }));
    fireEvent.click(await screen.findByText("Mercado"));

    expect(onSelect).toHaveBeenCalledWith({ id: "4", label: "Mercado" });
  });
});
