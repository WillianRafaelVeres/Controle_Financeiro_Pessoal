export type TipoLancamento = "GASTO" | "RECEITA" | "INVESTIMENTO";
export type NaturezaCategoria = "GASTO" | "RECEITA" | "INVESTIMENTO";
export type TipoItemOrcamento = "CATEGORIA" | "SUBCATEGORIA";
export type TipoMetodo = "PIX" | "DEBITO" | "DINHEIRO" | "BOLETO" | "CARTAO_CREDITO" | "OUTRO";
export type TipoAtivo =
  | "CAIXINHA_CDB"
  | "RESERVA_EMERGENCIA"
  | "RENDA_FIXA"
  | "ACAO_BR"
  | "FII"
  | "ETF_BR"
  | "EXTERIOR"
  | "ACAO_EXTERIOR"
  | "ETF_EXTERIOR"
  | "CRIPTO"
  | "DOLAR_CAIXA"
  | "PREVIDENCIA"
  | "OUTRO";
export type TipoProvento = "DIVIDENDO" | "JCP" | "RENDIMENTO_FII" | "DIVIDENDO_EXTERIOR" | "JUROS_RENDA_FIXA" | "OUTRO";

export interface Categoria {
  id: string;
  nome: string;
  natureza?: NaturezaCategoria;
  ativa: boolean;
  inativado_em?: string;
  motivo_inativacao?: string;
}

export interface Subcategoria {
  id: string;
  nome: string;
  categoria_id: string;
  natureza?: NaturezaCategoria;
  ativa: boolean;
  inativado_em?: string;
  motivo_inativacao?: string;
}

export interface MetodoPagamento {
  id: string;
  nome: string;
  tipo_metodo: TipoMetodo;
  ativo: boolean;
}

export interface Conta {
  id: string;
  nome: string;
  banco?: string;
  instituicao?: string;
  tipo_conta?: string;
  moeda?: string;
  saldo_inicial: string | number;
  saldo_atual_informado: string | number;
  conta_gasto: boolean;
  entra_no_saldo_em_contas: boolean;
  ativa?: boolean;
  inativado_em?: string | null;
  criado_em?: string;
  atualizado_em?: string;
}

export interface ContaSaldo {
  id: string;
  conta_id: string;
  data_referencia: string;
  saldo_informado: string | number;
  observacao?: string | null;
  criado_em?: string;
}

export interface ContaFutura {
  id: string;
  descricao: string;
  data_vencimento?: string | null;
  categoria_id: string;
  subcategoria_id: string;
  metodo_pagamento_id?: string | null;
  valor: string | number;
  status: "ABERTA" | "PAGA" | "CANCELADA";
  lancamento_pagamento_id?: string | null;
  observacao?: string | null;
}

export interface CartaoResumo {
  id: string;
  nome: string;
  instituicao?: string;
  limite_total: string | number;
  limite_utilizado_informado: string | number;
  fatura_atual_informada: string | number;
  reservado_para_pagar: string | number;
  compromisso_futuro: string | number;
  limite_utilizado_total: string | number;
  diferenca_limite: string | number;
  cor_visual?: string;
}

export interface Lancamento {
  id: string;
  data_lancamento: string;
  tipo: TipoLancamento;
  valor: string | number;
  valor_original: string | number;
  categoria_id?: string;
  subcategoria_id?: string;
  categoria_nome_snapshot?: string;
  subcategoria_nome_snapshot?: string;
  metodo_pagamento_id?: string;
  cartao_id?: string;
  observacao?: string;
}

export interface CompromissoCartao {
  id: string;
  cartao_id: string;
  categoria_id?: string;
  subcategoria_id?: string;
  data_compra: string;
  valor_original: string | number;
  valor_separado: string | number;
  valor_em_aberto: string | number;
  descricao?: string;
  status: string;
}

export interface DashboardResumo {
  saldo_livre: string | number;
  receitas_mes?: string | number;
  despesas_mes?: string | number;
  investimentos_mes?: string | number;
  saldo_em_contas_informado?: string | number;
  saldo_em_contas: string | number;
  saldo_explicado?: string | number;
  saldo_final?: string | number;
  reservado_cartao: string | number;
  reservado_contas_futuras?: string | number;
  compromissos_futuros_cartao: string | number;
  saldo_teorico_usd?: string | number;
  gastos_nao_planejados_mes?: string | number;
  investimentos_nao_planejados_mes?: string | number;
  gasto_mes: string | number;
  orcamento_restante: string | number;
  investimentos: string | number;
  patrimonio_investido?: string | number;
  diferenca_conciliacao: string | number;
}

