import { Loader2, Lock, UserPlus } from "lucide-react";
import { useState } from "react";
import { signIn, signUp } from "../lib/supabase";

interface LoginPageProps { onLogin: () => void; }
type Tab = "login" | "signup";

const cls = "w-full rounded-xl border border-white/10 bg-slate-800/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/40";

export function LoginPage({ onLogin }: LoginPageProps) {
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const reset = () => { setError(""); setSuccess(""); };

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); reset();
    try { await signIn(email, password); onLogin(); }
    catch (err) { setError(err instanceof Error ? err.message : "Erro ao fazer login."); }
    finally { setLoading(false); }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("As senhas nao coincidem."); return; }
    if (password.length < 6) { setError("Senha deve ter pelo menos 6 caracteres."); return; }
    setLoading(true); reset();
    try {
      await signUp(email, password);
      setSuccess("Conta criada! Faca login para continuar.");
      setTab("login"); setPassword(""); setConfirm("");
    }
    catch (err) { setError(err instanceof Error ? err.message : "Erro ao criar conta."); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07111f] p-6">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 ring-1 ring-brand-500/30">
            {tab === "login" ? <Lock className="h-7 w-7 text-brand-400" /> : <UserPlus className="h-7 w-7 text-brand-400" />}
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-slate-100">Central Financeira</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {tab === "login" ? "Entre com sua conta" : "Crie sua conta gratuita"}
            </p>
          </div>
        </div>

        <div className="mb-5 flex rounded-xl border border-white/10 bg-slate-800/40 p-1">
          {(["login", "signup"] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => { setTab(t); reset(); }}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${tab === t ? "bg-brand-500 text-white" : "text-slate-400 hover:text-slate-200"}`}>
              {t === "login" ? "Entrar" : "Criar conta"}
            </button>
          ))}
        </div>

        {success && <div className="mb-4 rounded-xl border border-green-500/20 bg-green-500/10 px-3.5 py-2.5 text-xs text-green-400">{success}</div>}

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400">E-mail</label>
              <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className={cls} placeholder="voce@email.com" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400">Senha</label>
              <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className={cls} placeholder="••••••••" />
            </div>
            {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">{error}</p>}
            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Entrando...</> : "Entrar"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400">E-mail</label>
              <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className={cls} placeholder="voce@email.com" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400">Senha</label>
              <input type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} className={cls} placeholder="Minimo 6 caracteres" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400">Confirmar senha</label>
              <input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} className={cls} placeholder="••••••••" />
            </div>
            {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">{error}</p>}
            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Criando...</> : "Criar conta"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
