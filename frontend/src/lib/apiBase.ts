const DEFAULT_DESKTOP_PORT = 17831;
const PORT_ATTEMPTS = 80;
const REQUIRED_API_CAPABILITIES = [
  { path: "/api/exterior-dolar/movimentos/{movimento_id}", method: "delete" },
  { path: "/api/exterior-dolar/movimentos/{movimento_id}", method: "put" },
  { path: "/api/investimentos/movimentos/{movimento_id}", method: "delete" },
  { path: "/api/investimentos/movimentos/{movimento_id}", method: "put" },
];

let apiBaseUrl = normalizeApiBase(import.meta.env.VITE_API_URL ?? `http://127.0.0.1:${DEFAULT_DESKTOP_PORT}/api`);
let backendProcess: { kill?: () => Promise<void> } | null = null;
let closeHandlerRegistered = false;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export interface BackendBootResult {
  baseUrl: string;
  port?: number;
  desktop: boolean;
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export function setApiBaseUrl(url: string) {
  apiBaseUrl = normalizeApiBase(url);
}

export function isTauriDesktop() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export async function bootBackend(): Promise<BackendBootResult> {
  if (import.meta.env.MODE === "test") {
    return { baseUrl: apiBaseUrl, port: portFromBase(apiBaseUrl), desktop: false };
  }
  if (isTauriDesktop()) {
    await startBackendSidecar();
    const discovered = await discoverBackendPort(DEFAULT_DESKTOP_PORT);
    setApiBaseUrl(discovered.baseUrl);
    return { ...discovered, desktop: true };
  }
  await waitForHealth(apiBaseUrl);
  return { baseUrl: apiBaseUrl, port: portFromBase(apiBaseUrl), desktop: false };
}

async function startBackendSidecar() {
  if (backendProcess) return;
  try {
    const shell = await import("@tauri-apps/plugin-shell");
    const command = shell.Command.sidecar("binaries/central-financeira-backend", ["--port", String(DEFAULT_DESKTOP_PORT)]);
    backendProcess = await command.spawn();
    await registerDesktopCloseHandler();
    window.addEventListener("beforeunload", () => {
      void shutdownBackend();
    });
    window.addEventListener("pagehide", () => {
      void shutdownBackend();
    });
  } catch (error) {
    console.error("Falha ao iniciar sidecar do backend", error);
  }
}

async function registerDesktopCloseHandler() {
  if (closeHandlerRegistered) return;
  closeHandlerRegistered = true;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    await appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await shutdownBackend();
      await appWindow.destroy();
    });
  } catch (error) {
    console.error("Falha ao registrar encerramento do backend", error);
  }
}

async function shutdownBackend() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1200);
  try {
    await fetch(`${apiBaseUrl}/configuracoes/encerrar`, {
      method: "POST",
      signal: controller.signal,
      keepalive: true,
    });
  } catch {
    // The backend can already be down when the window closes.
  } finally {
    window.clearTimeout(timeout);
    await backendProcess?.kill?.().catch(() => undefined);
    backendProcess = null;
  }
}

async function discoverBackendPort(preferred: number) {
  const ports = [preferred, ...Array.from({ length: PORT_ATTEMPTS }, (_, index) => preferred + index + 1)];
  for (const port of ports) {
    const baseUrl = `http://127.0.0.1:${port}/api`;
    try {
      await waitForHealth(baseUrl, 15, 250);
      return { baseUrl, port };
    } catch {
      // Try next port.
    }
  }
  throw new Error("Não foi possível iniciar o serviço local.");
}

export async function waitForHealth(baseUrl: string, attempts = 40, delayMs = 300) {
  const healthUrl = baseUrl.replace(/\/api\/?$/, "/health");
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(healthUrl, { cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        if (body.status === "ok") {
          await assertBackendCompatible(baseUrl);
          return;
        }
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw lastError instanceof Error ? lastError : new Error("Backend local indisponível.");
}

async function assertBackendCompatible(baseUrl: string) {
  const apiRoot = baseUrl.replace(/\/api\/?$/, "");
  const response = await fetch(`${apiRoot}/openapi.json`, { cache: "no-store" });
  if (!response.ok) throw new Error("Backend local incompativel.");
  const openapi = await response.json();
  const paths = openapi?.paths ?? {};
  const missing = REQUIRED_API_CAPABILITIES.find(({ path, method }) => !paths[path]?.[method]);
  if (missing) {
    throw new Error("Backend local antigo detectado. Feche instancias antigas e abra novamente o aplicativo.");
  }
}

function normalizeApiBase(url: string) {
  const clean = url.replace(/\/$/, "");
  return clean.endsWith("/api") ? clean : `${clean}/api`;
}

function portFromBase(url: string) {
  try {
    return Number(new URL(url).port);
  } catch {
    return undefined;
  }
}
