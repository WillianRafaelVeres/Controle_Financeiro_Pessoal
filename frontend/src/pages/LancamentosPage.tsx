import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Plus } from "lucide-react";
import { useState } from "react";

import { MonthSelector } from "../components/finance/MonthSelector";
import { SectionCard } from "../components/finance/SectionCard";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Select } from "../components/ui/select";
import { EditarLancamentoModal } from "../features/lancamentos/EditarLancamentoModal";
import { api } from "../lib/api";
import type { Lancamento } from "../lib/types";
import { currentMonth } from "../lib/utils";
import { LancamentoForm } from "../features/lancamentos/LancamentoForm";
import { LancamentosTable } from "../features/lancamentos/LancamentosTable";

export function LancamentosPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lancamento | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState("");
  const categorias = useQuery({ queryKey: ["categorias", "all"], queryFn: () => api.categorias(undefined, true) });
  const subcategorias = useQuery({ queryKey: ["subcategorias", "all"], queryFn: () => api.subcategorias(undefined, true) });
  const metodos = useQuery({ queryKey: ["metodos"], queryFn: api.metodos });
  const cartoes = useQuery({ queryKey: ["cartoes"], queryFn: api.cartoes });
  const lancamentos = useQuery({ queryKey: ["lancamentos", month], queryFn: () => api.lancamentos(month.ano, month.mes) });
  const criar = useMutation({ mutationFn: api.criarLancamento, onSuccess: () => queryClient.invalidateQueries() });
  const atualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.atualizarLancamento(id, payload),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const excluir = useMutation({ mutationFn: api.excluirLancamento, onSuccess: () => queryClient.invalidateQueries() });
  const criarContaFutura = useMutation({ mutationFn: api.criarContaFutura, onSuccess: () => queryClient.invalidateQueries() });
  const criarCategoria = useMutation({ mutationFn: api.criarCategoria, onSuccess: () => queryClient.invalidateQueries() });
  const criarSubcategoria = useMutation({ mutationFn: api.criarSubcategoria, onSuccess: () => queryClient.invalidateQueries() });
  const criarMetodo = useMutation({ mutationFn: api.criarMetodo, onSuccess: () => queryClient.invalidateQueries() });

  const filtrados = (lancamentos.data ?? []).filter((item) => !tipoFiltro || item.tipo === tipoFiltro);

  return (
    <div className="space-y-2">
      <SectionCard
        title="Operação"
        description="Lançamentos usam filtros locais. A data é automática e pode ser alterada dentro do formulário."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo lançamento
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <MonthSelector ano={month.ano} mes={month.mes} onChange={setMonth} />
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Filter className="h-4 w-4" />
            Filtros
          </div>
          <div className="w-44">
            <Select value={tipoFiltro} onChange={(event) => setTipoFiltro(event.target.value)}>
              <option value="">Todos os tipos</option>
              <option value="GASTO">Gasto</option>
              <option value="RECEITA">Receita</option>
              <option value="INVESTIMENTO">Investimento</option>
            </Select>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Histórico do período">
        <LancamentosTable
          lancamentos={filtrados}
          categorias={categorias.data ?? []}
          subcategorias={subcategorias.data ?? []}
          metodos={metodos.data ?? []}
          onEdit={setEditing}
          onDelete={(lancamento) => {
            if (window.confirm("Excluir este lancamento?")) excluir.mutate(lancamento.id);
          }}
        />
      </SectionCard>
      <EditarLancamentoModal
        lancamento={editing}
        categorias={categorias.data ?? []}
        subcategorias={subcategorias.data ?? []}
        metodos={metodos.data ?? []}
        onClose={() => setEditing(null)}
        onSubmit={async (id, payload) => {
          await atualizar.mutateAsync({ id, payload });
        }}
      />
      <Dialog open={open} title="Novo lançamento" onClose={() => setOpen(false)} className="max-w-6xl">
        <LancamentoForm
          categorias={categorias.data ?? []}
          subcategorias={subcategorias.data ?? []}
          metodos={metodos.data ?? []}
          cartoes={cartoes.data ?? []}
          onSubmit={async (payload) => {
            await criar.mutateAsync(payload);
            setOpen(false);
          }}
          onCreateContaFutura={async (payload) => {
            await criarContaFutura.mutateAsync(payload);
            setOpen(false);
          }}
          onCreateCategoria={async (nome, natureza) => {
            const categoria = await criarCategoria.mutateAsync({ nome, natureza });
            return { id: categoria.id, label: categoria.nome };
          }}
          onCreateSubcategoria={async (nome, categoria_id) => {
            const subcategoria = await criarSubcategoria.mutateAsync({ nome, categoria_id });
            return { id: subcategoria.id, label: subcategoria.nome };
          }}
          onCreateMetodo={async (nome) => {
            const metodo = await criarMetodo.mutateAsync({ nome });
            return { id: metodo.id, label: metodo.nome };
          }}
        />
      </Dialog>
    </div>
  );
}
