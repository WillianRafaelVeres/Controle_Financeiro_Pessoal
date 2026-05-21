import type { TipoAtivo } from "./types";

export const INVESTMENT_TYPE_LABELS: Record<TipoAtivo, string> = {
  ACAO_BR: "Acao BR",
  ACAO_EXTERIOR: "Exterior",
  CRIPTO: "Cripto",
  DOLAR_CAIXA: "Dolar caixa",
  ETF_BR: "ETF BR",
  ETF_EXTERIOR: "Exterior",
  EXTERIOR: "Exterior",
  FII: "FII",
  OUTRO: "Outro",
  PREVIDENCIA: "Previdencia",
  RENDA_FIXA: "Renda fixa",
};

export const INVESTMENT_TYPE_OPTIONS: Array<{ value: TipoAtivo; label: string }> = [
  { value: "ACAO_BR", label: "Acao BR" },
  { value: "FII", label: "FII" },
  { value: "ETF_BR", label: "ETF BR" },
  { value: "EXTERIOR", label: "Exterior" },
  { value: "CRIPTO", label: "Cripto" },
  { value: "RENDA_FIXA", label: "Renda fixa" },
  { value: "PREVIDENCIA", label: "Previdencia" },
];

const TICKER_TYPES = new Set<TipoAtivo>(["ACAO_BR", "FII", "ETF_BR", "EXTERIOR", "ACAO_EXTERIOR", "ETF_EXTERIOR", "CRIPTO"]);

export function needsTicker(tipo: TipoAtivo) {
  return TICKER_TYPES.has(tipo);
}

export function defaultCurrencyForInvestment(tipo: TipoAtivo) {
  if (tipo === "EXTERIOR" || tipo === "ACAO_EXTERIOR" || tipo === "ETF_EXTERIOR") return "USD";
  return "BRL";
}

export function tickerPlaceholder(tipo: TipoAtivo) {
  if (tipo === "EXTERIOR" || tipo === "ACAO_EXTERIOR" || tipo === "ETF_EXTERIOR") return "AAPL";
  if (tipo === "CRIPTO") return "BTC";
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
