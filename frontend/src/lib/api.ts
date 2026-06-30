import type {
  Ativo,
  CartaoResumo,
  Caixinha,
  Categoria,
  CompromissoCartao,
  Conta,
  ContaFutura,
  ContaSaldo,
  CotacaoDolarAtual,
  DashboardResumo,
  DesempenhoInvestimentos,
  Dividendo,
  HistoricoDesempenhoInvestimento,
  HistoricoProventosInvestimentos,
  Lancamento,
  LancamentoOpcoes,
  MetodoPagamento,
  MovimentoInvestimento,
  OrcamentoLinha,
  PlanejamentoNaoPlanejado,
  PlanejamentoResumo,
  Posicao,
  ExtratoDolar,
  ResumoDolar,
  Diagnostico,
  NaturezaCategoria,
  Subcategoria,
  TipoAtivo,
  TipoMetodo,
  TipoProvento,
} from "./types";
import { getApiBaseUrl } from "./apiBase";
import { getAccessToken, isSupabaseConfigured } from "./supabase";

type Query = Record<string, string | number | boolean | undefined | null>;

function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, query?: Query): Promise<T> {
  const authHeaders: Record<string, string> = {};
  if (isSupabaseConfigured) {
    const token = await getAccessToken();
    if (token) authHeaders["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(`${getApiBaseUrl()}${withQuery(path, query)}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(options.headers ?? {}),
    },
    ...options,
  });
  if (!response.ok) {
    let message = "Nao foi possivel concluir a operacao.";
    try {
      const body = await response.json();
      message = body.detail ?? message;
    } catch {
      message = response.statusText;
    }
    throw new Error(Array.isArray(message) ? message.map((item) => item.msg).join(", ") : message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  painelResumo: (ano: number, mes: number) => apiFetch<DashboardResumo>("/painel/resumo", {}, { ano, mes }),
  planejamentoResumo: (ano: number, mes: number) => apiFetch<PlanejamentoResumo>("/planejamento/resumo", {}, { ano, mes }),
  dashboardResumo: (ano: number, mes: number) => apiFetch<DashboardResumo>("/dashboard/resumo", {}, { ano, mes }),
  dashboardGraficos: (ano: number, mes: number) => apiFetch<Record<string, Array<Record<string, string | number>>>>("/dashboard/graficos", {}, { ano, mes }),
  conciliacao: () => apiFetch<Record<string, string | number>>("/dashboard/conciliacao"),

  categorias: (natureza?: NaturezaCategoria, incluir_inativas = false) =>
    apiFetch<Categoria[]>("/categorias", {}, { natureza, incluir_inativas }),
  criarCategoria: (payload: string | { nome: string; natureza?: NaturezaCategoria }) =>
    apiFetch<Categoria>(
      "/categorias",
      { method: "POST", body: JSON.stringify(typeof payload === "string" ? { nome: payload } : payload) },
    ),
  inativarCategoria: (id: string) => apiFetch<void>(`/categorias/${id}`, { method: "DELETE" }),
  reativarCategoria: (id: string) => apiFetch<Categoria>(`/categorias/${id}/reativar`, { method: "POST" }),
  subcategorias: (categoria_id?: string, incluir_inativas = false) =>
    apiFetch<Subcategoria[]>("/subcategorias", {}, { categoria_id, incluir_inativas }),
  criarSubcategoria: (payload: { nome: string; categoria_id: string }) =>
    apiFetch<Subcategoria>("/subcategorias", { method: "POST", body: JSON.stringify(payload) }),
  inativarSubcategoria: (id: string) => apiFetch<void>(`/subcategorias/${id}`, { method: "DELETE" }),
  reativarSubcategoria: (id: string) => apiFetch<Subcategoria>(`/subcategorias/${id}/reativar`, { method: "POST" }),

  metodos: () => apiFetch<MetodoPagamento[]>("/metodos-pagamento"),
  criarMetodo: (payload: { nome: string; tipo_metodo?: TipoMetodo }) =>
    apiFetch<MetodoPagamento>("/metodos-pagamento", { method: "POST", body: JSON.stringify({ ...payload, tipo_metodo: payload.tipo_metodo ?? "OUTRO" }) }),
  inativarMetodo: (id: string) => apiFetch<void>(`/metodos-pagamento/${id}`, { method: "DELETE" }),

  contas: (incluir_inativas = false) => apiFetch<Conta[]>("/contas", {}, { incluir_inativas }),
  criarConta: (payload: Record<string, unknown>) => apiFetch<Conta>("/contas", { method: "POST", body: JSON.stringify(payload) }),
  atualizarConta: (id: string, payload: Record<string, unknown>) =>
    apiFetch<Conta>(`/contas/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  atualizarSaldoConta: (id: string, payload: Record<string, unknown>) =>
    apiFetch<Conta>(`/contas/${id}/atualizar-saldo`, { method: "POST", body: JSON.stringify(payload) }),
  historicoSaldosConta: (id: string) => apiFetch<ContaSaldo[]>(`/contas/${id}/historico-saldos`),
  inativarConta: (id: string) => apiFetch<void>(`/contas/${id}`, { method: "DELETE" }),

  contasFuturas: (incluir_pagas = true) => apiFetch<ContaFutura[]>("/contas-futuras", {}, { incluir_pagas }),
  criarContaFutura: (payload: Record<string, unknown>) =>
    apiFetch<ContaFutura>("/contas-futuras", { method: "POST", body: JSON.stringify(payload) }),
  atualizarContaFutura: (id: string, payload: Record<string, unknown>) =>
    apiFetch<ContaFutura>(`/contas-futuras/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  pagarContaFutura: (id: string, payload: Record<string, unknown>) =>
    apiFetch<Lancamento>(`/contas-futuras/${id}/pagar`, { method: "POST", body: JSON.stringify(payload) }),
  cancelarContaFutura: (id: string) => apiFetch<void>(`/contas-futuras/${id}`, { method: "DELETE" }),

  caixinhas: () => apiFetch<Caixinha[]>("/caixinhas"),
  criarCaixinha: (payload: Record<string, unknown>) => apiFetch<Caixinha>("/caixinhas", { method: "POST", body: JSON.stringify(payload) }),
  atualizarCaixinha: (id: string, payload: Record<string, unknown>) =>
    apiFetch<Caixinha>(`/caixinhas/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  usarCaixinha: (id: string, payload: Record<string, unknown>) =>
    apiFetch<Lancamento>(`/caixinhas/${id}/usar`, { method: "POST", body: JSON.stringify(payload) }),
  excluirCaixinha: (id: string) => apiFetch<void>(`/caixinhas/${id}`, { method: "DELETE" }),

  cartoes: () => apiFetch<CartaoResumo[]>("/cartoes"),
  criarCartao: (payload: Record<string, unknown>) => apiFetch<CartaoResumo>("/cartoes", { method: "POST", body: JSON.stringify(payload) }),
  atualizarCartao: (id: string, payload: Record<string, unknown>) =>
    apiFetch<CartaoResumo>(`/cartoes/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  inativarCartao: (id: string) => apiFetch<void>(`/cartoes/${id}`, { method: "DELETE" }),
  informarFatura: (cartaoId: string, valor: number) =>
    apiFetch(`/cartoes/${cartaoId}/informar-fatura`, { method: "POST", body: JSON.stringify({ valor }) }),
  pagarFatura: (cartaoId: string, valor_pago: number) =>
    apiFetch(`/cartoes/${cartaoId}/pagar-fatura`, { method: "POST", body: JSON.stringify({ valor_pago }) }),

  lancamentos: (ano: number, mes: number) => apiFetch<Lancamento[]>("/lancamentos", {}, { ano, mes }),
  lancamentoOpcoes: () => apiFetch<LancamentoOpcoes>("/lancamentos/opcoes"),
  criarLancamento: (payload: Record<string, unknown>) =>
    apiFetch<Lancamento>("/lancamentos", { method: "POST", body: JSON.stringify(payload) }),
  atualizarLancamento: (id: string, payload: Record<string, unknown>) =>
    apiFetch<Lancamento>(`/lancamentos/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  excluirLancamento: (id: string) => apiFetch<void>(`/lancamentos/${id}`, { method: "DELETE" }),

  compromissos: () => apiFetch<CompromissoCartao[]>("/compromissos-cartao"),
  separarCompromisso: (id: string, valor: number) =>
    apiFetch(`/compromissos-cartao/${id}/separar`, { method: "POST", body: JSON.stringify({ valor }) }),

  orcamentos: (ano: number, mes: number) => apiFetch<OrcamentoLinha[]>("/orcamentos", {}, { ano, mes }),
  orcamentosItens: (ano: number, mes: number) => apiFetch<OrcamentoLinha[]>("/orcamentos/itens/{ano}/{mes}".replace("{ano}", String(ano)).replace("{mes}", String(mes))),
  adicionarItemOrcamento: (payload: Record<string, unknown>) =>
    apiFetch("/orcamentos/itens", { method: "POST", body: JSON.stringify(payload) }),
  atualizarItemOrcamento: (itemId: string, payload: Record<string, unknown>) =>
    apiFetch(`/orcamentos/itens/${itemId}`, { method: "PUT", body: JSON.stringify(payload) }),
  removerItemOrcamento: (itemId: string, escopo: string) =>
    apiFetch(`/orcamentos/itens/${itemId}`, { method: "DELETE", body: JSON.stringify({ escopo }) }),
  copiarMesAnteriorOrcamento: (ano: number, mes: number, modo = "AUSENTES") =>
    apiFetch(`/orcamentos/${ano}/${mes}/copiar-anterior`, { method: "POST" }, { modo }),
  naoPlanejadosOrcamento: (ano: number, mes: number) =>
    apiFetch<PlanejamentoNaoPlanejado[]>(`/orcamentos/nao-planejados/${ano}/${mes}`),
  alterarOrcamento: (payload: Record<string, unknown>) =>
    apiFetch("/orcamentos/alterar", { method: "POST", body: JSON.stringify(payload) }),

  ativos: () => apiFetch<Ativo[]>("/investimentos/ativos"),
  criarAtivo: (payload: Record<string, unknown>) => apiFetch<Ativo>("/investimentos/ativos", { method: "POST", body: JSON.stringify(payload) }),
  posicoes: () => apiFetch<Posicao[]>("/investimentos/posicoes"),
  desempenhoInvestimentos: () => apiFetch<DesempenhoInvestimentos>("/investimentos/desempenho"),
  historicoDesempenhoInvestimentos: (modo: "mensal" | "anual") =>
    apiFetch<HistoricoDesempenhoInvestimento[]>("/investimentos/desempenho/historico", {}, { modo }),
  historicoProventosInvestimentos: (
    modo: "mensal" | "anual",
    filtros: { tipo_ativo?: TipoAtivo | ""; ativo_id?: string; tipo_provento?: TipoProvento | "" } = {},
  ) => apiFetch<HistoricoProventosInvestimentos>("/investimentos/desempenho/proventos", {}, { modo, ...filtros }),
  comprar: (payload: Record<string, unknown>) => apiFetch("/investimentos/comprar", { method: "POST", body: JSON.stringify(payload) }),
  vender: (payload: Record<string, unknown>) => apiFetch("/investimentos/vender", { method: "POST", body: JSON.stringify(payload) }),
  movimentosInvestimentos: () => apiFetch<MovimentoInvestimento[]>("/investimentos/movimentos"),
  atualizarMovimentoInvestimento: (id: string, payload: Record<string, unknown>) =>
    apiFetch<MovimentoInvestimento>(`/investimentos/movimentos/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  excluirMovimentoInvestimento: (id: string) => apiFetch<void>(`/investimentos/movimentos/${id}`, { method: "DELETE" }),
  atualizarCotacaoAtivo: (ativoId: string, preco: number) =>
    apiFetch(`/investimentos/ativos/${ativoId}/cotacao`, { method: "POST", body: JSON.stringify({ preco }) }),
  buscarCotacaoAtivo: (ativoId: string) => apiFetch(`/investimentos/ativos/${ativoId}/cotacao/auto`, { method: "POST" }),
  atualizarCotacoesInvestimentos: () => apiFetch<{ atualizados: unknown[]; falhas: unknown[] }>("/investimentos/cotacoes/atualizar", { method: "POST" }),
  projecaoPatrimonioInvestimentos: (aporteMensal: number, taxaAnual: number, meses: number) =>
    apiFetch<Array<{ mes: number; valor_projetado: number; aporte_acumulado: number; resultado_acumulado: number }>>("/investimentos/projecao", {}, { aporte_mensal: aporteMensal, taxa_anual: taxaAnual, meses }),

  dividendos: () => apiFetch<Dividendo[]>("/dividendos"),
  ativosDividendos: () => apiFetch<Ativo[]>("/dividendos/ativos-disponiveis"),
  criarDividendo: (payload: Record<string, unknown>) => apiFetch<Dividendo>("/dividendos", { method: "POST", body: JSON.stringify(payload) }),
  atualizarDividendo: (id: string, payload: Record<string, unknown>) =>
    apiFetch<Dividendo>(`/dividendos/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  excluirDividendo: (id: string) => apiFetch<void>(`/dividendos/${id}`, { method: "DELETE" }),

  relGastosCategoria: (ano: number, mes: number) => apiFetch<Array<Record<string, string | number>>>("/relatorios/gastos-por-categoria", {}, { ano, mes }),
  relOrcadoRealizado: (ano: number, mes: number) => apiFetch<OrcamentoLinha[]>("/relatorios/orcado-vs-realizado", {}, { ano, mes }),
  relGastosMetodo: (ano: number, mes: number) => apiFetch<Array<{ metodo: string; tipo?: "METODO" | "CARTAO"; valor: number; percentual: number }>>("/relatorios/gastos-por-metodo", {}, { ano, mes }),
  relEvolucaoMensal: (anoInicio: number, mesInicio: number, anoFim: number, mesFim: number) =>
    apiFetch<Array<{ ano: number; mes: number; receita: number; gasto: number; investimento: number; saldo: number }>>("/relatorios/evolucao-mensal", {}, { ano_inicio: anoInicio, mes_inicio: mesInicio, ano_fim: anoFim, mes_fim: mesFim }),
  relInsights: (ano: number, mes: number) =>
    apiFetch<Array<{ tipo: "CRITICO" | "ATENCAO" | "BOM" | "INSIGHT"; prioridade: number; mensagem: string; acao?: string }>>("/relatorios/insights", {}, { ano, mes }),

  exportarBackup: () => apiFetch<{ arquivo: string }>("/configuracoes/backup/exportar", { method: "POST" }),
  diagnostico: () => apiFetch<Diagnostico>("/configuracoes/diagnostico"),

  dolarResumo: () => apiFetch<ResumoDolar>("/exterior-dolar/resumo"),
  dolarExtrato: () => apiFetch<ExtratoDolar[]>("/exterior-dolar/extrato"),
  dolarMovimento: (payload: Record<string, unknown>) =>
    apiFetch("/exterior-dolar/movimentos", { method: "POST", body: JSON.stringify(payload) }),
  dolarAtualizarMovimento: (id: string, payload: Record<string, unknown>) =>
    apiFetch(`/exterior-dolar/movimentos/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  dolarExcluirMovimento: (id: string) => apiFetch<void>(`/exterior-dolar/movimentos/${id}`, { method: "DELETE" }),
  dolarInformarSaldo: (payload: Record<string, unknown>) =>
    apiFetch<ResumoDolar>("/exterior-dolar/informar-saldo", { method: "POST", body: JSON.stringify(payload) }),
  dolarCotacaoAtual: () => apiFetch<CotacaoDolarAtual>("/exterior-dolar/cotacao-atual"),
};
