export function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/[^\d,.-]/g, "");
    if (normalized.includes(",")) return Number(normalized.replace(/\./g, "").replace(",", "."));
    return Number(normalized);
  }
  return Number(value);
}

export function formatMoney(value: number | string | null | undefined, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(toNumber(value));
}

export function formatPercent(value: number | string | null | undefined) {
  return `${toNumber(value).toFixed(1).replace(".", ",")}%`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatMonthShort(ano: number, mes: number) {
  return `${MESES_CURTOS[mes - 1] ?? mes}/${String(ano).slice(-2)}`;
}

/** Valor abreviado (1,2 mil / 3,4 mi) para caber em colunas estreitas como o historico. */
export function formatMoneyCompact(value: number | string | null | undefined) {
  const numero = toNumber(value);
  if (numero === 0) return "-";
  const absoluto = Math.abs(numero);
  const sinal = numero < 0 ? "-" : "";
  if (absoluto >= 1_000_000) return `${sinal}${(absoluto / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (absoluto >= 1_000) return `${sinal}${(absoluto / 1_000).toFixed(1).replace(".", ",")} mil`;
  return `${sinal}${absoluto.toFixed(0)}`;
}
