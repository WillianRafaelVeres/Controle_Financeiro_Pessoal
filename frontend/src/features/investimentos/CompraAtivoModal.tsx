import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import {
  controlTypeForInvestment,
  defaultCurrencyForInvestment,
  INVESTMENT_TYPE_LABELS,
  INVESTMENT_TYPE_OPTIONS,
  isValueControlledInvestment,
  needsTicker,
  readInvestmentBrokerPrefs,
  saveInvestmentBrokerPref,
  tickerPlaceholder,
} from "../../lib/investmentProfiles";
import { api } from "../../lib/api";
import { formatMoney, toNumber } from "../../lib/formatters";
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
    nome: "",
    corretora: "",
    quantidade: "",
    preco_unitario: "",
    taxas: "0",
    data_movimento: "",
    observacao: "",
  });
  const [ativoId, setAtivoId] = useState("");
  const [sugestoesOpen, setSugestoesOpen] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const tipoAtivo = form.tipo_ativo;
  const prefs = useMemo(readInvestmentBrokerPrefs, [open]);
  const posicoes = useQuery({ queryKey: ["investimentos", "posicoes", "compra-modal"], queryFn: api.posicoes, enabled: open });
  const selectedAtivo = (posicoes.data ?? []).find((item) => item.ativo_id === ativoId);
  const controleValor = selectedAtivo?.tipo_controle === "VALOR" || isValueControlledInvestment(tipoAtivo);
  const tickerObrigatorio = !controleValor && needsTicker(tipoAtivo);
  const moeda = defaultCurrencyForInvestment(tipoAtivo);
  const totalOperacao = toNumber(form.quantidade) * toNumber(form.preco_unitario);

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
    const busca = termo(tickerObrigatorio ? form.ticker : [form.nome, form.corretora].filter(Boolean).join(" "));
    if (!busca) return [];
    const tipoAtual = tipoAgrupado(tipoAtivo);
    return (posicoes.data ?? [])
      .filter((ativo) => tipoAgrupado(ativo.tipo_ativo) === tipoAtual)
      .filter((ativo) => {
        if (!busca) return true;
        return termo([ativo.ticker, ativo.nome, ativo.corretora].filter(Boolean).join(" ")).includes(busca);
      })
      .slice(0, 6);
  }, [posicoes.data, form.corretora, form.nome, form.ticker, tickerObrigatorio, tipoAtivo]);

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
      nome: "",
      corretora: prefs[tipo_ativo] || "",
      taxas: current.taxas,
      data_movimento: current.data_movimento,
    }));
  }

  function selecionarAtivo(ativo: Posicao) {
    setAtivoId(ativo.ativo_id);
    setSugestoesOpen(false);
    setForm((current) => ({
      ...current,
      tipo_ativo: tipoAgrupado(ativo.tipo_ativo),
      ticker: ativo.ticker,
      nome: ativo.nome,
      corretora: ativo.corretora || current.corretora,
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    const corretora = form.corretora.trim();
    if (!ativoId && tickerObrigatorio && !form.ticker.trim()) return;
    if (!ativoId && controleValor && !form.nome.trim()) {
      setErro("Informe o nome do investimento.");
      return;
    }
    if (!controleValor && toNumber(form.quantidade) <= 0) {
      setErro("Informe uma quantidade maior que zero.");
      return;
    }
    if (toNumber(form.preco_unitario) <= 0) {
      setErro(controleValor ? "Informe um valor investido maior que zero." : "Informe um preco maior que zero.");
      return;
    }
    const payload = {
      ...(ativoId
        ? { ativo_id: ativoId }
        : {
            tipo_ativo: tipoAtivo,
            tipo_controle: controlTypeForInvestment(tipoAtivo),
            ticker: tickerObrigatorio ? form.ticker.trim().toUpperCase() : null,
            nome: controleValor ? form.nome.trim() : form.ticker.trim().toUpperCase(),
          }),
      ...(controleValor
        ? {
            tipo_controle: "VALOR",
            quantidade: null,
            preco_unitario: null,
            valor_total: toNumber(form.preco_unitario),
          }
        : {
            tipo_controle: "QUANTIDADE",
            quantidade: toNumber(form.quantidade),
            preco_unitario: toNumber(form.preco_unitario),
          }),
      taxas: controleValor ? 0 : toNumber(form.taxas),
      conta_id: null,
      data_movimento: form.data_movimento || null,
      corretora: corretora || null,
      observacao: form.observacao.trim() || null,
    };

    setSalvando(true);
    try {
      await onSubmit(payload);
      saveInvestmentBrokerPref(tipoAtivo, corretora);
      setAtivoId("");
      setForm({ ...form, ticker: "", nome: "", corretora, quantidade: "", preco_unitario: "", taxas: "0", data_movimento: "", observacao: "" });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel comprar o ativo.";
      if (/insuficiente/i.test(message)) {
        setErro("Saldo insuficiente em USD para esta compra. Verifique seu saldo em conta dolar.");
      } else {
        setErro(message);
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} title="Registrar investimento" onClose={onClose} className="max-w-2xl">
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
          <span className="text-xs font-medium text-slate-500">Instituicao/corretora</span>
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
              <div className="glass-highlight absolute z-[80] mt-1 max-h-56 w-full overflow-auto rounded-2xl border border-white/10 bg-slate-950/[0.92] p-1.5 shadow-[0_22px_70px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.05] backdrop-blur-xl">
                {sugestoes.map((ativo) => (
                  <button
                    key={ativo.ativo_id}
                    type="button"
                    className="w-full rounded-xl px-3 py-2.5 text-left text-[13px] text-slate-200 transition hover:bg-white/[0.08]"
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
        {controleValor && !ativoId && (
          <label className="relative space-y-1">
            <span className="text-xs font-medium text-slate-500">Nome do investimento</span>
            <Input
              value={form.nome}
              onFocus={() => setSugestoesOpen(true)}
              onBlur={() => setSugestoesOpen(false)}
              onChange={(event) => {
                setAtivoId("");
                setSugestoesOpen(true);
                setForm({ ...form, nome: event.target.value });
              }}
              placeholder={INVESTMENT_TYPE_LABELS[tipoAtivo]}
              required
            />
            {sugestoesOpen && sugestoes.length > 0 && (
              <div className="glass-highlight absolute z-[80] mt-1 max-h-56 w-full overflow-auto rounded-2xl border border-white/10 bg-slate-950/[0.92] p-1.5 shadow-[0_22px_70px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.05] backdrop-blur-xl">
                {sugestoes.map((ativo) => (
                  <button
                    key={ativo.ativo_id}
                    type="button"
                    className="w-full rounded-xl px-3 py-2.5 text-left text-[13px] text-slate-200 transition hover:bg-white/[0.08]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selecionarAtivo(ativo)}
                  >
                    <span className="block font-semibold">{ativo.nome}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {[ativo.corretora, ativo.moeda].filter(Boolean).join(" | ") || ativo.ticker}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>
        )}
        {!controleValor && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Quantidade</span>
            <MoneyInput currency={false} decimals={8} preview={false} value={form.quantidade} onChange={(event) => setForm({ ...form, quantidade: event.target.value })} required />
          </label>
        )}
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">
            {controleValor ? `Valor investido (${moeda})` : `Preco unitario (${moeda})`}
          </span>
          <MoneyInput currency={moeda} value={form.preco_unitario} onChange={(event) => setForm({ ...form, preco_unitario: event.target.value })} required />
        </label>
        {!controleValor && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Total da operacao ({moeda})</span>
            <div className="flex h-10 items-center rounded-md border border-slate-700 bg-slate-900/60 px-3 text-sm font-semibold text-slate-100">
              {formatMoney(totalOperacao, moeda)}
            </div>
          </label>
        )}
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Data</span>
          <Input type="date" value={form.data_movimento} onChange={(event) => setForm({ ...form, data_movimento: event.target.value })} />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-slate-500">Observacao</span>
          <Input value={form.observacao} onChange={(event) => setForm({ ...form, observacao: event.target.value })} />
        </label>
        <div className="rounded-md border border-slate-800 bg-slate-950/50 p-2 text-xs text-slate-500 sm:col-span-2">
          {moeda === "USD"
            ? "Informe preco e total em USD (dolares). O movimento e registrado no extrato Exterior/Dolar automaticamente."
            : `Moeda definida automaticamente: ${moeda}. ${controleValor ? "Investimentos por valor nao usam quantidade nem preco medio." : "Valor total calculado pela quantidade e preco."}`}
        </div>
        {erro && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs font-medium text-red-300 sm:col-span-2">
            {erro}
          </div>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando}>
            {controleValor ? "Aportar" : "Comprar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
