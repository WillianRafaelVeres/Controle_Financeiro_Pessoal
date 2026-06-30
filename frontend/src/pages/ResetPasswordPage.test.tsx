import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentSession, onAuthStateChange, signOut, updatePassword } from "../lib/supabase";
import { ResetPasswordPage } from "./ResetPasswordPage";

vi.mock("../lib/supabase", () => ({
  getCurrentSession: vi.fn(),
  isSupabaseConfigured: true,
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  updatePassword: vi.fn(),
}));

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(getCurrentSession).mockResolvedValue({ access_token: "recovery-token" } as never);
    vi.mocked(onAuthStateChange).mockReturnValue(vi.fn());
    vi.mocked(signOut).mockResolvedValue(undefined);
    vi.mocked(updatePassword).mockResolvedValue(undefined);
    window.history.replaceState(null, "", "/reset-password");
  });

  it("mostra formulario de nova senha quando ha sessao de recuperacao", async () => {
    render(<ResetPasswordPage onBackToLogin={vi.fn()} />);

    expect(await screen.findByLabelText("Nova senha")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmar senha")).toBeInTheDocument();
  });

  it("bloqueia senhas diferentes", async () => {
    render(<ResetPasswordPage onBackToLogin={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText("Nova senha"), { target: { value: "senha123" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "senha456" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    expect(await screen.findByText("As senhas nao coincidem.")).toBeInTheDocument();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("altera senha, encerra sessao e volta ao login", async () => {
    const onBackToLogin = vi.fn();
    render(<ResetPasswordPage onBackToLogin={onBackToLogin} />);

    fireEvent.change(await screen.findByLabelText("Nova senha"), { target: { value: "senha123" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "senha123" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith("senha123"));
    expect(signOut).toHaveBeenCalled();
    expect(onBackToLogin).toHaveBeenCalledWith("Senha alterada. Entre com a nova senha.");
  });
});
