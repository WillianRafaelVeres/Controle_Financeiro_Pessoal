import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import { currentMonth } from "../lib/utils";

export function useResumoFinanceiro(enabled = true) {
  const month = currentMonth();

  return useQuery({
    queryKey: ["painel", "resumo", month],
    queryFn: () => api.painelResumo(month.ano, month.mes),
    enabled,
  });
}
