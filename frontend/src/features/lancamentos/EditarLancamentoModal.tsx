import { Save } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import type { Categoria, Lancamento, MetodoPagamento, Subcategoria, TipoLancamento } from "../../lib/types";

interface EditarLancamentoModalProps {
  lancamento: Lancamento | null;
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  metodos: MetodoPagamento[];
  onClose: () => void;
  onSubmit: (id: string, payload: Record<string, unknown>) => Promise<void>;
}

export function EditarLancamentoModal({
  lancamento,
  categorias,
  subcategorias,
  metodos,
  onClose,
  onSubmit,
}: EditarLancamentoModalProps) {
  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState<TipoLancamento>("GASTO");
  const [categoriaId, setCategoriaId] = useState("");
  const [subcategoriaId, setSubcategoriaId] = useState("");
  const [metodoId, setMetodoId] = useState("");
  const [dataLancamento, setDataLancamento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const isCartao = Boolean(lancamento?.cartao_id);
  const valorNumber = Number(valor || 0);

  useEffect(() => {
    if (!lancamento) return;
    setValor(String(lancamento.valor ?? ""));
    setTipo(lancamento.tipo);
    setCategoriaId(lancamento.categoria_id ?? "");
    setSubcategoriaId(lancamento.subcategoria_id ?? "");
    setMetodoId(lancamento.metodo_pagamento_id ?? "");
    setDataLancamento((lancamento.data_lancamento ?? "").slice(0, 10));
    setObservacao(lancamento.observacao ?? "");
  }, [lancamento]);

  const categoriaOptions = useMemo(
    () =>
      categorias.filter((item) => {
        const mesmaNatureza = (item.natureza ?? "GASTO") === tipo;
        return mesmaNatureza && (item.ativa || item.id === categoriaId);
      }),
    [categoriaId, categorias, tipo],
  );

  const subcategoriaOptions = useMemo(
    () =>
      subcategorias
        .filter((item) => (item.natureza ?? "GASTO") === tipo)
        .filter((item) => !categoriaId || item.categoria_id === categoriaId)
        .filter((item) => item.ativa || item.id === subcategoriaId),
    [categoriaId, subcategoriaId, subcategorias, tipo],
  );

  function changeTipo(value: TipoLancamento) {
    setTipo(value);
    setCategoriaId("");
    setSubcategoriaId("");
    setMetodoId("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!lancamento || valorNumber <= 0) return;
    if (!isCartao && tipo === "GASTO" && !metodoId) {
      alert("Gasto exige metodo de pagamento.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit(lancamento.id, {
        valor: valorNumber,
        tipo,
        categoria_id: categoriaId || null,
        subcategoria_id: subcategoriaId || null,
        metodo_pagamento_id: isCartao || tipo === "INVESTIMENTO" ? null : metodoId || null,
        data_lancamento: dataLancamento || null,
        observacao: observacao.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(lancamento)} title="Editar lancamento" onClose={onClose} className="max-w-3xl">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Valor</span>
          <MoneyInput value={valor} onChange={(event) => setValor(event.target.value)} required />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Data</span>
          <Input type="date" value={dataLancamento} onChange={(event) => setDataLancamento(event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Tipo</span>
          {isCartao ? (
            <div className="flex h-8 items-center rounded-md border border-slate-700 bg-slate-950 px-2.5 text-[13px] text-slate-300">Despesa no cartao</div>
          ) : (
            <Select value={tipo} onChange={(event) => changeTipo(event.target.value as TipoLancamento)}>
              <option value="GASTO">Despesa</option>
              <option value="RECEITA">Receita</option>
              <option value="INVESTIMENTO">Investimento</option>
            </Select>
          )}
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Categoria</span>
          <Select value={categoriaId} onChange={(event) => {
            setCategoriaId(event.target.value);
            setSubcategoriaId("");
          }}>
            <option value="">Sem categoria</option>
            {categoriaOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Subcategoria</span>
          <Select value={subcategoriaId} onChange={(event) => setSubcategoriaId(event.target.value)} disabled={!categoriaId}>
            <option value="">Sem subcategoria</option>
            {subcategoriaOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Metodo</span>
          {isCartao || tipo === "INVESTIMENTO" ? (
            <div className="flex h-8 items-center rounded-md border border-slate-700 bg-slate-950 px-2.5 text-[13px] text-slate-500">Nao alterado aqui</div>
          ) : (
            <Select value={metodoId} onChange={(event) => setMetodoId(event.target.value)}>
              <option value="">Selecione</option>
              {metodos.filter((item) => item.tipo_metodo !== "CARTAO_CREDITO").map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          )}
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-slate-500">Observacao</span>
          <Textarea className="min-h-20" value={observacao} onChange={(event) => setObservacao(event.target.value)} />
        </label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || valorNumber <= 0}>
            <Save className="h-4 w-4" />
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
