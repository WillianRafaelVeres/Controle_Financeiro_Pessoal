import type { TipoAtivo } from "./types";

export const INVESTMENT_TYPE_LABELS: Record<TipoAtivo, string> = {
  ACAO_BR: "Acao BR",
  ACAO_EXTERIOR: "Exterior",
  CAIXINHA_CDB: "Caixinhas CDB",
  RESERVA_EMERGENCIA: "Reserva de emergencia",
  CRIPTO: "Cripto",
  DOLAR_CAIXA: "Dolar caixa",
  ETF_BR: "ETF BR",
  ETF_EXTERIOR: "Exterior",
  EXTERIOR: "Exterior",
  FII: "FII",
  OUTRO: "Outro legado",
  PREVIDENCIA: "Previdencia",
  RENDA_FIXA: "Renda fixa/Tesouro",
};

export const INVESTMENT_TYPE_OPTIONS: Array<{ value: TipoAtivo; label: string }> = [
  { value: "ACAO_BR", label: "Acao BR" },
  { value: "FII", label: "FII" },
  { value: "ETF_BR", label: "ETF BR" },
  { value: "EXTERIOR", label: "Exterior" },
  { value: "CRIPTO", label: "Cripto" },
  { value: "RESERVA_EMERGENCIA", label: "Reserva de emergencia" },
  { value: "CAIXINHA_CDB", label: "Caixinhas CDB" },
  { value: "RENDA_FIXA", label: "Renda fixa/Tesouro" },
  { value: "PREVIDENCIA", label: "Previdencia" },
];

const TICKER_TYPES = new Set<TipoAtivo>(["ACAO_BR", "FII", "ETF_BR", "EXTERIOR", "ACAO_EXTERIOR", "ETF_EXTERIOR", "CRIPTO", "RENDA_FIXA"]);
const ACCOUNT_LIKE_TYPES = new Set<TipoAtivo>(["CAIXINHA_CDB", "RESERVA_EMERGENCIA", "PREVIDENCIA"]);

export function needsTicker(tipo: TipoAtivo) {
  return TICKER_TYPES.has(tipo);
}

export function isAccountLikeInvestment(tipo: TipoAtivo) {
  return ACCOUNT_LIKE_TYPES.has(tipo);
}

export function defaultCurrencyForInvestment(tipo: TipoAtivo) {
  if (tipo === "EXTERIOR" || tipo === "ACAO_EXTERIOR" || tipo === "ETF_EXTERIOR") return "USD";
  return "BRL";
}

export function tickerPlaceholder(tipo: TipoAtivo) {
  if (tipo === "EXTERIOR" || tipo === "ACAO_EXTERIOR" || tipo === "ETF_EXTERIOR") return "AAPL";
  if (tipo === "CRIPTO") return "BTC";
  if (tipo === "RENDA_FIXA") return "TESOURO-IPCA-2035";
  if (tipo === "FII" || tipo === "ETF_BR") return "HGLG11";
  return "BBAS3";
}

const CORRETORA_PREF_KEY = "central-financeira:investimentos:corretora-por-tipo";

export function readInvestmentBrokerPrefs(): Partial<Record<TipoAtivo, string>> {
  try {
    return JSON.parse(localStorage.getItem(CORRETORA_PREF_KEY) || "{}") as Partial<Record<TipoAtivo, string>>;
  } catch {
    return {};
  }
}

export function saveInvestmentBrokerPref(tipo: TipoAtivo, corretora: string) {
  if (!corretora.trim()) return;
  const prefs = readInvestmentBrokerPrefs();
  prefs[tipo] = corretora.trim();
  localStorage.setItem(CORRETORA_PREF_KEY, JSON.stringify(prefs));
}
