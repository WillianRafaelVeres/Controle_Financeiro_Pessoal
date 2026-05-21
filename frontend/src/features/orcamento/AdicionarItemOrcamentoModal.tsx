import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Select } from "../../components/ui/select";
import { api } from "../../lib/api";
import type { NaturezaCategoria, TipoItemOrcamento } from "../../lib/types";

export function AdicionarItemOrcamentoModal({
  open,
  ano,
  mes,
  onClose,
  onSuccess,
  initialItem,
}: {
  open: boolean;
  ano: number;
  mes: number;
  onClose: () => void;
  onSuccess: () => void;
  initialItem?: {
    natureza: NaturezaCategoria;
    categoria_id?: string;
    subcategoria_id?: string | null;
  } | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    natureza: "GASTO" as NaturezaCategoria,
    tipo_item: "SUBCATEGORIA" as TipoItemOrcamento,
    categoria_id: "",
    subcategoria_id: "",
    valor_orcado: "",
    escopo: "SOMENTE_ESTE_MES",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      natureza: initialItem?.natureza ?? "GASTO",
      tipo_item: initialItem?.subcategoria_id ? "SUBCATEGORIA" : "CATEGORIA",
      categoria_id: initialItem?.categoria_id ?? "",
      subcategoria_id: initialItem?.subcategoria_id ?? "",
      valor_orcado: "",
      escopo: "SOMENTE_ESTE_MES",
    });
  }, [initialItem, open]);

  const categoriasQuery = useQuery({
    queryKey: ["categorias", form.natureza],
    queryFn: () => api.categorias(form.natureza),
  });

  const subcategoriasQuery = useQuery({
    queryKey: ["subcategorias", form.categoria_id],
    queryFn: () => api.subcategorias(form.categoria_id),
    enabled: !!form.categoria_id,
  });

  const adicionarMutation = useMutation({
    mutationFn: () =>
      api.adicionarItemOrcamento({
        ano,
        mes,
        tipo_item: form.tipo_item,
        natureza: form.natureza,
        categoria_id: form.categoria_id,
        subcategoria_id: form.tipo_item === "SUBCATEGORIA" ? form.subcategoria_id : null,
        valor_orcado: Number(form.valor_orcado),
        escopo: form.escopo,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
      onSuccess();
    },
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.categoria_id || !form.valor_orcado) {
      alert("Preencha categoria e valor planejado.");
      return;
    }
    if (form.tipo_item === "SUBCATEGORIA" && !form.subcategoria_id) {
      alert("Selecione uma subcategoria.");
      return;
    }
    await adicionarMutation.mutateAsync();
  }

  const subcategorias = form.categoria_id ? subcategoriasQuery.data ?? [] : [];

  return (
    <Dialog open={open} title="Adicionar item ao planejamento" onClose={onClose} className="max-w-md">
      <form className="space-y-4" onSubmit={submit}>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Tipo de planejamento</span>
          <Select
            value={form.natureza}
            onChange={(event) =>
              setForm({
                ...form,
                natureza: event.target.value as NaturezaCategoria,
                categoria_id: "",
                subcategoria_id: "",
              })
            }
          >
            <option value="RECEITA">Recebimento</option>
            <option value="GASTO">Gasto</option>
            <option value="INVESTIMENTO">Investimento</option>
          </Select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Item</span>
          <Select
            value={form.tipo_item}
            onChange={(event) => setForm({ ...form, tipo_item: event.target.value as TipoItemOrcamento, subcategoria_id: "" })}
          >
            <option value="CATEGORIA">Categoria inteira</option>
            <option value="SUBCATEGORIA">Subcategoria especifica</option>
          </Select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Categoria</span>
          <Select
            value={form.categoria_id}
            onChange={(event) => setForm({ ...form, categoria_id: event.target.value, subcategoria_id: "" })}
          >
            <option value="">Selecione uma categoria...</option>
            {categoriasQuery.data?.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.nome}
              </option>
            ))}
          </Select>
        </label>

        {form.tipo_item === "SUBCATEGORIA" && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Subcategoria</span>
            <Select
              value={form.subcategoria_id}
              onChange={(event) => setForm({ ...form, subcategoria_id: event.target.value })}
              disabled={!form.categoria_id}
            >
              <option value="">Selecione uma subcategoria...</option>
              {subcategorias.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.nome}
                </option>
              ))}
            </Select>
          </label>
        )}

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Valor planejado no mes</span>
          <MoneyInput value={form.valor_orcado} onChange={(event) => setForm({ ...form, valor_orcado: event.target.value })} required />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Recorrencia</span>
          <Select value={form.escopo} onChange={(event) => setForm({ ...form, escopo: event.target.value })}>
            <option value="SOMENTE_ESTE_MES">Apenas neste mes</option>
            <option value="DESTE_MES_EM_DIANTE">Deste mes em diante</option>
          </Select>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={adicionarMutation.isPending}>
            {adicionarMutation.isPending ? "Adicionando..." : "Adicionar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
