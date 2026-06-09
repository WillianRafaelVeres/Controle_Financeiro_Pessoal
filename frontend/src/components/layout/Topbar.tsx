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
    <header className="sticky top-0 z-30 min-h-[72px] border-b border-white/10 bg-slate-950/[0.48] px-3 py-3 shadow-[0_16px_48px_rgba(0,0,0,0.22)] backdrop-blur-2xl sm:px-5 lg:px-6">
      <div className="flex min-h-12 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5 lg:flex-row lg:items-baseline lg:gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="whitespace-nowrap text-[15px] font-semibold text-slate-200">Saldo livre para gastar</span>
            <span
              className={cn(
                "whitespace-nowrap text-xl font-semibold leading-7",
                resumo.isLoading && !hasValue ? "text-slate-400" : isNegative ? "text-red-300" : "text-slate-50",
              )}
            >
              {hasValue ? formatMoney(saldoLivre) : resumo.isLoading ? "Atualizando..." : "Indisponível"}
            </span>
          </div>
          <p className="truncate text-[12px] text-slate-400 lg:rounded-full lg:border lg:border-white/10 lg:bg-white/[0.05] lg:px-2.5 lg:py-1">{backendStatus}</p>
        </div>
        <Button onClick={onNewLancamento} className="w-full shrink-0 sm:w-auto" aria-label="Novo lançamento">
          <Plus className="h-4 w-4" />
          Novo lançamento
        </Button>
      </div>
    </header>
  );
}