export interface OrcamentoLinha {
  item_orcamento_id?: string;
  tipo_item?: TipoItemOrcamento;
  natureza?: NaturezaCategoria;
  categoria_id: string;
  categoria: string;
  subcategoria_id?: string;
  subcategoria?: string;
  categoria_ativa?: boolean;
  subcategoria_ativa?: boolean | null;
  inativo_hoje?: boolean;
  orcamento_id?: string;
  valor_orcado: string | number;
  gasto_real: string | number;
  diferenca: string | number;
  percentual_usado: string | number;
  media_3_meses: string | number;
  media_6_meses: string | number;
  media_12_meses: string | number;
  situacao: string;
}

export interface PlanejamentoNaoPlanejado {
  natureza: NaturezaCategoria;
  categoria_id?: string;
  categoria: string;
  subcategoria_id?: string;
  subcategoria?: string | null;
  valor_realizado: string | number;
  quantidade_lancamentos: number;
}

export interface PlanejamentoResumo {
  ano: number;
  mes: number;
  planejado_total: string | number;
  executado_total: string | number;
  disponivel_total: string | number;
  percentual_usado: string | number;
  receitas_planejadas?: string | number;
  receitas_executadas?: string | number;
  gastos_planejados: string | number;
  gastos_executados: string | number;
  investimentos_planejados: string | number;
  investimentos_executados: string | number;
  itens_receitas?: OrcamentoLinha[];
  itens_gastos: OrcamentoLinha[];
  itens_investimentos: OrcamentoLinha[];
  receitas_nao_planejadas?: PlanejamentoNaoPlanejado[];
  gastos_nao_planejados: PlanejamentoNaoPlanejado[];
  investimentos_nao_planejados: PlanejamentoNaoPlanejado[];
  receitas_nao_planejadas_total?: string | number;
  gastos_nao_planejados_total?: string | number;
  investimentos_nao_planejados_total?: string | number;
  executado_total_com_nao_planejado?: string | number;
  receitas_executadas_total_com_nao_planejado?: string | number;
}

export interface Ativo {
  id: string;
  ticker: string;
  nome: string;
  tipo_ativo: TipoAtivo;
  moeda: string;
  corretora?: string;
}

export interface Posicao {
  ativo_id: string;
  ticker: string;
  nome: string;
  tipo_ativo: TipoAtivo;
  moeda: string;
  corretora?: string | null;
  quantidade_atual: string | number;
  preco_medio: string | number;
  preco_atual?: string | number;
  valor_total_aportado: string | number;
  valor_atual: string | number;
  lucro_prejuizo: string | number;
  rentabilidade_percentual?: string | number;
  tem_dividendos?: boolean;
  dividendos_recebidos?: string | number;
  lucro_prejuizo_com_dividendos?: string | number;
  rentabilidade_com_dividendos_percentual?: string | number;
  data_cotacao?: string | null;
  fonte_cotacao?: string | null;
}

export interface DesempenhoBenchmark {
  valor?: string | number | null;
  variacao_percentual?: string | number | null;
  fonte?: string | null;
  data?: string | null;
  erro?: string | null;
}

export interface DesempenhoAlocacaoTipo {
  tipo_ativo: TipoAtivo;
  tipo_label: string;
  valor_atual_brl: string | number;
  percentual: string | number;
  quantidade_posicoes: number;
}

export interface DesempenhoAtivo {
  ativo_id: string;
  ticker: string;
  nome: string;
  tipo_ativo: TipoAtivo;
  tipo_label: string;
  moeda: string;
  corretora?: string | null;
  valor_atual_brl: string | number;
  valor_atual_original: string | number;
  total_aportado_brl: string | number;
  resultado_brl: string | number;
  rentabilidade_percentual: string | number;
  dividendos_brl?: string | number;
  dividendos_original?: string | number;
  resultado_com_dividendos_brl?: string | number;
  rentabilidade_com_dividendos_percentual?: string | number;
  tem_dividendos?: boolean;
  percentual: string | number;
  cotacao_automatica: boolean;
  fonte_cotacao?: string | null;
  data_cotacao?: string | null;
}

