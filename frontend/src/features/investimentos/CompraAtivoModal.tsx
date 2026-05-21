import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import {
  defaultCurrencyForInvestment,
  INVESTMENT_TYPE_OPTIONS,
  needsTicker,
  readInvestmentBrokerPrefs,
  saveInvestmentBrokerPref,
  tickerPlaceholder,
} from "../../lib/investmentProfiles";
import type { TipoAtivo } from "../../lib/types";

export function CompraAtivoModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    tipo_ativo: "ACAO_BR" as TipoAtivo,
    ticker: "",
    corretora: "",
    quantidade: "",
    preco_unitario: "",
    observacao: "",
  });
  const tipoAtivo = form.tipo_ativo;
  const tickerObrigatorio = needsTicker(tipoAtivo);
  const moeda = defaultCurrencyForInvestment(tipoAtivo);
  const prefs = useMemo(readInvestmentBrokerPrefs, [open]);

  useEffect(() => {
    if (!open) return;
    setForm((current) => ({ ...current, corretora: current.corretora || prefs[current.tipo_ativo] || "" }));
  }, [open, prefs]);

  function changeTipo(tipo_ativo: TipoAtivo) {
    setForm((current) => ({
      ...current,
      tipo_ativo,
      ticker: "",
      corretora: prefs[tipo_ativo] || "",
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const corretora = form.corretora.trim();
    if (tickerObrigatorio && !form.ticker.trim()) return;

    await onSubmit({
      tipo_ativo: tipoAtivo,
      ticker: tickerObrigatorio ? form.ticker.trim().toUpperCase() : null,
      quantidade: Number(form.quantidade),
      preco_unitario: Number(form.preco_unitario),
      corretora: corretora || null,
      observacao: form.observacao.trim() || null,
    });

    saveInvestmentBrokerPref(tipoAtivo, corretora);
    setForm({ ...form, ticker: "", corretora, quantidade: "", preco_unitario: "", observacao: "" });
    onClose();
  }

  return (
    <Dialog open={open} title="Comprar ativo" onClose={onClose} className="max-w-2xl">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Tipo de ativo</span>
          <Select value={tipoAtivo} onChange={(event) => changeTipo(event.target.value as TipoAtivo)}>
            {INVESTMENT_TYPE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Conta/corretora</span>
          <Input value={form.corretora} onChange={(event) => setForm({ ...form, corretora: event.target.value })} placeholder="Ex.: XP, Inter, Santander" />
        </label>
        {tickerObrigatorio && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Ticker</span>
            <Input value={form.ticker} onChange={(event) => setForm({ ...form, ticker: event.target.value.toUpperCase() })} placeholder={tickerPlaceholder(tipoAtivo)} required />
          </label>
        )}
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Quantidade</span>
          <MoneyInput value={form.quantidade} onChange={(event) => setForm({ ...form, quantidade: event.target.value })} required />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Preco unitario</span>
          <MoneyInput value={form.preco_unitario} onChange={(event) => setForm({ ...form, preco_unitario: event.target.value })} required />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-slate-500">Observacao</span>
          <Input value={form.observacao} onChange={(event) => setForm({ ...form, observacao: event.target.value })} />
        </label>
        <div className="rounded-md border border-slate-800 bg-slate-950/50 p-2 text-xs text-slate-500 sm:col-span-2">
          Moeda definida automaticamente: {moeda}. Data de compra: hoje.
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Comprar</Button>
        </div>
      </form>
    </Dialog>
  );
}
