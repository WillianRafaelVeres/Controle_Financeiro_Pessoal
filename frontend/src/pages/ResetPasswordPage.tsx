import { Loader2, Lock } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";

import { getRecoverySession, isSupabaseConfigured, onAuthStateChange, signOut, updatePassword } from "../lib/supabase";

interface ResetPasswordPageProps {
  onBackToLogin: (message?: string) => void;
}

type RecoveryStatus = "checking" | "ready" | "invalid";

const cls = "w-full rounded-xl border border-white/10 bg-slate-800/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/40";

export function ResetPasswordPage({ onBackToLogin }: ResetPasswordPageProps) {
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasRecoverySession = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus("invalid");
      setError("Supabase nao configurado.");
      return;
    }

    let active = true;
    let retryTimer: number | undefined;

    function markReady() {
      if (!active) return;
      hasRecoverySession.current = true;
      setError("");
      setStatus("ready");
    }

    const unsubscribe = onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session?.access_token) markReady();
    });

    async function hasSession() {
      try {
        const session = await getRecoverySession();
        return Boolean(session?.access_token);
      } catch {
        return false;
      }
    }

    async function checkSession() {
      if (await hasSession()) {
        markReady();
        return;
      }
      retryTimer = window.setTimeout(async () => {
        if (hasRecoverySession.current) return;
        if (await hasSession()) {
          markReady();
          return;
        }
        if (!active) return;
        setError("Link invalido ou expirado. Solicite um novo e-mail de recuperacao.");
        setStatus("invalid");
      }, 700);
    }

    checkSession();
    return () => {
      active = false;
      if (retryTimer) window.clearTimeout(retryTimer);
      unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas nao coincidem.");
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      await signOut();
      window.history.replaceState(null, "", "/");
      onBackToLogin("Senha alterada. Entre com a nova senha.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel alterar a senha.");
    } finally {
      setLoading(false);
    }
  }

  async function backToLogin() {
    await signOut();
    window.history.replaceState(null, "", "/");
    onBackToLogin();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07111f] p-6">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 ring-1 ring-brand-500/30">
            <Lock className="h-7 w-7 text-brand-400" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-slate-100">Nova senha</h1>
            <p className="mt-0.5 text-sm text-slate-500">Atualize sua senha de acesso</p>
          </div>
        </div>

        {status === "checking" && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-800/40 px-3.5 py-3 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Validando link...
          </div>
        )}

        {status === "invalid" && (
          <div className="space-y-4">
            {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">{error}</p>}
            <button type="button" onClick={backToLogin} className="flex w-full items-center justify-center rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600">
              Voltar para entrar
            </button>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="reset-password" className="block text-xs font-medium text-slate-400">Nova senha</label>
              <input id="reset-password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} className={cls} placeholder="Minimo 6 caracteres" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="reset-password-confirm" className="block text-xs font-medium text-slate-400">Confirmar senha</label>
              <input id="reset-password-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} className={cls} placeholder="********" />
            </div>
            {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">{error}</p>}
            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</> : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