export interface DesempenhoInvestimentos {
  patrimonio_atual_brl: string | number;
  total_aportado_brl: string | number;
  lucro_prejuizo_brl: string | number;
  rentabilidade_percentual: string | number;
  dividendos_brl?: string | number;
  lucro_prejuizo_com_dividendos_brl?: string | number;
  rentabilidade_com_dividendos_percentual?: string | number;
  exterior_brl: string | number;
  alocacao_por_tipo: DesempenhoAlocacaoTipo[];
  alocacao_por_ativo: DesempenhoAtivo[];
  top_ativos: DesempenhoAtivo[];
  maiores_ganhos: DesempenhoAtivo[];
  maiores_perdas: DesempenhoAtivo[];
  benchmarks: {
    dolar: DesempenhoBenchmark;
    ibovespa: DesempenhoBenchmark;
    cdi: DesempenhoBenchmark;
  };
}

export interface HistoricoDesempenhoInvestimento {
  id: string;
  ano: number;
  mes: number;
  periodo: string;
  patrimonio_atual_brl: string | number;
  total_aportado_brl: string | number;
  lucro_prejuizo_brl: string | number;
  dividendos_brl: string | number;
  rentabilidade_percentual: string | number;
}

export interface HistoricoProventosPeriodo {
  ano: number;
  mes: number;
  periodo: string;
  total_brl: string | number;
  quantidade: number;
}

export interface HistoricoProventosTipo {
  tipo_provento: TipoProvento;
  tipo_label: string;
  total_brl: string | number;
  quantidade: number;
}

export interface HistoricoProventosAtivo {
  ativo_id: string;
  ticker: string;
  nome: string;
  tipo_ativo: TipoAtivo;
  tipo_label: string;
  corretora?: string | null;
  total_brl: string | number;
  quantidade: number;
}

export interface HistoricoProventosClasse {
  tipo_ativo: TipoAtivo;
  tipo_label: string;
  total_brl: string | number;
  quantidade: number;
}

export interface HistoricoProventosInvestimentos {
  modo: "mensal" | "anual";
  total_brl: string | number;
  media_periodo_brl: string | number;
  maior_periodo_brl: string | number;
  maior_periodo?: string | null;
  quantidade: number;
  por_periodo: HistoricoProventosPeriodo[];
  por_classe: HistoricoProventosClasse[];
  por_tipo: HistoricoProventosTipo[];
  por_ativo: HistoricoProventosAtivo[];
}

export interface ExtratoDolar {
  id: string;
  data_movimento: string;
  tipo: string;
  descricao?: string;
  entrada_usd: string | number;
  saida_usd: string | number;
  valor_brl?: string | number;
  cotacao_efetiva?: string | number;
  saldo_acumulado_usd: string | number;
  origem: string;
}

export interface ResumoDolar {
  saldo_teorico_usd: string | number;
  saldo_informado_usd: string | number;
  diferenca_conciliacao_usd: string | number;
  cotacao_brl: string | number;
  cotacao_brl_data?: string | null;
  cotacao_brl_fonte?: string | null;
  valor_estimado_brl: string | number;
  total_brl_enviado?: string | number;
  total_usd_recebido?: string | number;
  dolar_medio?: string | number;
  status: string;
}

export interface CotacaoDolarAtual {
  cotacao_brl: string | number;
  compra_brl: string | number;
  venda_brl: string | number;
  variacao_brl?: string | number;
  percentual_variacao?: string | number;
  data_cotacao?: string | null;
  fonte: string;
  erro?: string | null;
}

export interface Diagnostico {
  status: string;
  desktop: boolean;
  porta?: string | null;
  banco: string;
  pasta_dados: string;
  pasta_logs: string;
  pasta_backups: string;
}

export interface Dividendo {
  id: string;
  ativo_id: string;
  tipo_provento: string;
  data_recebimento: string;
  valor: string | number;
  moeda: string;
  valor_brl?: string | number;
  cotacao_brl?: string | number | null;
  data_cotacao?: string | null;
  fonte_cotacao?: string | null;
}
