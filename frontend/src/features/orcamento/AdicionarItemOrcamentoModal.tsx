import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Select } from "../../components/ui/select";
import { api } from "../../lib/api";
import { INVESTMENT_TYPE_OPTIONS } from "../../lib/investmentProfiles";
import type { Categoria, NaturezaCategoria, Subcategoria, TipoAtivo, TipoItemOrcamento } from "../../lib/types";

const INVESTMENT_CATEGORY_NAME = "Investimentos";

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function investmentOptionValue(tipo: TipoAtivo) {
  return `tipo:${tipo}`;
}

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

  const categoriaInvestimentos = useMemo(() => {
    const categorias = categoriasQuery.data ?? [];
    return (
      categorias.find((categoria) => normalizeName(categoria.nome) === normalizeName(INVESTMENT_CATEGORY_NAME)) ??
      categorias.find((categoria) => categoria.natureza === "INVESTIMENTO")
    );
  }, [categoriasQuery.data]);

  const categoriaSubcategoriasId = form.natureza === "INVESTIMENTO" ? categoriaInvestimentos?.id ?? form.categoria_id : form.categoria_id;

  const subcategoriasQuery = useQuery({
    queryKey: ["subcategorias", categoriaSubcategoriasId],
    queryFn: () => api.subcategorias(categoriaSubcategoriasId),
    enabled: !!categoriaSubcategoriasId,
  });

  const criarCategoriaMutation = useMutation({
    mutationFn: (payload: { nome: string; natureza: NaturezaCategoria }) => api.criarCategoria(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categorias"] }),
  });

  const criarSubcategoriaMutation = useMutation({
    mutationFn: (payload: { nome: string; categoria_id: string }) => api.criarSubcategoria(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subcategorias"] }),
  });

  const investmentOptions = useMemo(() => {
    const subcategorias = subcategoriasQuery.data ?? [];
    const options = INVESTMENT_TYPE_OPTIONS.map((option) => {
      const existing = subcategorias.find((subcategoria) => normalizeName(subcategoria.nome) === normalizeName(option.label));
      return {
        label: option.label,
        value: existing?.id ?? investmentOptionValue(option.value),
      };
    });
    const selectedExisting = subcategorias.find((subcategoria) => subcategoria.id === form.subcategoria_id);
    if (selectedExisting && !options.some((option) => option.value === selectedExisting.id)) {
      options.push({ label: selectedExisting.nome, value: selectedExisting.id });
    }
    return options;
  }, [form.subcategoria_id, subcategoriasQuery.data]);

  const adicionarMutation = useMutation({
    mutationFn: async () => {
      const categoriaSubcategoria =
        form.natureza === "INVESTIMENTO" ? await resolveInvestmentCategoryAndSubcategory() : { categoria_id: form.categoria_id, subcategoria_id: form.subcategoria_id };

      return api.adicionarItemOrcamento({
        ano,
        mes,
        tipo_item: form.natureza === "INVESTIMENTO" ? "SUBCATEGORIA" : form.tipo_item,
        natureza: form.natureza,
        categoria_id: categoriaSubcategoria.categoria_id,
        subcategoria_id: form.natureza === "INVESTIMENTO" || form.tipo_item === "SUBCATEGORIA" ? categoriaSubcategoria.subcategoria_id : null,
        valor_orcado: Number(form.valor_orcado),
        escopo: form.escopo,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
      onSuccess();
    },
  });

  async function ensureInvestmentCategory(): Promise<Categoria> {
    if (categoriaInvestimentos) return categoriaInvestimentos;
    const categoria = await criarCategoriaMutation.mutateAsync({ nome: INVESTMENT_CATEGORY_NAME, natureza: "INVESTIMENTO" });
    await queryClient.invalidateQueries({ queryKey: ["categorias"] });
    return categoria;
  }

  async function ensureInvestmentSubcategory(categoria: Categoria): Promise<Subcategoria> {
    const selected = form.subcategoria_id;
    const selectedExisting = (subcategoriasQuery.data ?? []).find((subcategoria) => subcategoria.id === selected);
    if (selectedExisting) return selectedExisting;

    const selectedType = INVESTMENT_TYPE_OPTIONS.find((option) => investmentOptionValue(option.value) === selected);
    if (!selectedType) throw new Error("Selecione um tipo de investimento.");

    const existing = (subcategoriasQuery.data ?? []).find((subcategoria) => normalizeName(subcategoria.nome) === normalizeName(selectedType.label));
    if (existing) return existing;

    const subcategoria = await criarSubcategoriaMutation.mutateAsync({ nome: selectedType.label, categoria_id: categoria.id });
    await queryClient.invalidateQueries({ queryKey: ["subcategorias"] });
    return subcategoria;
  }

  async function resolveInvestmentCategoryAndSubcategory() {
    const categoria = await ensureInvestmentCategory();
    const subcategoria = await ensureInvestmentSubcategory(categoria);
    return { categoria_id: categoria.id, subcategoria_id: subcategoria.id };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.natureza === "INVESTIMENTO" && !form.subcategoria_id) {
      alert("Selecione um tipo de investimento.");
      return;
    }
    if (!form.categoria_id || !form.valor_orcado) {
      if (form.natureza === "INVESTIMENTO" && form.valor_orcado) {
        await adicionarMutation.mutateAsync();
        return;
      }
      alert("Preencha categoria e valor planejado.");
      return;
    }
    if (form.tipo_item === "SUBCATEGORIA" && !form.subcategoria_id) {
      alert("Selecione uma subcategoria.");
      return;
    }
    await adicionarMutation.mutateAsync();
  }

  const subcategorias = categoriaSubcategoriasId ? subcategoriasQuery.data ?? [] : [];
  const isInvestmentPlanning = form.natureza === "INVESTIMENTO";

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
                tipo_item: event.target.value === "INVESTIMENTO" ? "SUBCATEGORIA" : form.tipo_item,
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

        {!isInvestmentPlanning && (
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
        )}

        {isInvestmentPlanning ? (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Tipo de investimento</span>
            <Select
              value={form.subcategoria_id}
              onChange={(event) =>
                setForm({
                  ...form,
                  categoria_id: categoriaInvestimentos?.id ?? "",
                  subcategoria_id: event.target.value,
                  tipo_item: "SUBCATEGORIA",
                })
              }
            >
              <option value="">Selecione um tipo...</option>
              {investmentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        ) : (
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
        )}

        {!isInvestmentPlanning && form.tipo_item === "SUBCATEGORIA" && (
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
