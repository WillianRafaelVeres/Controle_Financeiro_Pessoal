import type React from "react";
import { useEffect, useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { toNumber } from "../../lib/formatters";
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
  const [form, setForm] = useState({ ativo_id: "", quantidade: "", preco_unitario: "", taxas: "0", data_movimento: "" });
  const posicao = posicoes.find((item) => item.ativo_id === form.ativo_id);
  const quantidade = Number(form.quantidade || 0);
  const excede = Boolean(posicao && quantidade > toNumber(posicao.quantidade_atual));

  useEffect(() => {
    if (selected) setForm((current) => ({ ...current, ativo_id: selected.ativo_id }));
  }, [selected]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (excede) return;
    await onSubmit({
      ...form,
      quantidade,
      preco_unitario: Number(form.preco_unitario),
      taxas: Number(form.taxas || 0),
      data_movimento: form.data_movimento || null,
    });
    setForm({ ativo_id: "", quantidade: "", preco_unitario: "", taxas: "0", data_movimento: "" });
    onClose();
  }

  return (
    <Dialog open={open} title="Vender ativo" onClose={onClose}>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Ativo em posição</span>
          <Select value={form.ativo_id} onChange={(event) => setForm({ ...form, ativo_id: event.target.value })} required>
            <option value="">Selecione</option>
            {posicoes.map((item) => (
              <option key={item.ativo_id} value={item.ativo_id}>
                {item.ticker} - {toNumber(item.quantidade_atual).toLocaleString("pt-BR")}
              </option>
            ))}
          </Select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Quantidade a vender</span>
            <MoneyInput value={form.quantidade} onChange={(event) => setForm({ ...form, quantidade: event.target.value })} required />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Preço unitário</span>
            <MoneyInput value={form.preco_unitario} onChange={(event) => setForm({ ...form, preco_unitario: event.target.value })} required />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Taxas</span>
            <MoneyInput value={form.taxas} onChange={(event) => setForm({ ...form, taxas: event.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Data</span>
            <Input type="date" value={form.data_movimento} onChange={(event) => setForm({ ...form, data_movimento: event.target.value })} />
          </label>
        </div>
        {excede && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-600">Não é permitido vender mais do que a posição atual.</div>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={excede}>
            Vender
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
