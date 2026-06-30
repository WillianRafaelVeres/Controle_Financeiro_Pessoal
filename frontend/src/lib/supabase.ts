import { createClient, type AuthChangeEvent, type EmailOtpType, type Session, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const LEGACY_SESSION_KEY = "central_financeira_session";
const PASSWORD_RECOVERY_REQUEST_KEY = "central_financeira_password_recovery_requested_at";
const PASSWORD_RECOVERY_REQUEST_TTL_MS = 1000 * 60 * 30;

export const PASSWORD_RESET_PATH = "/reset-password";
const configuredPasswordResetRedirectUrl = (import.meta.env.VITE_PASSWORD_RESET_REDIRECT_URL as string | undefined)?.trim();

export const PASSWORD_RESET_REDIRECT_URL =
  configuredPasswordResetRedirectUrl ||
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

function rememberPasswordRecoveryRequest() {
  try {
    localStorage.setItem(PASSWORD_RECOVERY_REQUEST_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

function clearPasswordRecoveryRequest() {
  try {
    localStorage.removeItem(PASSWORD_RECOVERY_REQUEST_KEY);
  } catch {
    // ignore
  }
}

function hasRecentPasswordRecoveryRequest(): boolean {
  try {
    const requestedAt = Number(localStorage.getItem(PASSWORD_RECOVERY_REQUEST_KEY));
    return Number.isFinite(requestedAt) && Date.now() - requestedAt < PASSWORD_RECOVERY_REQUEST_TTL_MS;
  } catch {
    return false;
  }
}

interface BrowserLocationLike {
  hash?: string;
  hostname?: string;
  origin?: string;
  pathname?: string;
  search?: string;
}

function isLocalHostname(hostname?: string): boolean {
  if (!hostname) return false;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1";
}

function isLocalUrl(value: string): boolean {
  try {
    return isLocalHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

function browserLocation(): BrowserLocationLike | undefined {
  return typeof window === "undefined" ? undefined : window.location;
}

export function getPasswordResetRedirectUrl(location = browserLocation()): string {
  const currentOrigin = location?.origin && location.origin !== "null" ? location.origin : undefined;
  const currentHostname = location?.hostname;
  const currentOriginRedirectUrl =
    currentOrigin && !isLocalHostname(currentHostname)
      ? `${currentOrigin}${PASSWORD_RESET_PATH}`
      : undefined;

  if (currentOriginRedirectUrl && (!configuredPasswordResetRedirectUrl || isLocalUrl(configuredPasswordResetRedirectUrl))) {
    return currentOriginRedirectUrl;
  }

  return configuredPasswordResetRedirectUrl || currentOriginRedirectUrl || PASSWORD_RESET_REDIRECT_URL;
}

function hasRecoveryType(value?: string): boolean {
  if (!value) return false;
  const params = new URLSearchParams(value.replace(/^[#?]/, ""));
  return params.get("type") === "recovery";
}

function authCode(value?: string): string | null {
  if (!value) return null;
  return new URLSearchParams(value.replace(/^[#?]/, "")).get("code");
}

function recoveryTokenHash(value?: string): string | null {
  if (!value) return null;
  const params = new URLSearchParams(value.replace(/^[#?]/, ""));
  if (params.get("type") !== "recovery") return null;
  return params.get("token_hash");
}

export function hasPasswordRecoveryParams(location = browserLocation()): boolean {
  if (hasRecoveryType(location?.hash) || hasRecoveryType(location?.search)) return true;
  if (recoveryTokenHash(location?.search)) return true;
  if (!authCode(location?.search)) return false;
  return location?.pathname === PASSWORD_RESET_PATH || hasRecentPasswordRecoveryRequest();
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
  clearPasswordRecoveryRequest();
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

export async function getRecoverySession(): Promise<Session | null> {
  const session = await getCurrentSession();
  if (session?.access_token) return session;

  const code = authCode(browserLocation()?.search);
  if (code) {
    const { data, error } = await getClient().auth.exchangeCodeForSession(code);
    if (error) return null;
    return data.session;
  }

  const tokenHash = recoveryTokenHash(browserLocation()?.search);
  if (!tokenHash) return null;

  const { data, error } = await getClient().auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery" as EmailOtpType,
  });
  if (error) return null;
  return data.session;
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.access_token ?? legacyAccessToken();
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await getClient().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: getPasswordResetRedirectUrl(),
  });
  if (error) throw new Error(error.message);
  rememberPasswordRecoveryRequest();
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
