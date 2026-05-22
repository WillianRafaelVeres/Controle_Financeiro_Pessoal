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
