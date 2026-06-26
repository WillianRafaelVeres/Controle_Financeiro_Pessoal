const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SESSION_KEY = "central_financeira_session";

interface StoredSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error_description?: string;
  msg?: string;
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export async function signIn(email: string, password: string): Promise<string> {
  const data = await authRequest("/auth/v1/token?grant_type=password", { email, password });
  if (!data.access_token) throw new Error("Sem token na resposta.");
  storeSession(data);
  return data.access_token;
}

export async function signUp(email: string, password: string): Promise<void> {
  const data = await authRequest("/auth/v1/signup", { email, password });
  if (data.access_token) storeSession(data);
}

export async function signOut(): Promise<void> {
  try {
    const token = readSession()?.access_token;
    if (token && supabaseUrl && supabaseAnonKey) {
      await fetch(`${supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
      });
    }
  } catch {
    // ignore
  }
  localStorage.removeItem(SESSION_KEY);
}

export async function getAccessToken(): Promise<string | null> {
  const session = readSession();
  if (!session?.access_token) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || session.expires_at > now + 30) return session.access_token;
  if (!session.refresh_token) { await signOut(); return null; }
  try {
    const data = await authRequest("/auth/v1/token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    });
    if (!data.access_token) throw new Error();
    storeSession(data);
    return data.access_token;
  } catch {
    await signOut();
    return null;
  }
}

async function authRequest(path: string, body: Record<string, string>): Promise<AuthResponse> {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase nao configurado.");
  const resp = await fetch(`${supabaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: supabaseAnonKey },
    body: JSON.stringify(body),
  });
  const data = (await resp.json()) as AuthResponse;
  if (!resp.ok) throw new Error(data.error_description ?? data.msg ?? "Erro ao autenticar.");
  return data;
}

function storeSession(data: AuthResponse) {
  const expiresAt = data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : undefined;
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
  }));
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch { return null; }
}
