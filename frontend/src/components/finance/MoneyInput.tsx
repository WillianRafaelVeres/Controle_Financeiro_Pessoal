import type { ChangeEvent, InputHTMLAttributes } from "react";
import { useEffect, useState } from "react";

import { toNumber } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import { Input } from "../ui/input";

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value?: string | number | null;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  currency?: string | false;
  decimals?: number;
  preview?: boolean;
};

function normalize(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return "";
  if (cleaned.includes(",")) return cleaned.replace(/\./g, "").replace(",", ".");
  return cleaned;
}

function formatDecimal(value: string | number | null | undefined, decimals: number) {
  if (value === null || value === undefined || value === "") return "";
  const number = toNumber(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number);
}

function formatCurrency(value: string | number | null | undefined, currency: string, decimals: number) {
  if (value === null || value === undefined || value === "") return "";
  const number = toNumber(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number);
}

export function MoneyInput({
  className,
  value,
  onChange,
  currency = "BRL",
  decimals = 2,
  preview = true,
  onFocus,
  onBlur,
  ...props
}: MoneyInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const rawValue = value === null || value === undefined ? "" : String(value);
  const symbol = currency === "BRL" ? "R$" : currency === "USD" ? "US$" : currency || "";
  const display = focused ? draft : formatDecimal(rawValue, decimals);
  const previewValue = currency ? formatCurrency(rawValue, currency, decimals) : formatDecimal(rawValue, decimals);

  useEffect(() => {
    if (!focused) return;
    setDraft(rawValue.replace(".", ","));
  }, [focused, rawValue]);

  function emitChange(event: ChangeEvent<HTMLInputElement>) {
    const nextRaw = normalize(event.target.value);
    setDraft(event.target.value);
    const nextEvent = {
      ...event,
      target: { ...event.target, value: nextRaw },
      currentTarget: { ...event.currentTarget, value: nextRaw },
    } as ChangeEvent<HTMLInputElement>;
    onChange?.(nextEvent);
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        {currency && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-slate-500">{symbol}</span>}
        <Input
          {...props}
          type="text"
          inputMode="decimal"
          value={display}
          onChange={emitChange}
          onFocus={(event) => {
            setFocused(true);
            setDraft(rawValue.replace(".", ","));
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          className={cn(currency && "pl-10", className)}
        />
      </div>
      {preview && currency && rawValue !== "" && toNumber(rawValue) > 0 && (
        <div className="origin-left animate-[pulse_0.35s_ease-out_1] text-[11px] font-medium text-brand-400">
          {previewValue}
        </div>
      )}
    </div>
  );
}
