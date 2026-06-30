import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    signUp: vi.fn(),
    updateUser: vi.fn(),
  };
  return {
    auth,
    createClient: vi.fn(() => ({ auth })),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

async function loadModule() {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
  return import("./supabase");
}

describe("supabase auth helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: "token-123" } }, error: null });
    mocks.auth.signOut.mockResolvedValue({ error: null });
    mocks.auth.signUp.mockResolvedValue({ data: {}, error: null });
    mocks.auth.updateUser.mockResolvedValue({ data: {}, error: null });
  });

  it("faz login e retorna o token da sessao", async () => {
    const { signIn } = await loadModule();

    await expect(signIn(" pessoa@email.com ", "senha123")).resolves.toBe("token-123");

    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({ email: "pessoa@email.com", password: "senha123" });
  });

  it("envia recuperacao de senha com redirect configurado", async () => {
    const { getPasswordResetRedirectUrl, sendPasswordReset } = await loadModule();

    await sendPasswordReset("pessoa@email.com");

    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith("pessoa@email.com", {
      redirectTo: getPasswordResetRedirectUrl(),
    });
  });

  it("usa a origem atual hospedada para o redirect de recuperacao", async () => {
    const { getPasswordResetRedirectUrl } = await loadModule();

    expect(getPasswordResetRedirectUrl({
      hostname: "controle-financeiro-pessoal-jz43.onrender.com",
      origin: "https://controle-financeiro-pessoal-jz43.onrender.com",
    })).toBe("https://controle-financeiro-pessoal-jz43.onrender.com/reset-password");
  });

  it("ignora redirect localhost configurado quando o app esta hospedado", async () => {
    vi.stubEnv("VITE_PASSWORD_RESET_REDIRECT_URL", "http://localhost:3000");
    const { getPasswordResetRedirectUrl } = await loadModule();

    expect(getPasswordResetRedirectUrl({
      hostname: "controle-financeiro-pessoal-jz43.onrender.com",
      origin: "https://controle-financeiro-pessoal-jz43.onrender.com",
    })).toBe("https://controle-financeiro-pessoal-jz43.onrender.com/reset-password");
  });

  it("detecta link de recuperacao no hash ou na query", async () => {
    const { hasPasswordRecoveryParams } = await loadModule();

    expect(hasPasswordRecoveryParams({ hash: "#access_token=token&type=recovery" })).toBe(true);
    expect(hasPasswordRecoveryParams({ search: "?type=recovery" })).toBe(true);
    expect(hasPasswordRecoveryParams({ hash: "#type=signup" })).toBe(false);
  });

  it("altera a senha do usuario autenticado pelo link", async () => {
    const { updatePassword } = await loadModule();

    await updatePassword("nova-senha");

    expect(mocks.auth.updateUser).toHaveBeenCalledWith({ password: "nova-senha" });
  });

  it("logout limpa a sessao legada", async () => {
    localStorage.setItem("central_financeira_session", JSON.stringify({ access_token: "old-token" }));
    const { signOut } = await loadModule();

    await signOut();

    expect(mocks.auth.signOut).toHaveBeenCalled();
    expect(localStorage.getItem("central_financeira_session")).toBeNull();
  });
});
