import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  beforeEach(() => {
    cleanup();
  });

  it("navega para desempenho pelo menu lateral", () => {
    const onNavigate = vi.fn();
    render(<Sidebar current="dashboard" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: /desempenho/i }));

    expect(onNavigate).toHaveBeenCalledWith("desempenho");
  });

  it("navega para meu patrimonio pelo menu lateral", () => {
    const onNavigate = vi.fn();
    render(<Sidebar current="dashboard" onNavigate={onNavigate} />);

    fireEvent.click(screen.getAllByRole("button", { name: /meu patrimonio/i })[0]);

    expect(onNavigate).toHaveBeenCalledWith("patrimonio");
  });
});
