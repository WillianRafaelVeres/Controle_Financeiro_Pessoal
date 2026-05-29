import { Plus } from "lucide-react";

import { useResumoFinanceiro } from "../../hooks/useResumoFinanceiro";
import { formatMoney, toNumber } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

export function Topbar({
  backendStatus,
  onNewLancamento,
}: {
  backendStatus: string;
  onNewLancamento: () => void;
}) {
  const resumo = useResumoFinanceiro();
  const saldoLivre = resumo.data?.saldo_livre;
  const hasValue = saldoLivre !== undefined && saldoLivre !== null;
  const isNegative = hasValue && toNumber(saldoLivre) < 0;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#0f151d]/92 px-3 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.16)] backdrop-blur sm:px-4 lg:px-5">
      <div className="flex min-h-10 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5 lg:flex-row lg:items-baseline lg:gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="whitespace-nowrap text-sm font-semibold text-slate-300">Saldo livre para gastar</span>
            <span
              className={cn(
                "whitespace-nowrap text-lg font-semibold leading-6",
                resumo.isLoading && !hasValue ? "text-slate-400" : isNegative ? "text-red-300" : "text-slate-50",
              )}
            >
              {hasValue ? formatMoney(saldoLivre) : resumo.isLoading ? "Atualizando..." : "Indisponível"}
            </span>
          </div>
          <p className="truncate text-[11px] text-slate-500">{backendStatus}</p>
        </div>
        <Button onClick={onNewLancamento} className="w-full shrink-0 sm:w-auto" aria-label="Novo lançamento">
          <Plus className="h-4 w-4" />
          Novo lançamento
        </Button>
      </div>
    </header>
  );
}
