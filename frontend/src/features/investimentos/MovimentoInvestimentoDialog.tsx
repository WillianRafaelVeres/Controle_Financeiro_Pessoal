import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { api } from "../../lib/api";
import { toNumber } from "../../lib/formatters";
import { INVESTMENT_TYPE_LABELS } from "../../lib/investmentProfiles";
import type { MovimentoInvestimento } from "../../lib/types";

function movimentoLabel(tipo: MovimentoInvestimento["tipo_movimento"]) {
  if (tipo === "COMPRA") return "Compra";
  if (tipo === "VENDA") return "Venda";
  if (tipo === "APORTE") return "Aporte";
  if (tipo === "RESGATE") return "Resgate";
  return "Ajuste";
}

export function MovimentoInvestimentoDialog({
  movimento,
  onClose,
  onSubmit,
}: {
  movimento: MovimentoInvestimento | null;
  onClose: () => void;
  onSubmit: (id: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    data_movimento: "",
    quantidade: "",
    preco_unitario: "",
    taxas: "",
    conta_id: "",
    corretora: "",
    observacao: "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const moeda = movimento?.moeda || "BRL";
  const contas = useQuery({ queryKey: ["contas", "investimentos", "editar-movimento"], queryFn: () => api.contas(), enabled: movimento !== null && moeda !== "USD" });
  const contasSaldo = useMemo(
    () =>
      (contas.data ?? []).filter(
        (conta) =>
          conta.ativa !== false &&
          conta.conta_gasto &&
          conta.entra_no_saldo_em_contas &&
          (conta.moeda ?? "BRL") === "BRL",
      ),
    [contas.data],
  );

  useEffect(() => {
    if (!movimento) return;
    setForm({
      data_movimento: movimento.data_movimento,
      quantidade: String(toNumber(movimento.quantidade)),
      preco_unitario: String(toNumber(movimento.tipo_controle === "VALOR" ? movimento.valor_total : movimento.preco_unitario)),
      taxas: String(toNumber(movimento.taxas)),
      conta_id: movimento.conta_id || "",
      corretora: movimento.corretora || "",
      observacao: movimento.observacao || "",
    });
    setErro("");
    setSalvando(false);
  }, [movimento]);

  if (!movimento) return null;

  const controleValor = movimento.tipo_controle === "VALOR";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    if (!movimento) return;
    if (!controleValor && toNumber(form.quantidade) <= 0) {
      setErro("Informe uma quantidade maior que zero.");
      return;
    }
    if (toNumber(form.preco_unitario) <= 0) {
      setErro(controleValor ? "Informe um valor maior que zero." : "Informe um preco maior que zero.");
      return;
    }
    setSalvando(true);
    try {
      await onSubmit(movimento.id, {
        data_movimento: form.data_movimento || null,
        ...(controleValor
          ? {
              quantidade: null,
              preco_unitario: null,
              valor_total: toNumber(form.preco_unitario),
            }
          : {
              quantidade: toNumber(form.quantidade),
              preco_unitario: toNumber(form.preco_unitario),
            }),
        taxas: toNumber(form.taxas),
        conta_id: moeda === "USD" ? null : form.conta_id || null,
        corretora: form.corretora.trim() || null,
        observacao: form.observacao.trim() || null,
      });
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel salvar a operacao.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={movimento !== null} title="Editar operacao de investimento" onClose={onClose} className="max-w-2xl">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <div className="rounded-md border border-slate-800 bg-slate-950/45 p-3 sm:col-span-2">
          <p className="text-sm font-semibold text-slate-100">
            {movimentoLabel(movimento.tipo_movimento)} {controleValor ? movimento.nome : movimento.ticker}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {INVESTMENT_TYPE_LABELS[movimento.tipo_ativo] ?? movimento.tipo_ativo} · valores em {moeda}
          </p>
        </div>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Data</span>
          <Input type="date" value={form.data_movimento} onChange={(event) => setForm({ ...form, data_movimento: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Instituicao/corretora</span>
          <Input value={form.corretora} onChange={(event) => setForm({ ...form, corretora: event.target.value })} />
        </label>
        {moeda !== "USD" && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Conta vinculada (opcional)</span>
            <Select value={form.conta_id} onChange={(event) => setForm({ ...form, conta_id: event.target.value })}>
              <option value="">Sem conta vinculada</option>
              {contasSaldo.map((conta) => (
                <option key={conta.id} value={conta.id}>
                  {conta.nome}
                </option>
              ))}
            </Select>
          </label>
        )}
        {!controleValor && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Quantidade</span>
            <MoneyInput currency={false} decimals={8} preview={false} value={form.quantidade} onChange={(event) => setForm({ ...form, quantidade: event.target.value })} required />
          </label>
        )}
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">{controleValor ? `Valor (${moeda})` : `Preco unitario (${moeda})`}</span>
          <MoneyInput currency={moeda} value={form.preco_unitario} onChange={(event) => setForm({ ...form, preco_unitario: event.target.value })} required />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Taxas ({moeda})</span>
          <MoneyInput currency={moeda} value={form.taxas} onChange={(event) => setForm({ ...form, taxas: event.target.value })} />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-slate-500">Observacao</span>
          <Input value={form.observacao} onChange={(event) => setForm({ ...form, observacao: event.target.value })} />
        </label>
        {erro && <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs font-medium text-red-300 sm:col-span-2">{erro}</div>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
