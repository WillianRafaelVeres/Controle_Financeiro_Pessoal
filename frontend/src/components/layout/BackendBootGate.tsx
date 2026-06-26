import { AlertTriangle, RefreshCcw, ServerCog } from "lucide-react";
import type { PropsWithChildren } from "react";
import { useEffect, useRef, useState } from "react";

import { bootBackend, isTauriDesktop, type BackendBootResult } from "../../lib/apiBase";
import { Button } from "../ui/button";

const MAX_WAIT_S = 120;

export function BackendBootGate({
  children,
  onReady,
}: PropsWithChildren<{ onReady: (result: BackendBootResult) => void }>) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setError("");
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed((s) => Math.min(s + 1, MAX_WAIT_S));
    }, 1000);

    bootBackend()
      .then((result) => {
        if (!alive) return;
        clearInterval(timerRef.current!);
        onReady(result);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        clearInterval(timerRef.current!);
        setError(err instanceof Error ? err.message : "Nao foi possivel iniciar o servico.");
        setStatus("error");
      });

    return () => {
      alive = false;
      clearInterval(timerRef.current!);
    };
  }, [attempt, onReady]);

  if (status === "ready") return <>{children}</>;

  const isWeb = !isTauriDesktop();
  const pct = Math.min(Math.round((elapsed / MAX_WAIT_S) * 100), 99);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07111f] p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/[0.72] p-8 text-center shadow-[0_28px_90px_rgba(0,0,0,0.42)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-2xl">
        {status === "loading" ? (
          <>
            <ServerCog className="mx-auto h-9 w-9 animate-pulse text-brand-500" />
            <h1 className="mt-4 text-base font-semibold text-slate-100">
              {isWeb ? "Servidor acordando..." : "Iniciando Central Financeira..."}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {isWeb
                ? "O servidor hiberna apos inatividade. Aguarde ate 2 minutos."
                : "Abrindo o servico local e preparando o banco."}
            </p>
            {isWeb && (
              <div className="mt-5 space-y-1.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-right text-xs text-slate-600">{elapsed}s</p>
              </div>
            )}
          </>
        ) : (
          <>
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
            <h1 className="mt-4 text-base font-semibold text-slate-100">Servico nao respondeu</h1>
            <p className="mt-2 text-sm text-slate-500">{error || "Verifique os logs e tente novamente."}</p>
            <Button className="mt-5" onClick={() => setAttempt((v) => v + 1)}>
              <RefreshCcw className="h-4 w-4" />
              Tentar novamente
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
