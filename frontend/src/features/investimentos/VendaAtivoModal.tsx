import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { api } from "../../lib/api";
import { formatMoney, toNumber } from "../../lib/formatters";
import type { Posicao } from "../../lib/types";

export function VendaAtivoModal({
  open,
  posicoes,
  selected,
  onClose,
  onSubmit,
}: {
  open: boolean;
  posicoes: Posicao[];
  selected?: Posicao | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    ativo_id: "",
    quantidade: "",
    preco_unitario: "",
    valor_total: "",
    rendimento: "",
    taxas: "0",
    conta_id: "",
    data_movimento: "",
    observacao: "",
  });
  const contas = useQuery({ queryKey: ["contas", "investimentos", "venda-modal"], queryFn: () => api.contas(), enabled: open });
  const posicao = posicoes.find((item) => item.ativo_id === form.ativo_id);
  const controleValor = posicao?.tipo_controle === "VALOR";
  const investimentoExterior = posicao?.moeda === "USD";
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
  const quantidade = toNumber(form.quantidade);
  const valorResgate = toNumber(form.valor_total);
  const valorBruto = controleValor ? valorResgate : quantidade * toNumber(form.preco_unitario);
  const valorLiquido = Math.max(valorBruto - toNumber(form.taxas), 0);
  const excede = Boolean(
    posicao && (controleValor ? valorResgate > toNumber(posicao.valor_atual) : quantidade > toNumber(posicao.quantidade_atual)),
  );
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (selected) setForm((current) => ({ ...current, ativo_id: selected.ativo_id }));
  }, [selected]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErro("");
    if (excede) return;
    await onSubmit({
      ativo_id: form.ativo_id,
      ...(controleValor
        ? {
            tipo_controle: "VALOR",
            quantidade: null,
            preco_unitario: null,
            valor_total: valorResgate,
          }
        : {
            tipo_controle: "QUANTIDADE",
            quantidade,
            preco_unitario: toNumber(form.preco_unitario),
          }),
      taxas: toNumber(form.taxas),
      conta_id: investimentoExterior ? null : form.conta_id || null,
      data_movimento: form.data_movimento || null,
      observacao: [
        form.observacao.trim(),
        controleValor && toNumber(form.rendimento) > 0 ? `Rendimento no resgate: ${formatMoney(form.rendimento)}` : "",
      ].filter(Boolean).join(" | ") || null,
    });
    setForm({ ativo_id: "", quantidade: "", preco_unitario: "", valor_total: "", rendimento: "", taxas: "0", conta_id: form.conta_id, data_movimento: "", observacao: "" });
    onClose();
  }

  return (
    <Dialog open={open} title={controleValor ? "Resgatar investimento" : "Vender ativo"} onClose={onClose}>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Investimento em posicao</span>
          <Select value={form.ativo_id} onChange={(event) => setForm({ ...form, ativo_id: event.target.value })} required>
            <option value="">Selecione</option>
            {posicoes.map((item) => (
              <option key={item.ativo_id} value={item.ativo_id}>
                {item.tipo_controle === "VALOR"
                  ? `${item.nome} - ${formatMoney(item.valor_atual, item.moeda === "USD" ? "USD" : "BRL")}`
                  : `${item.ticker} - ${toNumber(item.quantidade_atual).toLocaleString("pt-BR")}`}
              </option>
            ))}
          </Select>
        </label>
        {!investimentoExterior && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Conta de destino (opcional)</span>
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
        <div className="grid gap-3 sm:grid-cols-2">
          {controleValor ? (
            <>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Valor bruto a resgatar</span>
                <MoneyInput value={form.valor_total} onChange={(event) => setForm({ ...form, valor_total: event.target.value })} required />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Rendimento no resgate</span>
                <MoneyInput value={form.rendimento} onChange={(event) => setForm({ ...form, rendimento: event.target.value })} />
              </label>
            </>
          ) : (
            <>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Quantidade a vender</span>
                <MoneyInput currency={false} decimals={6} preview={false} value={form.quantidade} onChange={(event) => setForm({ ...form, quantidade: event.target.value })} required />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Preco unitario</span>
                <MoneyInput value={form.preco_unitario} onChange={(event) => setForm({ ...form, preco_unitario: event.target.value })} required />
              </label>
            </>
          )}
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">{controleValor ? "Impostos/taxas" : "Taxas"}</span>
            <MoneyInput value={form.taxas} onChange={(event) => setForm({ ...form, taxas: event.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Data</span>
            <Input type="date" value={form.data_movimento} onChange={(event) => setForm({ ...form, data_movimento: event.target.value })} />
          </label>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          Valor liquido recebido: <span className="font-semibold text-slate-100">{formatMoney(valorLiquido, posicao?.moeda === "USD" ? "USD" : "BRL")}</span>
        </div>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Observacao</span>
          <Input value={form.observacao} onChange={(event) => setForm({ ...form, observacao: event.target.value })} />
        </label>
        {excede && (
          <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-600">
            Nao e permitido {controleValor ? "resgatar mais do que o valor atual" : "vender mais do que a posicao atual"}.
          </div>
        )}
        {erro && <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs font-medium text-red-300">{erro}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={excede}>
            {controleValor ? "Resgatar" : "Vender"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
