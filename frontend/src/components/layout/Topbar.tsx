import { Plus, RefreshCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "../ui/button";

export function Topbar({
  title,
  backendStatus,
  onNewLancamento,
}: {
  title: string;
  backendStatus: string;
  onNewLancamento: () => void;
}) {
  const queryClient = useQueryClient();
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between gap-3 border-b border-slate-800 bg-[#0f151d]/95 px-3 backdrop-blur sm:px-4 lg:px-5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-100">{title}</p>
        <p className="hidden text-[11px] text-slate-500 sm:block">{backendStatus}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="icon" onClick={() => queryClient.invalidateQueries()} aria-label="Atualizar dados">
          <RefreshCcw className="h-4 w-4" />
        </Button>
        <Button onClick={onNewLancamento} className="hidden sm:inline-flex">
          <Plus className="h-4 w-4" />
          Novo lançamento
        </Button>
      </div>
    </header>
  );
}
