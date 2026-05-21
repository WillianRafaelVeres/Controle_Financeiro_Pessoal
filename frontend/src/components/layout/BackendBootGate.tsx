import { AlertTriangle, Loader2, RefreshCcw } from "lucide-react";
import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";

import { bootBackend, type BackendBootResult } from "../../lib/apiBase";
import { Button } from "../ui/button";

export function BackendBootGate({
  children,
  onReady,
}: PropsWithChildren<{ onReady: (result: BackendBootResult) => void }>) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setError("");
    bootBackend()
      .then((result) => {
        if (!alive) return;
        onReady(result);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Não foi possível iniciar o serviço local.");
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [attempt, onReady]);

  if (status === "ready") return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090d12] p-6">
      <div className="w-full max-w-md rounded-md border border-slate-800 bg-[#111821] p-5 text-center">
        {status === "loading" ? (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-500" />
            <h1 className="mt-4 text-base font-semibold text-slate-100">Iniciando Central Financeira...</h1>
            <p className="mt-2 text-sm text-slate-500">Abrindo o serviço local e preparando o banco SQLite.</p>
          </>
        ) : (
          <>
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
            <h1 className="mt-4 text-base font-semibold text-slate-100">Não foi possível iniciar o serviço local.</h1>
            <p className="mt-2 text-sm text-slate-500">{error || "Verifique os logs e tente novamente."}</p>
            <Button className="mt-5" onClick={() => setAttempt((value) => value + 1)}>
              <RefreshCcw className="h-4 w-4" />
              Tentar novamente
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
