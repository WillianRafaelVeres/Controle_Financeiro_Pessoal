import type { QueryClient } from "@tanstack/react-query";

function invalidateMany(queryClient: QueryClient, queryKeys: unknown[][]) {
  return Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function invalidatePlanningData(queryClient: QueryClient) {
  return invalidateMany(queryClient, [["planejamento"], ["orcamentos"], ["painel"], ["dashboard"], ["relatorios"]]);
}

export function invalidateLaunchData(queryClient: QueryClient) {
  return invalidateMany(queryClient, [
    ["lancamentos"],
    ["painel"],
    ["dashboard"],
    ["planejamento"],
    ["orcamentos"],
    ["cartoes"],
    ["contas"],
    ["compromissos"],
    ["contas-futuras"],
    ["caixinhas"],
    ["relatorios"],
  ]);
}

export function invalidateInvestmentData(queryClient: QueryClient) {
  return invalidateMany(queryClient, [
    ["posicoes"],
    ["investimentos"],
    ["dividendos"],
    ["painel"],
    ["dashboard"],
    ["planejamento"],
    ["orcamentos"],
    ["dolar-resumo"],
    ["dolar-extrato"],
    ["relatorios"],
  ]);
}

export function invalidateDollarData(queryClient: QueryClient) {
  return invalidateMany(queryClient, [
    ["dolar-resumo"],
    ["dolar-extrato"],
    ["dolar-cotacao-atual"],
    ["painel"],
    ["dashboard"],
    ["posicoes"],
    ["investimentos"],
    ["relatorios"],
  ]);
}

export function invalidateCardData(queryClient: QueryClient) {
  return invalidateMany(queryClient, [["cartoes"], ["lancamentos", "opcoes"], ["compromissos"], ["painel"], ["dashboard"], ["relatorios"]]);
}

export function invalidateSettingsData(queryClient: QueryClient) {
  return invalidateMany(queryClient, [
    ["categorias"],
    ["subcategorias"],
    ["metodos"],
    ["contas"],
    ["cartoes"],
    ["lancamentos", "opcoes"],
    ["diagnostico"],
    ["lancamentos"],
    ["planejamento"],
    ["orcamentos"],
    ["compromissos"],
    ["caixinhas"],
    ["painel"],
    ["dashboard"],
    ["relatorios"],
  ]);
}
