import { useQuery } from "@tanstack/react-query";
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
  isAccountLikeInvestment,
  needsTicker,
  readInvestmentBrokerPrefs,
  saveInvestmentBrokerPref,
  tickerPlaceholder,
} from "../../lib/investmentProfiles";
import { api } from "../../lib/api";
import { toNumber } from "../../lib/formatters";
import type { Posicao, TipoAtivo } from "../../lib/types";

export function CompraAtivoModal({
  open,
  initialTipoAtivo,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialTipoAtivo?: TipoAtivo;
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
  const [ativoId, setAtivoId] = useState("");
  const [sugestoesOpen, setSugestoesOpen] = useState(false);
  const tipoAtivo = form.tipo_ativo;
  const tickerObrigatorio = needsTicker(tipoAtivo);
  const investimentoConta = isAccountLikeInvestment(tipoAtivo);
  const moeda = defaultCurrencyForInvestment(tipoAtivo);
  const prefs = useMemo(readInvestmentBrokerPrefs, [open]);
  const posicoes = useQuery({ queryKey: ["investimentos", "posicoes", "compra-modal"], queryFn: api.posicoes, enabled: open });

  function tipoAgrupado(tipo: TipoAtivo) {
    return tipo === "ACAO_EXTERIOR" || tipo === "ETF_EXTERIOR" ? "EXTERIOR" : tipo;
  }

  function termo(valor: string | null | undefined) {
    return (valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  const sugestoes = useMemo(() => {
    const busca = termo(tickerObrigatorio ? form.ticker : form.corretora);
    if (!busca) return [];
    const tipoAtual = tipoAgrupado(tipoAtivo);
    return (posicoes.data ?? [])
      .filter((ativo) => tipoAgrupado(ativo.tipo_ativo) === tipoAtual)
      .filter((ativo) => {
        if (!busca) return true;
        return termo([ativo.ticker, ativo.nome, ativo.corretora].filter(Boolean).join(" ")).includes(busca);
      })
      .slice(0, 6);
  }, [posicoes.data, form.corretora, form.ticker, tickerObrigatorio, tipoAtivo]);

  useEffect(() => {
    if (!open) return;
    setAtivoId("");
    setForm((current) => {
      const tipo_ativo = initialTipoAtivo ?? current.tipo_ativo;
      return {
        ...current,
        tipo_ativo,
        corretora: current.corretora || prefs[tipo_ativo] || "",
      };
    });
  }, [open, initialTipoAtivo, prefs]);

  function changeTipo(tipo_ativo: TipoAtivo) {
    setAtivoId("");
    setSugestoesOpen(false);
    setForm((current) => ({
      ...current,
      tipo_ativo,
      ticker: "",
      corretora: prefs[tipo_ativo] || "",
    }));
  }

  function selecionarAtivo(ativo: Posicao) {
    setAtivoId(ativo.ativo_id);
    setSugestoesOpen(false);
    setForm((current) => ({
      ...current,
      tipo_ativo: tipoAgrupado(ativo.tipo_ativo),
      ticker: ativo.ticker,
      corretora: ativo.corretora || current.corretora,
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const corretora = form.corretora.trim();
    if (!ativoId && tickerObrigatorio && !form.ticker.trim()) return;

    const payload = {
      ...(ativoId
        ? { ativo_id: ativoId }
        : {
            tipo_ativo: tipoAtivo,
            ticker: tickerObrigatorio ? form.ticker.trim().toUpperCase() : null,
          }),
      quantidade: investimentoConta ? 1 : toNumber(form.quantidade),
      preco_unitario: toNumber(form.preco_unitario),
      corretora: corretora || null,
      observacao: form.observacao.trim() || null,
    };

    await onSubmit(payload);

    saveInvestmentBrokerPref(tipoAtivo, corretora);
    setAtivoId("");
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
          <label className="relative space-y-1">
            <span className="text-xs font-medium text-slate-500">{tipoAtivo === "RENDA_FIXA" ? "Titulo" : "Ticker"}</span>
            <Input
              value={form.ticker}
              onFocus={() => setSugestoesOpen(true)}
              onBlur={() => setSugestoesOpen(false)}
              onChange={(event) => {
                setAtivoId("");
                setSugestoesOpen(true);
                setForm({ ...form, ticker: event.target.value.toUpperCase() });
              }}
              placeholder={tickerPlaceholder(tipoAtivo)}
              required={!ativoId}
            />
            {sugestoesOpen && sugestoes.length > 0 && (
              <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-700 bg-slate-950 p-1 shadow-xl shadow-black/30">
                {sugestoes.map((ativo) => (
                  <button
                    key={ativo.ativo_id}
                    type="button"
                    className="w-full rounded-md px-2.5 py-2 text-left text-[13px] text-slate-200 transition hover:bg-slate-800"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selecionarAtivo(ativo)}
                  >
                    <span className="block font-semibold">{ativo.ticker}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {[ativo.nome, ativo.corretora, ativo.moeda].filter(Boolean).join(" | ")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>
        )}
        {!investimentoConta && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Quantidade</span>
            <MoneyInput currency={false} decimals={6} preview={false} value={form.quantidade} onChange={(event) => setForm({ ...form, quantidade: event.target.value })} required />
          </label>
        )}
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">{investimentoConta ? "Valor aportado" : "Preco unitario"}</span>
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
