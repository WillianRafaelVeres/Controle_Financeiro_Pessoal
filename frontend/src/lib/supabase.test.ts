import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const auth = {
    exchangeCodeForSession: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    signUp: vi.fn(),
    updateUser: vi.fn(),
    verifyOtp: vi.fn(),
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
    mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: "recovery-token" } }, error: null });
    mocks.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: "token-123" } }, error: null });
    mocks.auth.signOut.mockResolvedValue({ error: null });
    mocks.auth.signUp.mockResolvedValue({ data: {}, error: null });
    mocks.auth.updateUser.mockResolvedValue({ data: {}, error: null });
    mocks.auth.verifyOtp.mockResolvedValue({ data: { session: { access_token: "token-hash-session" } }, error: null });
  });

  it("faz login e retorna o token da sessao", async () => {
    const { signIn } = await loadModule();

    await expect(signIn(" pessoa@email.com ", "senha123")).resolves.toBe("token-123");

    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({ email: "pessoa@email.com", password: "senha123" });
  });

  it("envia recuperacao de senha com redirect configurado", async () => {
    const { getPasswordResetRedirectUrl, hasPasswordRecoveryParams, sendPasswordReset } = await loadModule();

    await sendPasswordReset("pessoa@email.com");

    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith("pessoa@email.com", {
      redirectTo: getPasswordResetRedirectUrl(),
    });
    expect(hasPasswordRecoveryParams({ pathname: "/", search: "?code=abc" })).toBe(true);
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
    expect(hasPasswordRecoveryParams({ pathname: "/reset-password", search: "?token_hash=abc&type=recovery" })).toBe(true);
    expect(hasPasswordRecoveryParams({ pathname: "/reset-password", search: "?code=abc" })).toBe(true);
    expect(hasPasswordRecoveryParams({ pathname: "/", search: "?code=abc" })).toBe(false);
    expect(hasPasswordRecoveryParams({ hash: "#type=signup" })).toBe(false);
  });

  it("troca codigo de recuperacao por sessao quando necessario", async () => {
    window.history.replaceState(null, "", "/reset-password?code=recovery-code");
    const { getRecoverySession } = await loadModule();

    await expect(getRecoverySession()).resolves.toEqual({ access_token: "recovery-token" });

    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
  });

  it("valida token_hash de recuperacao vindo do template personalizado", async () => {
    window.history.replaceState(null, "", "/reset-password?token_hash=token-hash&type=recovery");
    const { getRecoverySession } = await loadModule();

    await expect(getRecoverySession()).resolves.toEqual({ access_token: "token-hash-session" });

    expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "token-hash",
      type: "recovery",
    });
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
