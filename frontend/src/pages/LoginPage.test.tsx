import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendPasswordReset } from "../lib/supabase";
import { LoginPage } from "./LoginPage";

vi.mock("../lib/supabase", () => ({
  sendPasswordReset: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

describe("LoginPage recuperacao de senha", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(sendPasswordReset).mockResolvedValue(undefined);
  });

  it("mostra acao de esqueci minha senha", () => {
    render(<LoginPage onLogin={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Esqueci minha senha" })).toBeInTheDocument();
  });

  it("envia reset e mostra mensagem neutra", async () => {
    render(<LoginPage onLogin={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "pessoa@email.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link" }));

    await waitFor(() => expect(sendPasswordReset).toHaveBeenCalledWith("pessoa@email.com"));
    expect(await screen.findByText("Se esse e-mail estiver cadastrado, enviaremos um link.")).toBeInTheDocument();
  });

  it("exibe mensagem inicial vinda de troca de senha concluida", () => {
    render(<LoginPage initialMessage="Senha alterada. Entre com a nova senha." onLogin={vi.fn()} />);

    expect(screen.getByText("Senha alterada. Entre com a nova senha.")).toBeInTheDocument();
  });
});
