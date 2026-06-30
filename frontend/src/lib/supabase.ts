import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const LEGACY_SESSION_KEY = "central_financeira_session";

export const PASSWORD_RESET_PATH = "/reset-password";
export const PASSWORD_RESET_REDIRECT_URL =
  (import.meta.env.VITE_PASSWORD_RESET_REDIRECT_URL as string | undefined) ||
  "https://controle-financeiro-pessoal-jz43.onrender.com/reset-password";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;

interface LegacySession {
  access_token?: string;
  expires_at?: number;
}

function getClient(): SupabaseClient {
  if (!supabase) throw new Error("Supabase nao configurado.");
  return supabase;
}

function readLegacySession(): LegacySession | null {
  try {
    const raw = localStorage.getItem(LEGACY_SESSION_KEY);
    return raw ? (JSON.parse(raw) as LegacySession) : null;
  } catch {
    return null;
  }
}

function legacyAccessToken(): string | null {
  const session = readLegacySession();
  if (!session?.access_token) return null;
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at <= now + 30) return null;
  return session.access_token;
}

function clearLegacySession() {
  localStorage.removeItem(LEGACY_SESSION_KEY);
}

export async function signIn(email: string, password: string): Promise<string> {
  const { data, error } = await getClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
  if (!data.session?.access_token) throw new Error("Sem token na resposta.");
  clearLegacySession();
  return data.session.access_token;
}

export async function signUp(email: string, password: string): Promise<void> {
  const { error } = await getClient().auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  try {
    if (supabase) await supabase.auth.signOut();
  } catch {
    // ignore
  }
  clearLegacySession();
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.access_token ?? legacyAccessToken();
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await getClient().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: PASSWORD_RESET_REDIRECT_URL,
  });
  if (error) throw new Error(error.message);
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await getClient().auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}
